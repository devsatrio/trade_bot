from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import sqlite3
import os
import pandas as pd
import numpy as np
import time
import requests
from datetime import datetime

# Auto-initialize database on startup
try:
    from init_db import init_db
    init_db()
except Exception as e:
    print(f"Failed to auto-init DB: {e}")

app = FastAPI()

DB_PATH = os.environ.get("DATABASE_URL", "/app/data/trading_bot.db")

def send_telegram_notification(message):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM bot_settings WHERE key IN ('telegram_bot_token', 'telegram_chat_id', 'telegram_enabled')")
        settings = dict(cursor.fetchall())
        conn.close()
        
        if settings.get('telegram_enabled') == 'true' and settings.get('telegram_bot_token') and settings.get('telegram_chat_id'):
            token = settings['telegram_bot_token']
            chat_id = settings['telegram_chat_id']
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            requests.post(url, json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"}, timeout=5)
    except Exception as e:
        print(f"Error sending telegram message: {e}")

class MarketData(BaseModel):
    symbol: str
    price: float
    volume: float
    timestamp: int

@app.get("/")
def read_root():
    return {"status": "Engine is running"}

# ==========================================
# HISTORY & STRATEGY ENGINE
# ==========================================

class HistoryManager:
    def __init__(self, max_len=200):
        self.data = {} # symbol -> list of ticks
        self.candles = {} # symbol -> df of OHLCV
        self.max_len = max_len
        self.syncing = set()

    def sync_history(self, symbol):
        if symbol in self.syncing or symbol in self.candles:
            return
        self.syncing.add(symbol)
        import json
        from urllib import request
        try:
            print(f"Syncing history for {symbol}...")
            payload = {
                "type": "candleSnapshot",
                "req": {
                    "coin": symbol,
                    "interval": "1m",
                    "startTime": int((time.time() - 4 * 3600) * 1000)
                }
            }
            req = request.Request(
                "https://api.hyperliquid.xyz/info",
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            with request.urlopen(req) as res:
                data = json.loads(res.read().decode('utf-8'))
            
            if data and isinstance(data, list):
                history = []
                for c in data:
                    history.append({
                        "dt": pd.to_datetime(c['t'], unit='ms'),
                        "open": float(c['o']),
                        "high": float(c['h']),
                        "low": float(c['l']),
                        "close": float(c['c']),
                        "volume": float(c['v'])
                    })
                
                df = pd.DataFrame(history)
                df.set_index('dt', inplace=True)
                self.candles[symbol] = df
                print(f"Successfully synced {len(df)} candles for {symbol}. Warmup complete!")
        except Exception as e:
            print(f"Failed to sync history: {e}")

    def add_tick(self, symbol, price, volume, timestamp):
        if symbol not in self.data or symbol not in self.candles:
            self.data[symbol] = []
            self.sync_history(symbol)
        
        self.data[symbol].append({
            "price": price,
            "volume": volume,
            "timestamp": timestamp
        })
        
        if len(self.data[symbol]) > 2000:
            self.data[symbol] = self.data[symbol][-2000:]
            
        ticks_df = pd.DataFrame(self.data[symbol])
        ticks_df['dt'] = pd.to_datetime(ticks_df['timestamp'], unit='ms')
        ticks_df.set_index('dt', inplace=True)
        
        # Aggregate ticks to candles
        ohlcv = ticks_df['price'].resample('1Min').ohlc()
        ohlcv['volume'] = ticks_df['volume'].resample('1Min').sum()
        
        # Merge with history
        if symbol in self.candles:
            # Combine history and current ticks, drop duplicates (prioritizing newer data)
            combined = pd.concat([self.candles[symbol], ohlcv])
            # Remove any overlapping indices
            combined = combined[~combined.index.duplicated(keep='last')]
            self.candles[symbol] = combined.tail(self.max_len)
        else:
            self.candles[symbol] = ohlcv
            
        return self.candles[symbol]

history_manager = HistoryManager()

def calculate_rss(df):
    if len(df) < 65: # Need enough data for SMA 60
        return "HOLD", 0, {}

    # Inputs (Hardcoded from user's Pine Script defaults)
    momLen = 9
    volLen = 20
    diLen = 14
    adxLen = 14
    smoothLen = 8
    smaFast = 30
    smaSlow = 60
    strThr = 1.0
    adxMin = 14.0
    volMin = 1.2

    # Calculations
    # Momentum (ROC)
    df['mom'] = df['close'].pct_change(momLen) * 100
    
    # Volume Ratio
    df['volMA'] = df['volume'].rolling(volLen).mean()
    df['volRatio'] = df['volume'] / df['volMA']
    
    # DMI/ADX (Simplified approximation since we might have low volatility in resampled data)
    df['up'] = df['high'].diff()
    df['down'] = -df['low'].diff()
    
    df['plusDM'] = np.where((df['up'] > df['down']) & (df['up'] > 0), df['up'], 0)
    df['minusDM'] = np.where((df['down'] > df['up']) & (df['down'] > 0), df['down'], 0)
    
    # True Range
    df['tr'] = np.maximum(df['high'] - df['low'], 
                np.maximum(abs(df['high'] - df['close'].shift(1)), 
                          abs(df['low'] - df['close'].shift(1))))
    
    df['tr_smooth'] = df['tr'].rolling(diLen).sum()
    df['plusDI'] = 100 * (df['plusDM'].rolling(diLen).sum() / df['tr_smooth'])
    df['minusDI'] = 100 * (df['minusDM'].rolling(diLen).sum() / df['tr_smooth'])
    
    df['dx'] = 100 * abs(df['plusDI'] - df['minusDI']) / (df['plusDI'] + df['minusDI'])
    df['adx'] = df['dx'].rolling(adxLen).mean()
    
    # Strength
    df['adxBoost'] = df['adx'] / 20.0
    df['rawStr'] = df['mom'] * np.maximum(df['volRatio'], 0.3) * np.maximum(df['adxBoost'], 0.3)
    df['strength'] = df['rawStr'].ewm(span=smoothLen).mean()
    
    # Trend Filter
    df['fastMA'] = df['close'].rolling(smaFast).mean()
    df['slowMA'] = df['close'].rolling(smaSlow).mean()
    
    # Current values
    curr = df.iloc[-1]
    prev = df.iloc[-2]
    
    bullDir = curr['plusDI'] > curr['minusDI']
    bearDir = curr['minusDI'] > curr['plusDI']
    strongAdx = curr['adx'] >= adxMin
    strongVol = curr['volRatio'] >= volMin
    uptrend = curr['fastMA'] > curr['slowMA']
    downtrend = curr['fastMA'] < curr['slowMA']
    
    # Signal Logic
    longSig = (curr['strength'] > strThr and strongAdx and strongVol and 
               bullDir and curr['strength'] > prev['strength'] and uptrend)
               
    shortSig = (curr['strength'] < -strThr and strongAdx and strongVol and 
                bearDir and curr['strength'] < prev['strength'] and downtrend)
    
    if longSig: return "LONG", 0.9, curr.to_dict()
    if shortSig: return "SHORT", 0.9, curr.to_dict()
    
    return "HOLD", 0.5, curr.to_dict()

def calculate_confirmed_fib(df):
    if len(df) < 50:
        return "HOLD", 0, {"reason": "Waiting for data"}

    pivotLen = 8
    displacementATR = 1.5
    
    # ATR for displacement
    df['tr'] = np.maximum(df['high'] - df['low'], 
                np.maximum(abs(df['high'] - df['close'].shift(1)), 
                          abs(df['low'] - df['close'].shift(1))))
    df['atr'] = df['tr'].rolling(14).mean()
    atr = df['atr'].iloc[-1]

    # Simple Pivot Detection (Fast Draw logic simplified)
    def is_pivot_high(i):
        if i < pivotLen or i >= len(df) - pivotLen: return False
        val = df['high'].iloc[i]
        for j in range(i-pivotLen, i+pivotLen+1):
            if df['high'].iloc[j] > val: return False
        return True

    def is_pivot_low(i):
        if i < pivotLen or i >= len(df) - pivotLen: return False
        val = df['low'].iloc[i]
        for j in range(i-pivotLen, i+pivotLen+1):
            if df['low'].iloc[j] < val: return False
        return True

    pivots_hi = []
    pivots_lo = []
    for i in range(pivotLen, len(df) - pivotLen):
        if is_pivot_high(i): pivots_hi.append((i, df['high'].iloc[i]))
        if is_pivot_low(i): pivots_lo.append((i, df['low'].iloc[i]))

    if not pivots_hi or not pivots_lo:
        return "HOLD", 0, {"reason": "No pivots found"}

    last_hi_idx, last_hi_val = pivots_hi[-1]
    last_lo_idx, last_lo_val = pivots_lo[-1]
    
    curr_price = df['close'].iloc[-1]
    
    # BULLISH BOS: Current High > Last Pivot High
    # We check if a Break of Structure happened recently
    # Simplified logic: if price is between 0.618 and 0.786 of the last major leg
    
    # Bull Leg: from a low pivot to a high pivot that broke previous high
    if len(pivots_hi) >= 2:
        prior_hi_idx, prior_hi_val = pivots_hi[-2]
        if last_hi_val > prior_hi_val: # BOS detected
            # Leg is from the low between these two highs
            leg_lo = df['low'].iloc[prior_hi_idx:last_hi_idx].min()
            rng = last_hi_val - leg_lo
            if rng >= displacementATR * atr:
                fib618 = last_hi_val - rng * 0.618
                fib786 = last_hi_val - rng * 0.786
                if curr_price <= fib618 and curr_price >= fib786:
                    return "LONG", 0.85, {"fib618": fib618, "fib786": fib786, "type": "Golden Zone Bull"}

    # BEARISH BOS: Current Low < Last Pivot Low
    if len(pivots_lo) >= 2:
        prior_lo_idx, prior_lo_val = pivots_lo[-2]
        if last_lo_val < prior_lo_val: # BOS detected
            # Leg is from the high between these two lows
            leg_hi = df['high'].iloc[prior_lo_idx:last_lo_idx].max()
            rng = leg_hi - last_lo_val
            if rng >= displacementATR * atr:
                fib618 = last_lo_val + rng * 0.618
                fib786 = last_lo_val + rng * 0.786
                if curr_price >= fib618 and curr_price <= fib786:
                    return "SHORT", 0.85, {"fib618": fib618, "fib786": fib786, "type": "Golden Zone Bear"}

    return "HOLD", 0, {"reason": "No Fibonacci signal"}

def calculate_rapid_scalper(df):
    if len(df) < 10:
        return "HOLD", 0, {"status": "warming_up"}
    
    # Calculate Hyper-Aggressive EMA 2 and Fast EMA 5
    df = df.copy()
    df['ema2'] = df['close'].ewm(span=2, adjust=False).mean()
    df['ema5'] = df['close'].ewm(span=5, adjust=False).mean()
    
    last = df.iloc[-1]
    prev = df.iloc[-2]
    
    # LONG: EMA 2 crosses UP EMA 5
    if prev['ema2'] <= prev['ema5'] and last['ema2'] > last['ema5']:
        return "LONG", 0.98, {"ema2": last['ema2'], "ema5": last['ema5'], "type": "HYPER_CROSS_UP"}
    
    # SHORT: EMA 2 crosses DOWN EMA 5
    elif prev['ema2'] >= prev['ema5'] and last['ema2'] < last['ema5']:
        return "SHORT", 0.98, {"ema2": last['ema2'], "ema5": last['ema5'], "type": "HYPER_CROSS_DOWN"}
    
    return "HOLD", 0.5, {"ema2": last['ema2'], "ema5": last['ema5']}

@app.post("/analyze")
def analyze_market_data(data: MarketData):
    # Add tick and get candles
    candles_df = history_manager.add_tick(data.symbol, data.price, data.volume, data.timestamp)
    
    decision = "HOLD"
    confidence = 0.0
    metadata = {}
    trade_id_to_close = None
    auto_trade = False
    settings = {}
    
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Read settings
        cursor.execute("SELECT key, value FROM bot_settings")
        settings = {row["key"]: row["value"] for row in cursor.fetchall()}
        
        strategy_type = settings.get("strategy_type", "manual")
        auto_trade = settings.get("auto_trade", "false") == "true"
        sl_usd = float(settings.get("stop_loss_usd", "10.0"))
        tp_usd = float(settings.get("take_profit_usd", "20.0"))
        
        # 1. CHECK FOR SL/TP ON OPEN TRADES (Paper & Live)
        cursor.execute("SELECT * FROM trades WHERE status = 'OPEN'")
        open_trades = [dict(row) for row in cursor.fetchall()]
        
        for trade in open_trades:
            entry_price = trade["price"]
            size = trade["size"]
            side = trade["side"]
            trade_mode = trade.get("mode", "paper")
            
            # Calculate PnL in USD
            if side == "LONG":
                pnl_usd = (data.price - entry_price) * size
            else:
                pnl_usd = (entry_price - data.price) * size
                
            if pnl_usd <= -sl_usd or pnl_usd >= tp_usd:
                decision = "CLOSE"
                trade_id_to_close = trade["id"]
                trade_cost = entry_price * size
                trade_leverage = int(trade.get('leverage') or 1)
                pnl_pct = (pnl_usd / trade_cost) * 100 * trade_leverage if trade_cost > 0 else 0
                metadata = {
                    "reason": "SL" if pnl_usd <= -sl_usd else "TP", 
                    "pnl_usd": pnl_usd, 
                    "pnl_pct": pnl_pct,
                    "mode": trade_mode,
                    "close_side": side,
                    "close_size": size
                }
                break # Close one at a time for safety
        
        # 2. IF NO CLOSE ACTION, CHECK FOR NEW SIGNALS
        if decision == "HOLD":
            if strategy_type == "real_strength_scalper":
                decision, confidence, metadata = calculate_rss(candles_df)
            elif strategy_type == "confirmed_fibonacci":
                decision, confidence, metadata = calculate_confirmed_fib(candles_df)
            elif strategy_type == "rapid_scalper":
                decision, confidence, metadata = calculate_rapid_scalper(candles_df)
            
            if decision != "HOLD":
                # Check total open positions limit across all symbols
                cursor.execute("SELECT COUNT(*) as cnt FROM trades WHERE status = 'OPEN'")
                total_open = cursor.fetchone()["cnt"]
                max_open = int(settings.get("max_open_positions", "3"))
                
                if total_open >= max_open:
                    decision = "HOLD"
                    metadata = {"status": "skipped", "reason": f"Max open positions reached ({max_open})"}
                else:
                    # Enforce One-Way Mode: Ensure no open positions exist for this symbol
                    cursor.execute("SELECT COUNT(*) as cnt FROM trades WHERE status = 'OPEN' AND (symbol = ? OR symbol = ?)", (data.symbol + "/USD", data.symbol))
                    symbol_open = cursor.fetchone()["cnt"]
                    if symbol_open > 0:
                        decision = "HOLD"
                        metadata = {"status": "skipped", "reason": f"Active position exists for {data.symbol}"}
                    else:
                        # Tick spam protection: Ensure we don't open multiple trades for the same symbol & side within the last 60 seconds
                        cursor.execute(
                            "SELECT timestamp FROM trades WHERE (symbol = ? OR symbol = ?) AND side = ? ORDER BY id DESC LIMIT 1",
                            (data.symbol + "/USD", data.symbol, decision)
                        )
                        last_trade = cursor.fetchone()
                        if last_trade:
                            from datetime import datetime, timezone
                            try:
                                # SQLite CURRENT_TIMESTAMP is UTC
                                last_time_str = last_trade["timestamp"]
                                last_time = datetime.strptime(last_time_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                                now_utc = datetime.now(timezone.utc)
                                elapsed = (now_utc - last_time).total_seconds()
                                
                                if elapsed < 60:
                                    decision = "HOLD"
                                    metadata = {"status": "skipped", "reason": f"Tick cooldown active. {int(elapsed)}s elapsed < 60s"}
                            except Exception as dt_err:
                                print(f"Error parsing trade timestamp: {dt_err}")
        
        # Save signal log
        cursor.execute(
            "INSERT INTO signals (symbol, signal, confidence, metadata) VALUES (?, ?, ?, ?)",
            (data.symbol, decision, confidence, str(metadata))
        )
        conn.commit()
    except Exception as e:
        print(f"Analysis error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

    # Calculate recommended size based on settings (Order Size * Leverage / Price) ala Binance
    max_pos = float(settings.get("max_position_size", "100"))
    leverage = float(settings.get("leverage", "1"))
    btc_size = round((max_pos * leverage) / data.price, 6)

    return {
        "symbol": data.symbol,
        "decision": decision,
        "price": data.price,
        "size": btc_size,
        "trade_id": trade_id_to_close,
        "auto_trade": auto_trade,
        "execution_mode": settings.get("execution_mode", "paper"),
        "network": settings.get("network", "testnet"),
        "gas_fee": settings.get("gas_fee", "0.01"),
        "metadata": metadata,
        "candles_collected": len(candles_df) if candles_df is not None else 0
    }

# ==========================================
# PAPER TRADING SYSTEM
# ==========================================

class PaperTradeData(BaseModel):
    symbol: str
    side: str
    price: float
    size: float

class CloseTradeData(BaseModel):
    trade_id: int
    close_price: float

@app.post("/paper-trade")
def execute_paper_trade(data: PaperTradeData):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Read settings
        cursor.execute("SELECT key, value FROM bot_settings")
        settings = {row["key"]: row["value"] for row in cursor.fetchall()}
        
        max_size_usd = float(settings.get("max_position_size", "1000"))
        max_open = int(settings.get("max_open_positions", "3"))
        leverage = float(settings.get("leverage", "1"))
        stop_loss_usd = float(settings.get("stop_loss_usd", "10"))
        take_profit_usd = float(settings.get("take_profit_usd", "20"))
        
        # Enforce max position size (in USD value) with 0.5% tolerance for rounding
        usd_value = data.price * data.size
        max_exposure = max_size_usd * leverage
        if usd_value > max_exposure * 1.005:
            raise HTTPException(status_code=400, detail=f"Nominal melebihi batas. Max: ${max_exposure:,.2f}, Anda: ${usd_value:,.2f}")
        
        # Enforce max open positions limit
        cursor.execute("SELECT COUNT(*) as cnt FROM trades WHERE status = 'OPEN'")
        total_open = cursor.fetchone()["cnt"]
        if total_open >= max_open:
            raise HTTPException(status_code=400, detail=f"Gagal: Jumlah open posisi mencapai batas maksimum ({max_open}).")
        
        # Enforce One-Way Mode: Ensure no open positions exist for this symbol
        cursor.execute("SELECT COUNT(*) as cnt FROM trades WHERE status = 'OPEN' AND (symbol = ? OR symbol = ?)", (data.symbol + "/USD", data.symbol))
        symbol_open = cursor.fetchone()["cnt"]
        if symbol_open > 0:
            raise HTTPException(status_code=400, detail=f"Gagal: Anda sudah memiliki posisi terbuka untuk {data.symbol}. Harap tutup posisi tersebut sebelum membuka yang baru.")        
        # With leverage, margin required = (price * size) / leverage
        gas_fee = float(settings.get("gas_fee", "0.01"))
        margin = (data.price * data.size) / leverage
        
        cursor.execute("SELECT balance FROM paper_account WHERE id = 1")
        row = cursor.fetchone()
        if not row:
            raise Exception("Paper account not initialized")
        current_balance = row["balance"]
        
        total_cost = margin + gas_fee
        if current_balance < total_cost:
            raise HTTPException(status_code=400, detail=f"Saldo tidak cukup. Butuh ${total_cost:.2f} (Margin+Gas), tersisa ${current_balance:.2f}")
            
        new_balance = current_balance - total_cost
        cursor.execute("UPDATE paper_account SET balance = ? WHERE id = 1", (new_balance,))
        
        # Calculate SL/TP prices based on USD
        if data.side == "LONG":
            sl_price = data.price - (stop_loss_usd / data.size) if data.size > 0 else data.price
            tp_price = data.price + (take_profit_usd / data.size) if data.size > 0 else data.price
        else:
            sl_price = data.price + (stop_loss_usd / data.size) if data.size > 0 else data.price
            tp_price = data.price - (take_profit_usd / data.size) if data.size > 0 else data.price
        
        cursor.execute(
            "INSERT INTO trades (symbol, side, price, size, tx_hash, status, fee, strategy, mode, leverage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (data.symbol, data.side, data.price, data.size, "PAPER_TRADE", "OPEN", gas_fee, settings.get("strategy_type", "manual"), "paper", int(leverage))
        )
        trade_id = cursor.lastrowid
        conn.commit()
        
        # Notify Telegram (Open)
        size_usd = data.size * data.price
        msg = f"🚀 <b>OPEN POSITION (PAPER)</b>\n\n" \
              f"🪙 <b>Symbol:</b> {data.symbol}\n" \
              f"↕️ <b>Side:</b> {data.side}\n" \
              f"💰 <b>Entry:</b> ${data.price:,.2f}\n" \
              f"📦 <b>Size:</b> ${size_usd:,.2f} USD ({data.size} {data.symbol.split('/')[0]})\n" \
              f"⛽ <b>Gas Fee:</b> ${gas_fee:.4f}\n" \
              f"------------------------\n" \
              f"🎯 <b>TP:</b> ${tp_price:,.2f}\n" \
              f"🛑 <b>SL:</b> ${sl_price:,.2f}"
        send_telegram_notification(msg)
        
        msg_resp = f"{data.side} {data.size} {data.symbol.split('/')[0]} @ ${data.price:,.2f} | Leverage: {leverage}x | Margin: ${margin:,.2f} | SL: ${sl_price:,.2f} | TP: ${tp_price:,.2f}"
        return {"status": "success", "message": msg_resp, "trade_id": trade_id, "new_balance": new_balance, "sl_price": sl_price, "tp_price": tp_price}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

@app.post("/paper-close")
def close_paper_trade(data: CloseTradeData):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get the trade
        cursor.execute("SELECT * FROM trades WHERE id = ? AND status = 'OPEN'", (data.trade_id,))
        trade = cursor.fetchone()
        
        if not trade:
            raise HTTPException(status_code=404, detail="Trade tidak ditemukan atau sudah ditutup")
        
        trade = dict(trade)
        entry_price = trade["price"]
        size = trade["size"]
        side = trade["side"]
        trade_mode = trade.get("mode", "paper")
        funding_fee = float(trade.get("funding_fee") or 0.0)
        
        # Calculate PnL
        if side == "LONG":
            pnl = (data.close_price - entry_price) * size
        else:  # SHORT
            pnl = (entry_price - data.close_price) * size
        
        new_balance = 0.0
        if trade_mode == "paper":
            # Return the actual margin (entry cost / leverage) + PnL to balance
            leverage = float(trade.get("leverage") or 1.0)
            cost_returned = ((entry_price * size) / leverage) + pnl
            cursor.execute("SELECT balance FROM paper_account WHERE id = 1")
            current_balance = cursor.fetchone()["balance"]
            new_balance = current_balance + cost_returned
            
            # Update balance
            cursor.execute("UPDATE paper_account SET balance = ? WHERE id = 1", (new_balance,))
        
        # Update trade as closed
        cursor.execute(
            "UPDATE trades SET status = 'CLOSED', close_price = ?, pnl = ?, closed_at = datetime('now') WHERE id = ?",
            (data.close_price, pnl, data.trade_id)
        )
        
        conn.commit()
        
        # Notify Telegram (Close)
        net_pnl = pnl - funding_fee
        is_profit = net_pnl >= 0
        pnl_emoji = "🟢 PROFIT" if is_profit else "🔴 LOSS"
        size_usd = size * entry_price
        msg = f"{'💰' if is_profit else '📉'} <b>CLOSE POSITION ({trade_mode.upper()})</b>\n\n" \
              f"🪙 <b>Symbol:</b> {trade['symbol']}\n" \
              f"↕️ <b>Side:</b> {side}\n" \
              f"------------------------\n" \
              f"💰 <b>Entry:</b> ${entry_price:,.2f}\n" \
              f"📦 <b>Size:</b> ${size_usd:,.2f} USD ({size} {trade['symbol'].split('/')[0]})\n" \
              f"------------------------\n" \
              f"📊 <b>Result:</b> {pnl_emoji}\n" \
              f"💵 <b>Gross PnL:</b> <b>${pnl:,.2f}</b>\n"
        if funding_fee != 0:
            msg += f"💸 <b>Funding Fee:</b> <b>${funding_fee:+,.4f}</b>\n" \
                   f"💰 <b>Net PnL:</b> <b>${net_pnl:,.2f}</b>"
        else:
            msg += f"💵 <b>Net PnL:</b> <b>${pnl:,.2f}</b>"
        send_telegram_notification(msg)
        
        pnl_label = f"+${net_pnl:,.2f}" if net_pnl >= 0 else f"-${abs(net_pnl):,.2f}"
        
        return {
            "status": "success",
            "message": f"Closed {side} @ ${data.close_price:,.2f} | PnL: {pnl_label}",
            "pnl": net_pnl,
            "gross_pnl": pnl,
            "funding_fee": funding_fee,
            "new_balance": new_balance
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

@app.get("/paper-balance")
def get_paper_balance():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT balance FROM paper_account WHERE id = 1")
        row = cursor.fetchone()
        if not row:
            return {"balance": 10000000.0}
        return {"balance": row[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

@app.get("/paper-trades")
def get_paper_trades():
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM trades WHERE tx_hash = 'PAPER_TRADE' ORDER BY timestamp DESC LIMIT 50")
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

# ==========================================
# BOT SETTINGS
# ==========================================

@app.post("/clear-logs")
def clear_logs():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM trades")
        cursor.execute("DELETE FROM signals")
        cursor.execute("UPDATE paper_account SET balance = 10000000.0 WHERE id = 1")
        conn.commit()
        return {"status": "success", "message": "All logs cleared and balance reset"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

@app.post("/test-telegram")
def test_telegram():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM bot_settings WHERE key IN ('telegram_bot_token', 'telegram_chat_id')")
        settings = dict(cursor.fetchall())
        conn.close()
        
        token = settings.get('telegram_bot_token')
        chat_id = settings.get('telegram_chat_id')
        
        if not token or not chat_id:
            raise HTTPException(status_code=400, detail="Token atau Chat ID belum diisi")
            
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        msg = "🔔 <b>Test Notifikasi</b>\n\nKoneksi bot trading Anda berhasil terhubung!"
        res = requests.post(url, json={"chat_id": chat_id, "text": msg, "parse_mode": "HTML"}, timeout=10)
        
        if res.status_code == 200:
            return {"status": "success", "message": "Pesan test terkirim!"}
        else:
            return {"status": "error", "message": f"Telegram Error: {res.text}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/trades")
def get_all_trades():
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM trades ORDER BY timestamp DESC")
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

@app.get("/trades/{trade_id}")
def get_trade_by_id(trade_id: int):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM trades WHERE id = ?", (trade_id,))
        row = cursor.fetchone()
        return dict(row)
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

@app.get("/signals/latest")
def get_latest_signal():
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM signals ORDER BY id DESC LIMIT 1")
        row = cursor.fetchone()
        if not row:
            return {"success": False, "message": "No signals found"}
        row_dict = dict(row)
        try:
            import json
            row_dict["metadata"] = json.loads(row_dict.get("metadata") or "{}")
        except:
            row_dict["metadata"] = {}
        return {"success": True, "signal": row_dict}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

class LogLiveTradeData(BaseModel):
    symbol: str
    side: str
    price: float
    size: float
    tx_hash: str
    leverage: int

@app.get("/trades/validate-new")
def validate_new_trade(symbol: str = "BTC/USD"):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # 1. Fetch settings
        cursor.execute("SELECT key, value FROM bot_settings")
        settings_rows = cursor.fetchall()
        settings = {r["key"]: r["value"] for r in settings_rows}
        
        max_open = int(settings.get("max_open_positions", "3"))
        
        # 2. Check total open positions
        cursor.execute("SELECT COUNT(*) as cnt FROM trades WHERE status = 'OPEN'")
        total_open = cursor.fetchone()["cnt"]
        if total_open >= max_open:
            return {"allowed": False, "error": f"Gagal: Jumlah open posisi mencapai batas maksimum ({max_open})."}
            
        # 2.5 Enforce One-Way Mode
        base_symbol = symbol.split('/')[0]
        cursor.execute("SELECT COUNT(*) as cnt FROM trades WHERE status = 'OPEN' AND (symbol = ? OR symbol = ?)", (base_symbol + "/USD", base_symbol))
        symbol_open = cursor.fetchone()["cnt"]
        if symbol_open > 0:
            return {"allowed": False, "error": f"Gagal: Anda sudah memiliki posisi terbuka untuk {base_symbol}. Harap tutup posisi tersebut sebelum membuka yang baru."}
            
        # 3. Check sufficient balance (Paper or Live)
        max_size_usd = float(settings.get("max_position_size", "100"))
        leverage = float(settings.get("leverage", "1"))
        gas_fee = float(settings.get("gas_fee", "0.01"))
        required_margin = max_size_usd / leverage
        total_cost = required_margin + gas_fee
        
        execution_mode = settings.get("execution_mode", "paper")
        if execution_mode == "paper":
            cursor.execute("SELECT balance FROM paper_account WHERE id = 1")
            bal_row = cursor.fetchone()
            paper_balance = bal_row["balance"] if bal_row else 0.0
            if paper_balance < total_cost:
                return {
                    "allowed": False, 
                    "error": f"Gagal: Saldo simulasi (Paper) tidak mencukupi. Butuh ${total_cost:.2f} (Margin ${required_margin:.2f} + Gas ${gas_fee:.2f}), sisa saldo ${paper_balance:.2f}."
                }
        else:
            wallet = settings.get("wallet_address", "")
            if wallet:
                live_balance = get_live_balance(wallet, settings.get("network", "testnet"))
                if live_balance < total_cost:
                    return {
                        "allowed": False, 
                        "error": f"Gagal: Saldo real (Live) tidak mencukupi. Butuh ${total_cost:.2f} (Margin ${required_margin:.2f} + Gas ${gas_fee:.2f}), sisa saldo ${live_balance:.2f}."
                    }
            else:
                return {
                    "allowed": False,
                    "error": "Gagal: Alamat wallet belum diatur di menu settings."
                }
            
        # Allowed multiple positions of the same symbol up to max_open_positions limit
        return {"allowed": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

@app.post("/trades/log-live")
def log_live_trade(data: LogLiveTradeData):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO trades (symbol, side, price, size, tx_hash, status, fee, strategy, mode, leverage, timestamp) 
               VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?, 'live', ?, datetime('now'))""",
            (data.symbol, data.side, data.price, data.size, data.tx_hash, 0.01, "manual", data.leverage)
        )
        trade_id = cursor.lastrowid
        conn.commit()
        return {"success": True, "trade_id": trade_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

@app.get("/settings")
def get_settings():
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM bot_settings")
        rows = cursor.fetchall()
        return {row["key"]: row["value"] for row in rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

class SettingsUpdate(BaseModel):
    settings: dict

@app.post("/settings")
def update_settings(data: SettingsUpdate):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        for key, value in data.settings.items():
            cursor.execute("INSERT OR REPLACE INTO bot_settings (key, value) VALUES (?, ?)", (key, str(value)))
        conn.commit()
        return {"status": "success", "message": f"Updated {len(data.settings)} settings"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals():
            conn.close()

# ==========================================
# TELEGRAM BOT COMMANDS SYSTEM
# ==========================================
import threading

def get_latest_price(symbol):
    try:
        coin = symbol.split('/')[0]
        res = requests.post("https://api.hyperliquid.xyz/info", json={"type": "allMids"}, timeout=5)
        if res.status_code == 200:
            mids = res.json()
            if coin in mids:
                return float(mids[coin])
    except Exception as e:
        print(f"Error getting latest price for {symbol} in telegram module: {e}")
    return None

def get_live_balance(wallet_address, network):
    try:
        is_testnet = (network != "mainnet")
        api_url = 'https://api.hyperliquid-testnet.xyz/info' if is_testnet else 'https://api.hyperliquid.xyz/info'
        res = requests.post(api_url, json={"type": "clearinghouseState", "user": wallet_address}, timeout=10)
        if res.status_code == 200:
            data = res.json()
            margin_summary = data.get("marginSummary", {})
            return float(margin_summary.get("accountValue", "0.0"))
    except Exception as e:
        print(f"Error getting live balance in telegram module: {e}")
    return 0.0

def send_telegram_reply(token, chat_id, message):
    try:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        requests.post(url, json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"}, timeout=10)
    except Exception as e:
        print(f"Error sending reply to Telegram: {e}")

def send_positions_report(token, chat_id):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM trades WHERE status = 'OPEN'")
        open_trades = [dict(row) for row in cursor.fetchall()]
        conn.close()
        
        if not open_trades:
            msg = "🪙 <b>Posisi Aktif</b>\n\nTidak ada posisi aktif yang terbuka saat ini."
            send_telegram_reply(token, chat_id, msg)
            return
            
        symbols = list(set([trade['symbol'] for trade in open_trades]))
        prices = {}
        for sym in symbols:
            price = get_latest_price(sym)
            if price:
                prices[sym] = price
                
        msg = f"📊 <b>POSISI AKTIF ({len(open_trades)})</b>\n\n"
        
        for idx, trade in enumerate(open_trades, 1):
            symbol = trade['symbol']
            side = trade['side']
            entry_price = float(trade['price'])
            size = float(trade['size'])
            mode = trade.get('mode', 'paper').upper()
            strategy = trade.get('strategy', 'manual')
            
            side_emoji = "🟢 LONG" if side == "LONG" else "🔴 SHORT"
            
            curr_price = prices.get(symbol)
            pnl_str = ""
            funding_fee = float(trade.get('funding_fee') or 0.0)
            if curr_price:
                trade_cost = entry_price * size
                unrealized_pnl = (curr_price - entry_price) * size if side == "LONG" else (entry_price - curr_price) * size
                trade_leverage = int(trade.get('leverage') or 1)
                pnl_pct = (unrealized_pnl / trade_cost) * 100 * trade_leverage
                pnl_emoji = "🟩" if unrealized_pnl >= 0 else "🟥"
                pnl_str = f"\n{pnl_emoji} <b>Gross PnL:</b> ${unrealized_pnl:+,.2f} ({pnl_pct:+,.2f}%)"
                if funding_fee != 0:
                    funding_emoji = "💸" if funding_fee > 0 else "🎁"
                    pnl_str += f"\n{funding_emoji} <b>Funding Fee:</b> ${funding_fee:+,.4f}"
                    net_pnl = unrealized_pnl - funding_fee
                    net_pnl_emoji = "🟩" if net_pnl >= 0 else "🟥"
                    pnl_str += f"\n{net_pnl_emoji} <b>Net PnL:</b> ${net_pnl:+,.2f}"
                price_str = f"${curr_price:,.2f}"
            else:
                price_str = "Loading..."
                
            size_usd = size * entry_price
            msg += (
                f"{idx}. 🪙 <b>{symbol}</b> ({mode})\n"
                f"↕️ <b>Side:</b> {side_emoji}\n"
                f"📦 <b>Size:</b> ${size_usd:,.2f} USD ({size} BTC)\n"
                f"📥 <b>Entry:</b> ${entry_price:,.2f}\n"
                f"🏷️ <b>Price:</b> {price_str}"
                f"{pnl_str}\n"
                f"🧠 <b>Strategy:</b> {strategy}\n"
                f"------------------------\n"
            )
            
        send_telegram_reply(token, chat_id, msg)
    except Exception as e:
        print(f"Error sending positions report: {e}")
        send_telegram_reply(token, chat_id, f"❌ Terjadi kesalahan saat memuat posisi: {str(e)}")

def send_status_report(token, chat_id):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM bot_settings")
        settings = {row["key"]: row["value"] for row in cursor.fetchall()}
        
        cursor.execute("SELECT balance FROM paper_account WHERE id = 1")
        paper_balance_row = cursor.fetchone()
        paper_balance = paper_balance_row["balance"] if paper_balance_row else 10000000.0
        conn.close()
        
        execution_mode = settings.get("execution_mode", "paper").upper()
        network = settings.get("network", "testnet").upper()
        strategy = settings.get("strategy_type", "manual")
        auto_trade = settings.get("auto_trade", "false") == "true"
        wallet = settings.get("wallet_address", "")
        
        live_balance_str = "Tidak terhubung"
        if wallet:
            live_balance = get_live_balance(wallet, settings.get("network", "testnet"))
            live_balance_str = f"${live_balance:,.2f}"
            
        status_emoji = "🟢 RUNNING" if settings.get("telegram_enabled") == "true" else "🔴 PAUSED"
        auto_trade_emoji = "🤖 ON" if auto_trade else "🖱️ OFF (Manual)"
        
        msg = (
            f"🔔 <b>STATUS BOT TRADING</b>\n\n"
            f"📈 <b>Status Bot:</b> {status_emoji}\n"
            f"🤖 <b>Auto Trade:</b> {auto_trade_emoji}\n"
            f"⚙️ <b>Mode Eksekusi:</b> {execution_mode}\n"
            f"🧪 <b>Jaringan:</b> {network}\n"
            f"🧠 <b>Strategi:</b> {strategy}\n"
            f"------------------------\n"
            f"💵 <b>Saldo Paper:</b> ${paper_balance:,.2f}\n"
            f"💰 <b>Saldo Live:</b> {live_balance_str}\n"
            f"💳 <b>Wallet:</b> <code>{wallet or 'Belum diisi'}</code>"
        )
        send_telegram_reply(token, chat_id, msg)
    except Exception as e:
        print(f"Error sending status report: {e}")
        send_telegram_reply(token, chat_id, f"❌ Terjadi kesalahan saat memuat status: {str(e)}")

def close_all_open_positions(token, chat_id):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM trades WHERE status = 'OPEN'")
        open_trades = [dict(row) for row in cursor.fetchall()]
        conn.close() # Close immediately to release lock!
        
        if not open_trades:
            send_telegram_reply(token, chat_id, "ℹ️ <b>Tidak ada posisi aktif yang terbuka untuk ditutup.</b>")
            return
            
        # Get live prices for the symbols
        symbols = list(set([trade['symbol'] for trade in open_trades]))
        prices = {}
        for sym in symbols:
            price = get_latest_price(sym)
            if price:
                prices[sym] = price
                
        closed_details = []
        total_pnl = 0.0
        
        for trade in open_trades:
            trade_id = trade['id']
            symbol = trade['symbol']
            side = trade['side']
            entry_price = float(trade['price'])
            size = float(trade['size'])
            trade_mode = trade.get('mode', 'paper')
            
            # Use fetched live price, or fallback to entry price if API failed
            close_price = prices.get(symbol, entry_price)
            
            # Calculate PnL
            if side == "LONG":
                pnl = (close_price - entry_price) * size
            else:  # SHORT
                pnl = (entry_price - close_price) * size
                
            trade_leverage = int(trade.get('leverage') or 1)
            pnl_pct = (pnl / (entry_price * size)) * 100 * trade_leverage if (entry_price * size) > 0 else 0.0
            pnl_emoji = "🟩" if pnl >= 0 else "🟥"
            
            if trade_mode == "live":
                # For live trades, we trigger the NextJS API close endpoint!
                try:
                    import requests
                    res = requests.post(
                        "http://web-app:3000/api/paper-close",
                        json={"trade_id": trade_id, "close_price": close_price},
                        timeout=20
                    )
                    if res.status_code == 200:
                        closed_details.append(
                            f"🪙 <b>{symbol}</b> (LIVE {side})\n"
                            f"📥 Entry: ${entry_price:,.2f} | 📤 Close: ${close_price:,.2f}\n"
                            f"{pnl_emoji} PnL: ${pnl:+,.2f} ({pnl_pct:+,.2f}%)\n"
                        )
                        total_pnl += pnl
                    else:
                        detail_msg = "Error"
                        try:
                            detail_msg = res.json().get('detail', 'Error')
                        except:
                            pass
                        closed_details.append(f"❌ <b>{symbol}</b> (LIVE): Gagal close API ({detail_msg})\n")
                except Exception as e:
                    closed_details.append(f"❌ <b>{symbol}</b> (LIVE): Error koneksi ({str(e)})\n")
            else:
                # For paper trades, perform database update in a new connection
                total_pnl += pnl
                trade_leverage = float(trade.get("leverage") or 1.0)
                cost_returned = ((entry_price * size) / trade_leverage) + pnl
                
                try:
                    conn_write = sqlite3.connect(DB_PATH)
                    cursor_write = conn_write.cursor()
                    
                    # Update trade to CLOSED
                    cursor_write.execute(
                        "UPDATE trades SET status = 'CLOSED', close_price = ?, pnl = ?, closed_at = datetime('now') WHERE id = ?",
                        (close_price, pnl, trade_id)
                    )
                    
                    # Read paper balance and add returned funds
                    cursor_write.execute("SELECT balance FROM paper_account WHERE id = 1")
                    row = cursor_write.fetchone()
                    if row:
                        current_balance = row[0]
                        new_balance = current_balance + cost_returned
                        cursor_write.execute("UPDATE paper_account SET balance = ? WHERE id = 1", (new_balance,))
                    
                    conn_write.commit()
                    conn_write.close()
                    
                    closed_details.append(
                        f"🪙 <b>{symbol}</b> (PAPER {side})\n"
                        f"📥 Entry: ${entry_price:,.2f} | 📤 Close: ${close_price:,.2f}\n"
                        f"{pnl_emoji} PnL: ${pnl:+,.2f} ({pnl_pct:+,.2f}%)\n"
                    )
                except Exception as db_err:
                    closed_details.append(f"❌ <b>{symbol}</b> (PAPER): Gagal update DB ({str(db_err)})\n")
            
        # Read final paper balance for reply
        conn_final = sqlite3.connect(DB_PATH)
        cursor_final = conn_final.cursor()
        cursor_final.execute("SELECT balance FROM paper_account WHERE id = 1")
        final_balance = cursor_final.fetchone()[0]
        conn_final.close()
        
        # Format response
        msg = f"🚨 <b>BERHASIL MENUTUP SEMUA POSISI ({len(open_trades)})</b>\n\n"
        msg += "\n".join(closed_details)
        msg += f"\n------------------------\n"
        msg += f"📊 <b>Total Realized PnL:</b> <b>${total_pnl:+,.2f}</b>\n"
        msg += f"💳 <b>Saldo Paper Baru:</b> <b>${final_balance:,.2f}</b>"
        
        send_telegram_reply(token, chat_id, msg)
        
    except Exception as e:
        print(f"Error in close_all_open_positions: {e}")
        send_telegram_reply(token, chat_id, f"❌ Terjadi kesalahan saat menutup seluruh posisi: {str(e)}")

def send_history_report(token, chat_id):
    import sqlite3
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM trades 
            WHERE status = 'CLOSED' 
            ORDER BY closed_at DESC, id DESC 
            LIMIT 20
        """)
        trades = cursor.fetchall()
        
        if not trades:
            send_telegram_reply(token, chat_id, "ℹ️ <b>Belum ada histori trade yang tertutup.</b>")
            return
            
        msg = "📜 <b>History 20 Trade Terakhir (Closed)</b>\n\n"
        
        total_pnl = 0
        for i, t in enumerate(trades):
            mode = "🔴 LIVE" if t['mode'] == 'live' else "📝 PAPER"
            pnl = t['pnl'] or 0
            funding = t['funding_fee'] or 0
            net_pnl = pnl - funding
            total_pnl += net_pnl
            
            pnl_emoji = "🟢" if net_pnl >= 0 else "🔴"
            close_price = t['close_price'] or 0
            msg += f"{i+1}. {mode} | <b>{t['side']} {t['symbol']}</b>\n"
            msg += f"   P: ${t['price']:.2f} ➔ ${close_price:.2f}\n"
            msg += f"   {pnl_emoji} Net PnL: <b>${net_pnl:.2f}</b>\n\n"
            
        summary_emoji = "🟢" if total_pnl >= 0 else "🔴"
        msg += f"══════════════════\n"
        msg += f"Total Net PnL (20 terakhir): {summary_emoji} <b>${total_pnl:.2f}</b>"
        
        send_telegram_reply(token, chat_id, msg)
        conn.close()
    except Exception as e:
        send_telegram_reply(token, chat_id, f"❌ Terjadi kesalahan saat memuat histori: {str(e)}")

def handle_telegram_command(token, chat_id, text):
    cmd = text.split()[0].lower()
    if '@' in cmd:
        cmd = cmd.split('@')[0]
        
    if cmd in ('/start', '/help'):
        msg = (
            "🤖 <b>Hyperliquid Trading Bot</b>\n\n"
            "Berikut adalah daftar perintah yang tersedia:\n"
            "🔹 `/positions` - Cek seluruh posisi aktif (paper & live) beserta detail unrealized PnL.\n"
            "🔹 `/history` - Lihat histori 20 trade terakhir yang sudah ditutup.\n"
            "🔹 `/closeall` - Tutup paksa seluruh posisi aktif saat ini berdasarkan harga pasar live.\n"
            "🔹 `/status` - Cek status bot, saldo akun, dan setingan aktif saat ini.\n"
            "🔹 `/help` - Tampilkan panduan menu bantuan ini."
        )
        send_telegram_reply(token, chat_id, msg)
        
    elif cmd == '/positions':
        send_positions_report(token, chat_id)
        
    elif cmd == '/closeall':
        close_all_open_positions(token, chat_id)
        
    elif cmd == '/history':
        send_history_report(token, chat_id)
        
    elif cmd == '/status':
        send_status_report(token, chat_id)

def funding_fee_calculation_loop():
    import datetime
    import time
    import sqlite3
    import requests
    
    # Wait a few seconds for the app to settle
    time.sleep(10)
    
    # Initialize with the current hour so we don't retroactively charge on startup
    last_processed_hour_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:00")
    print(f"💰 Funding Fee calculation loop started. Initialized hour to {last_processed_hour_str}")
    
    while True:
        try:
            # Get current UTC hour string
            now_utc = datetime.datetime.now(datetime.timezone.utc)
            current_hour_str = now_utc.strftime("%Y-%m-%d %H:00")
            
            if current_hour_str != last_processed_hour_str:
                print(f"⏰ New hour detected: {current_hour_str}. Calculating funding fees...")
                
                # 1. Fetch all open positions from SQLite
                conn = sqlite3.connect(DB_PATH)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM trades WHERE status = 'OPEN'")
                open_trades = [dict(row) for row in cursor.fetchall()]
                
                if open_trades:
                    # 2. Read bot settings to determine execution network
                    cursor.execute("SELECT key, value FROM bot_settings WHERE key = 'network'")
                    network_row = cursor.fetchone()
                    network = network_row["value"] if network_row else "testnet"
                    
                    # 3. Fetch metaAndAssetCtxs from Hyperliquid API
                    api_url = "https://api.hyperliquid-testnet.xyz/info" if network != "mainnet" else "https://api.hyperliquid.xyz/info"
                    try:
                        res = requests.post(api_url, json={"type": "metaAndAssetCtxs"}, timeout=10)
                        if res.status_code == 200:
                            data = res.json()
                            universe = data[0].get("universe", [])
                            asset_ctxs = data[1]
                            
                            # Build map of asset name -> context
                            asset_map = {}
                            for idx, asset in enumerate(universe):
                                name = asset.get("name")
                                if name and idx < len(asset_ctxs):
                                    asset_map[name] = asset_ctxs[idx]
                                    
                            # Process each open trade
                            for trade in open_trades:
                                trade_id = trade["id"]
                                symbol = trade["symbol"]
                                side = trade["side"]
                                size = float(trade["size"])
                                trade_mode = trade.get("mode", "paper")
                                
                                # Clean up symbol (e.g. "BTC/USD" -> "BTC")
                                coin = symbol.split("/")[0]
                                
                                if coin in asset_map:
                                    ctx = asset_map[coin]
                                    funding_rate = float(ctx.get("funding", "0.0"))
                                    mark_price = float(ctx.get("markPx") or ctx.get("oraclePx") or trade["price"])
                                    
                                    # Position Value in USD
                                    pos_value = size * mark_price
                                    
                                    # Calculate hourly funding cost
                                    if side == "LONG":
                                        hourly_cost = pos_value * funding_rate
                                    else: # SHORT
                                        hourly_cost = -pos_value * funding_rate
                                        
                                    # Update database
                                    cursor.execute(
                                        "UPDATE trades SET funding_fee = COALESCE(funding_fee, 0) + ? WHERE id = ?",
                                        (hourly_cost, trade_id)
                                    )
                                    
                                    print(f"   [Trade ID {trade_id}] {side} {size} {coin} @ ${mark_price:,.2f} | Funding Rate: {funding_rate * 100:.6f}% | Cost: ${hourly_cost:+,.4f}")
                                    
                                    # If PAPER trade, adjust paper balance
                                    if trade_mode == "paper":
                                        cursor.execute("SELECT balance FROM paper_account WHERE id = 1")
                                        bal_row = cursor.fetchone()
                                        if bal_row:
                                            curr_balance = bal_row["balance"]
                                            new_balance = curr_balance - hourly_cost
                                            cursor.execute("UPDATE paper_account SET balance = ? WHERE id = 1", (new_balance,))
                                            print(f"   [Paper Account] Adjusted balance by ${-hourly_cost:+,.4f}. New balance: ${new_balance:,.2f}")
                                            
                                    # Notify Telegram
                                    if abs(hourly_cost) > 0.0001:
                                        direction_str = "membayar" if hourly_cost > 0 else "menerima"
                                        action_emoji = "💸" if hourly_cost > 0 else "🎁"
                                        mode_label = "LIVE" if trade_mode == "live" else "PAPER"
                                        telegram_msg = (
                                            f"{action_emoji} <b>PENDANAAN POSISI ({mode_label})</b>\n\n"
                                            f"🪙 <b>Symbol:</b> {symbol}\n"
                                            f"↕️ <b>Side:</b> {side}\n"
                                            f"📈 <b>Rate Jam Ini:</b> {funding_rate * 100:.6f}%\n"
                                            f"📊 <b>Detail:</b> Anda {direction_str} sebesar <b>${abs(hourly_cost):,.4f}</b>"
                                        )
                                        send_telegram_notification(telegram_msg)
                                else:
                                    print(f"   [Warning] Coin {coin} not found in Hyperliquid universe.")
                            
                            conn.commit()
                        else:
                            print(f"   [Error] Failed to fetch metaAndAssetCtxs: HTTP {res.status_code}")
                    except Exception as api_err:
                        print(f"   [Error] Exception during HL API request: {api_err}")
                
                conn.close()
                last_processed_hour_str = current_hour_str
                
        except Exception as e:
            print(f"❌ Error in funding fee loop: {e}")
            
        time.sleep(30)

def telegram_bot_poll_loop():
    offset = 0
    print("Telegram Polling: Started background thread.")
    while True:
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT key, value FROM bot_settings WHERE key IN ('telegram_bot_token', 'telegram_chat_id', 'telegram_enabled')")
            settings = dict(cursor.fetchall())
            conn.close()
            
            enabled = settings.get('telegram_enabled') == 'true'
            token = settings.get('telegram_bot_token')
            configured_chat_id = settings.get('telegram_chat_id')
            
            if not enabled or not token:
                time.sleep(5)
                continue
                
            url = f"https://api.telegram.org/bot{token}/getUpdates"
            
            if offset == 0:
                init_res = requests.get(url, params={"offset": -1, "timeout": 0}, timeout=5)
                if init_res.status_code == 200:
                    init_data = init_res.json()
                    if init_data.get("ok") and init_data.get("result"):
                        offset = init_data["result"][0]["update_id"] + 1
            
            params = {"offset": offset, "timeout": 20}
            res = requests.get(url, params=params, timeout=25)
            if res.status_code != 200:
                print(f"Telegram polling returned status code {res.status_code}: {res.text}")
                time.sleep(10)
                continue
                
            data = res.json()
            if not data.get("ok"):
                print(f"Telegram polling response error: {data}")
                time.sleep(10)
                continue
                
            updates = data.get("result", [])
            for update in updates:
                update_id = update.get("update_id")
                offset = update_id + 1
                
                message = update.get("message")
                if not message:
                    continue
                    
                chat = message.get("chat", {})
                chat_id = str(chat.get("id"))
                
                if configured_chat_id and chat_id != str(configured_chat_id):
                    continue
                    
                text = message.get("text", "").strip()
                if not text:
                    continue
                    
                handle_telegram_command(token, chat_id, text)
                
        except Exception as e:
            print(f"Error in telegram poll loop: {e}")
            time.sleep(5)

@app.on_event("startup")
def startup_event():
    threading.Thread(target=telegram_bot_poll_loop, daemon=True).start()
    print("Telegram polling thread started successfully during app startup!")
    threading.Thread(target=funding_fee_calculation_loop, daemon=True).start()
    print("Funding fee calculation thread started successfully during app startup!")

