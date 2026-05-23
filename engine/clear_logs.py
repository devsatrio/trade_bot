import sqlite3
import os

db_path = "/home/devasatrio/Documents/project/trade_bot/data/trading_bot.db"

if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Hapus semua data transaksi
    cursor.execute("DELETE FROM trades")
    # Hapus semua data sinyal
    cursor.execute("DELETE FROM signals")
    # Riset saldo ke 10 Juta
    cursor.execute("UPDATE paper_account SET balance = 10000000.0 WHERE id = 1")
    
    conn.commit()
    conn.close()
    print("Database berhasil dibersihkan! Semua log trade dan saldo telah diriset.")
else:
    print(f"Database tidak ditemukan di {db_path}")
