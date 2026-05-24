"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  Settings, Activity, LayoutDashboard, BarChart3, Lock, Terminal 
} from "lucide-react";
import Link from "next/link";

// SVG Icons
const ActivityIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
);
const ZapIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
);

declare global {
  interface Window {
    ethereum?: any;
  }
}

type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; message: string; type: ToastType };

const STRATEGIES = ["manual","real_strength_scalper","confirmed_fibonacci","rapid_scalper"];
// "sma_crossover","rsi","macd","grid"
const ORDER_TYPES = ["market","limit"];

const TOP_COINS = [
  { symbol: "BTC",  name: "Bitcoin" },
  { symbol: "ETH",  name: "Ethereum" },
  { symbol: "SOL",  name: "Solana" },
  { symbol: "ARB",  name: "Arbitrum" },
  { symbol: "AVAX", name: "Avalanche" },
  { symbol: "BNB",  name: "BNB" },
  { symbol: "DOGE", name: "Dogecoin" },
  { symbol: "MATIC",name: "Polygon" },
  { symbol: "LINK", name: "Chainlink" },
  { symbol: "SUI",  name: "Sui" },
];

function ToastContainer({ toasts, onRemove }: { toasts: ToastItem[]; onRemove: (id: number) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div key={t.id} onClick={() => onRemove(t.id)} className={`px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl flex items-start gap-3 animate-slide-in cursor-pointer transition-all hover:scale-[1.02] ${t.type === "success" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : t.type === "error" ? "bg-rose-500/15 border-rose-500/30 text-rose-300" : "bg-indigo-500/15 border-indigo-500/30 text-indigo-300"}`}>
          <span className="text-lg mt-0.5">{t.type === "success" ? "✅" : t.type === "error" ? "❌" : "ℹ️"}</span>
          <p className="text-sm font-medium leading-snug">{t.message}</p>
        </div>
      ))}
    </div>
  );
}

function SettingCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel rounded-xl p-5">
      <h3 className="text-sm font-bold text-slate-200 mb-4 pb-2 border-b border-slate-700/50 uppercase tracking-wider">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function FieldRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <label className="text-sm text-slate-300 font-medium">{label}</label>
        {desc && <p className="text-[11px] text-slate-500 mt-0.5">{desc}</p>}
      </div>
      <div className="w-64 shrink-0">{children}</div>
    </div>
  );
}

