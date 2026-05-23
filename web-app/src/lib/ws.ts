import WebSocket from 'ws';

// Gunakan global agar instance WS tidak ter-reset saat hot-reload di mode development Next.js
declare global {
  var hlWsInstance: HyperliquidWS | undefined;
}

export type ChartDataPoint = {
  time: string;
  price: number;
};

class HyperliquidWS {
  private ws: WebSocket | null = null;
  private isConnecting: boolean = false;
  private coin: string = "BTC";
  private engineUrl: string = process.env.ENGINE_URL || "http://engine:8000";

  public priceHistory: ChartDataPoint[] = [];
  public candlesCollected: number = 0;

  public start(coinOverride?: string) {
    if (coinOverride) this.coin = coinOverride;

    if (this.ws || this.isConnecting) {
      console.log("[NextJS WS] WebSocket sudah berjalan.");
      return;
    }

    this.isConnecting = true;
    const isTestnet = process.env.IS_TESTNET === "true";
    const wsUrl = isTestnet 
      ? "wss://api.hyperliquid-testnet.xyz/ws" 
      : "wss://api.hyperliquid.xyz/ws";

    console.log(`[NextJS WS] Menghubungkan ke ${wsUrl}...`);
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log("[NextJS WS] Terhubung ke Hyperliquid!");
      this.isConnecting = false;

      // Subscribe ke data L2 Book untuk BTC
      const subscribeMsg = {
        method: "subscribe",
        subscription: {
          type: "l2Book",
          coin: this.coin
        }
      };
      this.ws?.send(JSON.stringify(subscribeMsg));
      console.log(`[NextJS WS] Subscribed ke L2 Book ${this.coin}`);
    });

    this.ws.on('message', async (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        
        // Memastikan format datanya benar (channel l2Book)
        if (msg.channel === 'l2Book' && msg.data && msg.data.levels) {
          const bids = msg.data.levels[0]; // array of bids [price, size, numOrders]
          const asks = msg.data.levels[1]; // array of asks
          
          if (bids.length > 0 && asks.length > 0) {
            const topBid = parseFloat(bids[0].px);
            const topAsk = parseFloat(asks[0].px);
            const midPrice = (topBid + topAsk) / 2;
            const volume = parseFloat(bids[0].sz) + parseFloat(asks[0].sz);
            
            // Simpan ke history untuk chart frontend
            const now = new Date();
            const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
            
            this.priceHistory.push({ time: timeString, price: midPrice });
            if (this.priceHistory.length > 60) {
              this.priceHistory.shift(); // Keep last 60 points
            }

            // Format data untuk dikirim ke FastAPI Engine
            const marketData = {
              symbol: msg.data.coin || this.coin,
              price: midPrice,
              volume: volume,
              timestamp: Date.now()
            };

            // Kirim ke FastAPI secara asinkron
            this.sendToEngine(marketData);
          }
        }
      } catch (err) {
        console.error("[NextJS WS] Error parsing message:", err);
      }
    });

    this.ws.on('close', () => {
      console.log("[NextJS WS] Terputus. Mencoba reconnect dalam 5 detik...");
      this.ws = null;
      this.isConnecting = false;
      setTimeout(() => this.start(), 5000);
    });

    this.ws.on('error', (err) => {
      console.error("[NextJS WS] Error:", err.message);
      this.ws?.close();
    });
  }

  public stop() {
    if (this.ws) {
      console.log("[NextJS WS] Menghentikan WebSocket...");
      this.ws.close();
      this.ws = null;
    }
  }

  public setCoin(coin: string) {
    if (this.coin === coin) return;
    console.log(`[NextJS WS] Mengganti koin dari ${this.coin} ke ${coin}`);
    this.coin = coin;
    this.priceHistory = [];
    // Reconnect with new coin
    if (this.ws) {
      this.ws.close(); // will trigger auto-reconnect via 'close' handler
    }
  }

  public getStatus() {
    if (this.isConnecting) return "connecting";
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return "connected";
    return "disconnected";
  }

  private async sendToEngine(marketData: any) {
    try {
      // Mengirim POST request ke container engine
      const res = await fetch(`${this.engineUrl}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(marketData)
      });
      
      const result = await res.json();
      this.candlesCollected = result.candles_collected || 0;
      
      // Auto Trade Logic
      if (result.auto_trade && result.decision !== "HOLD") {
        console.log(`[AutoTrade] Signal detected: ${result.decision} for ${result.symbol}`);
        
        const isLive = result.execution_mode === "live";
        const network = result.network || "testnet";
        
        if (result.decision === "CLOSE" && result.trade_id) {
          const tradeMode = result.metadata?.mode || "paper";
          
          if (tradeMode === "live" && isLive) {
            // LIVE: Send a reduce-only counter-order to Hyperliquid L1 first
            const closeSide = result.metadata?.close_side;
            const closeSize = result.metadata?.close_size;
            // To close a LONG, we sell (SHORT). To close a SHORT, we buy (LONG).
            const counterSide = closeSide === "LONG" ? "SHORT" : "LONG";
            
            console.log(`[AutoTrade] Closing LIVE position ${result.trade_id}: ${counterSide} ${closeSize} @ ${result.price} (reduce-only)`);
            try {
              const closeRes = await fetch("http://localhost:3000/api/trade", {
                method: "POST",
                headers: { 
                  "Content-Type": "application/json",
                  "x-internal-secret": process.env.DASHBOARD_PASSWORD || ""
                },
                body: JSON.stringify({
                  symbol: result.symbol + "/USD",
                  side: counterSide,
                  size: closeSize,
                  price: result.price,
                  network: network,
                  reduceOnly: true
                })
              });
              const closeData = await closeRes.json();
              if (closeData.success) {
                console.log(`[AutoTrade] L1 close order successful. Updating local DB...`);
              } else {
                console.error(`[AutoTrade] L1 close order failed: ${closeData.error}`);
              }
            } catch (closeErr: any) {
              console.error(`[AutoTrade] L1 close order error:`, closeErr.message);
            }
          }
          
          // Update local database (both paper and live)
          await fetch(`http://localhost:3000/api/paper-close`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "x-internal-secret": process.env.DASHBOARD_PASSWORD || ""
            },
            body: JSON.stringify({ trade_id: result.trade_id, close_price: result.price })
          });
          console.log(`[AutoTrade] Closed position ${result.trade_id} in DB (${tradeMode} | ${result.metadata?.reason})`);
        } else if (result.decision === "LONG" || result.decision === "SHORT") {
          const endpoint = isLive ? "http://localhost:3000/api/trade" : "http://localhost:3000/api/paper-trade";
          
          await fetch(endpoint, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "x-internal-secret": process.env.DASHBOARD_PASSWORD || ""
            },
            body: JSON.stringify({
              symbol: result.symbol + "/USD",
              side: result.decision,
              size: result.size,
              price: result.price,
              network: network,
              gas_fee: result.gas_fee
            })
          });
          console.log(`[AutoTrade] Executed ${result.decision} ${result.size} ${result.symbol} @ ${result.price}`);
        }
      }
    } catch (err: any) {
      console.error("[NextJS -> Engine] Gagal mengirim data atau eksekusi auto-trade:", err.message);
    }
  }
}

// Implementasi Singleton agar aman dari Hot Reloading Next.js
export const wsManager = global.hlWsInstance || new HyperliquidWS();

if (process.env.NODE_ENV !== 'production') {
  global.hlWsInstance = wsManager;
}

// Auto-start streaming by default
if (typeof window === 'undefined') {
  wsManager.start();
}
