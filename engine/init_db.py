import sqlite3
import os

DB_PATH = os.environ.get("DATABASE_URL", "/app/data/trading_bot.db")

def init_db():
    print(f"Initializing database at {DB_PATH}")
    # Ensure directory exists
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Enable WAL mode for concurrent access
    cursor.execute("PRAGMA journal_mode=WAL;")
    
    # Create trades table with status tracking
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        price REAL NOT NULL,
        size REAL NOT NULL,
        tx_hash TEXT,
        status TEXT DEFAULT 'OPEN',
        close_price REAL,
        pnl REAL,
        closed_at DATETIME
    )
    """)
    
    # Add columns if they don't exist (for existing DBs)
    try:
        cursor.execute("ALTER TABLE trades ADD COLUMN status TEXT DEFAULT 'OPEN'")
    except: pass
    try:
        cursor.execute("ALTER TABLE trades ADD COLUMN close_price REAL")
    except: pass
    try:
        cursor.execute("ALTER TABLE trades ADD COLUMN pnl REAL")
    except: pass
    try:
        cursor.execute("ALTER TABLE trades ADD COLUMN closed_at DATETIME")
    except: pass
    try:
        cursor.execute("ALTER TABLE trades ADD COLUMN strategy TEXT")
    except: pass
    try:
        cursor.execute("ALTER TABLE trades ADD COLUMN mode TEXT DEFAULT 'paper'")
    except: pass
    try:
        cursor.execute("ALTER TABLE trades ADD COLUMN fee REAL DEFAULT 0")
    except: pass
    try:
        cursor.execute("ALTER TABLE trades ADD COLUMN funding_fee REAL DEFAULT 0")
    except: pass
    try:
        cursor.execute("ALTER TABLE trades ADD COLUMN leverage INTEGER DEFAULT 1")
    except: pass
    
    # Create signals table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        symbol TEXT NOT NULL,
        signal TEXT NOT NULL,
        confidence REAL,
        metadata TEXT
    )
    """)
    
    # Create paper account table — balance = 100 BTC equivalent in USD
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS paper_account (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        balance REAL NOT NULL DEFAULT 10000000.0
    )
    """)
    
    # Initialize balance only if paper_account is empty (preserves balance across restarts)
    cursor.execute("INSERT OR IGNORE INTO paper_account (id, balance) VALUES (1, 10000000.0)")
    
    # Create bot_settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS bot_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """)
    
    # Default settings
    defaults = {
        "active_coin": "BTC",
        "max_position_size": "0.1",
        "leverage": "1",
        "stop_loss_usd": "10",
        "take_profit_usd": "20",
        "trailing_stop_pct": "0",
        "max_open_positions": "3",
        "max_daily_loss": "500",
        "execution_mode": "paper",
        "network": "testnet",
        "order_type": "market",
        "slippage_tolerance": "0.1",
        "strategy_type": "manual",
        "auto_trade": "false",
        "polling_interval": "5",
        "cooldown_seconds": "60",
        "settings_pin": "1234",
        "wallet_address": "",
        "telegram_bot_token": "",
        "telegram_chat_id": "",
        "telegram_enabled": "false",
    }
    for k, v in defaults.items():
        cursor.execute("INSERT OR IGNORE INTO bot_settings (key, value) VALUES (?, ?)", (k, v))
    
    conn.commit()
    conn.close()
    print("Database initialization complete.")

if __name__ == "__main__":
    init_db()