const inputClass = "w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors";
const selectClass = "w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [hasOpenTrades, setHasOpenTrades] = useState(false);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) window.location.href = "/login";
    } catch (e) {
      addToast("Gagal mengunci dashboard", "error");
    }
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then(r => r.json()),
      fetch("/api/paper-trades").then(r => r.json())
    ]).then(([settingsData, tradesData]) => {
      if (settingsData.success) setSettings(settingsData.data);
      if (tradesData.success && tradesData.data) {
        setHasOpenTrades(tradesData.data.some((t: any) => t.status === "OPEN"));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const updateSetting = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings })
      });
      const data = await res.json();
      if (data.success) {
        addToast("Settings berhasil disimpan!", "success");
        // Notify WS to switch coin if active_coin changed
        if (settings.active_coin) {
          await fetch("/api/ws", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "setCoin", coin: settings.active_coin })
          });
        }
      } else addToast(data.detail || "Gagal menyimpan", "error");
    } catch (e) { addToast("Error jaringan", "error"); }
    finally { setSaving(false); }
  };

  const clearLogs = async () => {
    if (!confirm("Hapus semua riwayat transaksi dan riset saldo? Tindakan ini tidak bisa dibatalkan.")) return;
    try {
      const res = await fetch("/api/clear-logs", { method: "POST" });
      const data = await res.json();
      if (data.status === "success") {
        addToast("Semua log berhasil dihapus dan saldo diriset!", "success");
      } else {
        addToast(data.error || "Gagal menghapus log", "error");
      }
    } catch (e) { addToast("Error jaringan", "error"); }
  };

  const testTelegram = async () => {
    try {
      const res = await fetch("/api/test-telegram", { method: "POST" });
      const data = await res.json();
      if (data.status === "success") {
        addToast(data.message, "success");
      } else {
        addToast(data.message || "Gagal test Telegram", "error");
      }
    } catch (e) { addToast("Error jaringan", "error"); }
  };

  const connectWallet = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts && accounts[0]) {
          updateSetting("wallet_address", accounts[0]);
          addToast("Wallet tersambung!", "success");
        }
      } catch (e) {
        addToast("Gagal menyambung wallet", "error");
      }
    } else {
      addToast("MetaMask tidak ditemukan", "info");
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center text-slate-400">Loading settings...</div>;

  return (
    <div className="flex h-screen overflow-hidden">
      <ToastContainer toasts={toasts} onRemove={(id) => setToasts(prev => prev.filter(t => t.id !== id))} />

      {/* Sidebar */}
      <aside className={`${isSidebarExpanded ? "w-64" : "w-20"} glass-panel border-y-0 border-l-0 hidden md:flex flex-col z-10 transition-all duration-300 ease-in-out relative`}>
        <div className="p-4 flex items-center gap-3 border-b border-slate-700/50 overflow-hidden">
          <div className="w-7 h-7 shrink-0 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400"><ZapIcon className="w-4 h-4" /></div>
          {isSidebarExpanded && <h1 className="font-bold text-lg tracking-tight text-glow whitespace-nowrap">HyperBot</h1>}
        </div>
        
        <nav className="flex-1 px-3 py-4 space-y-1">
          <Link href="/" className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 text-sm overflow-hidden">
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            {isSidebarExpanded && <span className="whitespace-nowrap">Dashboard</span>}
          </Link>
          <Link href="/analysis" className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 text-sm overflow-hidden">
            <BarChart3 className="w-4 h-4 shrink-0" />
            {isSidebarExpanded && <span className="whitespace-nowrap">Analisa</span>}
          </Link>
          <Link href="/terminal" className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 text-sm overflow-hidden font-sans">
            <Terminal className="w-4 h-4 shrink-0" />
            {isSidebarExpanded && <span className="whitespace-nowrap">Terminal & Logs</span>}
          </Link>
          <div className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-indigo-500/10 text-indigo-300 font-medium border border-indigo-500/20 text-sm cursor-default overflow-hidden">
            <Settings className="w-4 h-4 shrink-0" />
            {isSidebarExpanded && <span className="whitespace-nowrap">Settings</span>}
          </div>
        </nav>

        {/* Toggle Button */}
        <button 
          onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
          className="absolute -right-3 top-20 w-6 h-6 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-all z-20 shadow-lg text-[10px]"
        >
          {isSidebarExpanded ? "‹" : "›"}
        </button>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-y-auto">
        <header className="glass-panel border-x-0 border-t-0 p-3 px-6 flex items-center justify-between sticky top-0 z-20">
          <h2 className="text-base font-semibold text-slate-200">Bot Settings</h2>
          <div className="flex items-center gap-3">
            <button onClick={saveSettings} disabled={saving} className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold text-white shadow-[0_0_15px_rgba(79,70,229,0.3)] disabled:opacity-50 transition-all">
              {saving ? "Menyimpan..." : "💾 Simpan Semua"}
            </button>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 border border-rose-500/20 transition-all text-xs font-bold"
              title="Lock Dashboard"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Lock</span>
            </button>
          </div>
        </header>

        <div className="p-6 max-w-4xl mx-auto w-full space-y-6">
          
          <SettingCard title="⚙️ Core Configuration">
            <FieldRow label="Active Coin" desc="Koin yang diperdagangkan oleh bot">
              <div className="relative group">
                <select 
                  value={settings.active_coin || "BTC"} 
                  onChange={e => updateSetting("active_coin", e.target.value)} 
                  className={`${selectClass} ${hasOpenTrades ? "opacity-50 cursor-not-allowed" : ""}`}
                  disabled={hasOpenTrades}
                >
                  {TOP_COINS.map(c => (
                    <option key={c.symbol} value={c.symbol}>
                      {c.symbol} — {c.name}
                    </option>
                  ))}
                </select>
                {hasOpenTrades && (
                  <div className="absolute top-full left-0 mt-2 hidden group-hover:block w-64 bg-slate-800 text-xs text-rose-300 p-2 rounded shadow-xl border border-slate-700 z-50">
                    ⚠️ Tidak bisa mengganti koin saat ada trade/posisi yang sedang terbuka. Tutup posisi terlebih dahulu.
                  </div>
                )}
              </div>
            </FieldRow>
            <FieldRow label="Execution Mode" desc="Paper = simulasi lokal, Live = real trading">
              <select value={settings.execution_mode || "paper"} onChange={e => updateSetting("execution_mode", e.target.value)} className={selectClass}>
                <option value="paper">📝 Paper Trading</option>
                <option value="live">🔴 Live Trading</option>
              </select>
            </FieldRow>
            <FieldRow label="Wallet Address" desc="Alamat wallet utama (Read-only di Dashboard)">
              <div className="flex gap-2">
                <input type="text" placeholder="0x..." value={settings.wallet_address || ""} onChange={e => updateSetting("wallet_address", e.target.value)} className={inputClass} />
                <button onClick={connectWallet} className="px-3 py-2 bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-500/30 rounded-lg text-xs font-bold transition-colors">Connect</button>
              </div>
            </FieldRow>
          </SettingCard>

          <SettingCard title="⚡ Live API Settings">
            <FieldRow label="Network" desc="Mainnet = uang asli, Testnet = simulasi">
              <select value={settings.network || "testnet"} onChange={e => updateSetting("network", e.target.value)} className={selectClass}>
                <option value="testnet">🧪 Testnet</option>
                <option value="mainnet">🌐 Mainnet</option>
              </select>
            </FieldRow>
            <FieldRow label="Leverage" desc="Pilih leverage (Paling populer di Hyperliquid)">
              <select value={settings.leverage || "1"} onChange={e => updateSetting("leverage", e.target.value)} className={selectClass}>
                <option value="1">1x (Spot / Tanpa Leverage)</option>
                <option value="3">3x (Konservatif)</option>
                <option value="5">5x (Moderat)</option>
                <option value="10">10x (Paling Populer)</option>
                <option value="15">15x (Agresif)</option>
                <option value="20">20x (Resiko Tinggi)</option>
                <option value="25">25x (Sangat Tinggi)</option>
                <option value="50">50x (Maksimum BTC)</option>
              </select>
            </FieldRow>
          </SettingCard>

          <SettingCard title="💰 Risk Management">
            <FieldRow label="Order Size (USD)" desc="Besar nominal per trade dalam USD">
              <input type="number" step="10" value={settings.max_position_size || ""} onChange={e => updateSetting("max_position_size", e.target.value)} className={inputClass} />
            </FieldRow>
            <FieldRow label="Max Open Positions" desc="Jumlah posisi terbuka maksimum">
              <input type="number" step="1" value={settings.max_open_positions || ""} onChange={e => updateSetting("max_open_positions", e.target.value)} className={inputClass} />
            </FieldRow>
            <FieldRow label="Stop Loss (USD)" desc="Otomatis tutup posisi jika rugi X USD">
              <input type="number" step="1" value={settings.stop_loss_usd || ""} onChange={e => updateSetting("stop_loss_usd", e.target.value)} className={inputClass} />
            </FieldRow>
            <FieldRow label="Take Profit (USD)" desc="Otomatis tutup posisi jika untung X USD">
              <input type="number" step="1" value={settings.take_profit_usd || ""} onChange={e => updateSetting("take_profit_usd", e.target.value)} className={inputClass} />
            </FieldRow>
            <FieldRow label="Gas Fee / Priority" desc="Pilih tingkat prioritas gas untuk transaksi">
              <select value={settings.gas_fee || "0.01"} onChange={e => updateSetting("gas_fee", e.target.value)} className={selectClass}>
                <option value="0.001">🐌 Low ($0.001)</option>
                <option value="0.01">⚡ Standard ($0.01)</option>
                <option value="0.05">🚀 High ($0.05)</option>
                <option value="0.1">🔥 Ultra Fast ($0.10)</option>
              </select>
            </FieldRow>
          </SettingCard>

          <SettingCard title="📊 Strategy & Automation">
            <FieldRow label="Strategy Type" desc="Algoritma analisis yang digunakan">
              <select value={settings.strategy_type || "manual"} onChange={e => updateSetting("strategy_type", e.target.value)} className={selectClass}>
                {STRATEGIES.map(s => <option key={s} value={s}>{s === "manual" ? "🖱️ Manual" : s === "real_strength_scalper" ? "🛡️ Real Strength Scalper" : s === "confirmed_fibonacci" ? "📐 Confirmed Fibonacci" : s === "rapid_scalper" ? "⚡ Rapid Scalper (EMA Cross)" : s}</option>)}
              </select>
            </FieldRow>
            <FieldRow label="Auto Trade" desc="Bot otomatis eksekusi sinyal dari strategi">
              <select value={settings.auto_trade || "false"} onChange={e => updateSetting("auto_trade", e.target.value)} className={selectClass}>
                <option value="false">❌ Off</option>
                <option value="true">✅ On</option>
              </select>
            </FieldRow>
          </SettingCard>

          <SettingCard title="📢 Telegram Notifications">
            <FieldRow label="Enable Telegram" desc="Kirim notifikasi setiap bot trade">
              <select value={settings.telegram_enabled || "false"} onChange={e => updateSetting("telegram_enabled", e.target.value)} className={selectClass}>
                <option value="false">❌ Off</option>
                <option value="true">✅ On</option>
              </select>
            </FieldRow>
            <FieldRow label="Bot Token" desc="Dapatkan dari @BotFather">
              <input type="password" placeholder="123456789:ABC..." value={settings.telegram_bot_token || ""} onChange={e => updateSetting("telegram_bot_token", e.target.value)} className={inputClass} />
            </FieldRow>
            <FieldRow label="Chat ID" desc="Kirim pesan ke @userinfobot untuk ID Anda">
              <input type="text" placeholder="12345678" value={settings.telegram_chat_id || ""} onChange={e => updateSetting("telegram_chat_id", e.target.value)} className={inputClass} />
            </FieldRow>
            <div className="flex justify-end pt-2">
              <button 
                onClick={testTelegram}
                className="px-4 py-1.5 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/20 rounded-lg text-xs font-bold transition-all flex items-center gap-2"
              >
                <span>🔔 Test Notification</span>
              </button>
            </div>
          </SettingCard>

          <div className="glass-panel rounded-xl p-5 border-rose-500/20">
            <h3 className="text-sm font-bold text-rose-400 mb-4 pb-2 border-b border-rose-500/20 uppercase tracking-wider">⚠️ Danger Zone</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-300">Clear All Trade Logs</p>
                  <p className="text-[11px] text-slate-500">Hapus semua riwayat transaksi & riset saldo ke $10jt</p>
                </div>
                <button onClick={clearLogs} className="px-4 py-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg text-xs font-bold transition-all">Clear Logs</button>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
