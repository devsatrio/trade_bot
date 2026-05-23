"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { 
  Settings, Activity, TrendingUp, TrendingDown, 
  Wallet, Zap, LayoutDashboard, History, ArrowUpRight, ArrowDownLeft,
  BarChart3, Lock
} from "lucide-react";
import Link from "next/link";

const TradingChart = dynamic(() => import("@/components/TradingChart"), { ssr: false });

// SVG Icons
const ActivityIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
);
const WalletIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
);
const BarChartIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg>
);
const ZapIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
);

// Toast Notification Component
type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; message: string; type: ToastType };

function ToastContainer({ toasts, onRemove }: { toasts: ToastItem[]; onRemove: (id: number) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl flex items-start gap-3 animate-slide-in cursor-pointer transition-all hover:scale-[1.02] ${
            t.type === "success" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" :
            t.type === "error" ? "bg-rose-500/15 border-rose-500/30 text-rose-300" :
            "bg-indigo-500/15 border-indigo-500/30 text-indigo-300"
          }`}
          onClick={() => onRemove(t.id)}
        >
          <span className="text-lg mt-0.5">{t.type === "success" ? "✅" : t.type === "error" ? "❌" : "ℹ️"}</span>
          <p className="text-sm font-medium leading-snug">{t.message}</p>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [balance, setBalance] = useState<string>("0.00");
  const [loading, setLoading] = useState<boolean>(false);
  const [userAddress, setUserAddress] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [wsStatus, setWsStatus] = useState<string>("disconnected");
  const [paperTrades, setPaperTrades] = useState<any[]>([]);
  const [paperBalance, setPaperBalance] = useState<string>("10,000,000.00");
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [botSettings, setBotSettings] = useState<Record<string, string>>({});
  const [showAllLogs, setShowAllLogs] = useState<boolean>(false);

  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [showCloseAllModal, setShowCloseAllModal] = useState(false);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) window.location.href = "/login";
    } catch (e) {
      addToast("Gagal mengunci dashboard", "error");
    }
  };

  // Live Price Polling (Faster)
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const resWs = await fetch("/api/ws");
        const dataWs = await resWs.json();
        setWsStatus(dataWs.status);
        setCandlesCollected(dataWs.candlesCollected || 0);

        const resChart = await fetch("/api/chart-data");
        const dataChart = await resChart.json();
        if (dataChart.success && Array.isArray(dataChart.data) && dataChart.data.length > 0) {
          const lastPrice = dataChart.data[dataChart.data.length - 1].price;
          if (lastPrice > 0) setCurrentPrice(lastPrice);
        } else {
          // Fallback to Hyperliquid API if local chart data is empty
          const resMeta = await fetch("https://api.hyperliquid.xyz/info", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "allMids" })
          });
          const mids = await resMeta.json();
          if (mids?.["BTC"]) setCurrentPrice(parseFloat(mids["BTC"]));
        }
      } catch (e) {}
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 1000);
    return () => clearInterval(interval);
  }, []);

  // Data Polling (Status, Trades, Balance)
  useEffect(() => {
    const checkData = async () => {
      try {
        // Fetch Settings with no-cache to ensure we get the latest mode
        const resSettings = await fetch("/api/settings", { cache: 'no-store' });
        const dataSettings = await resSettings.json();
        
        if (dataSettings.success) {
          const settings = dataSettings.data;
          setBotSettings(settings);
          
          const mode = settings.execution_mode || "paper";
          const network = settings.network || "testnet";
          const addr = settings.wallet_address || "";
          
          // FIX: Set user address for UI display
          setUserAddress(addr);
          
          // Fetch Trades based on Mode
          if (mode === "live") {
            if (!addr) {
              setPaperTrades([]);
            } else {
              const resLive = await fetch("/api/live-trades", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userAddress: addr, network })
              });
              const dataLive = await resLive.json();
              if (dataLive.success && Array.isArray(dataLive.data)) {
                setPaperTrades(dataLive.data);
              }
            }
          } else {
            // Mode Paper
            const resPaper = await fetch("/api/paper-trades", { cache: 'no-store' });
            const dataPaper = await resPaper.json();
            if (dataPaper.success && Array.isArray(dataPaper.data)) {
              setPaperTrades(dataPaper.data);
            }
          }

          // Fetch Real Balance (L1) if address exists
          if (addr) {
            const resInfo = await fetch("/api/info", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userAddress: addr, network })
            });
            const dataInfo = await resInfo.json();
            if (dataInfo.success) {
              setBalance(parseFloat(dataInfo.accountValue).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            }
          }
        }

        const resBalancePaper = await fetch("/api/paper-balance", { cache: 'no-store' });
        const dataBalancePaper = await resBalancePaper.json();
        if (dataBalancePaper.success && typeof dataBalancePaper.balance === "number")
          setPaperBalance(dataBalancePaper.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      } catch (e) {
        console.error("Polling error:", e);
      }
    };

    checkData();
    const interval = setInterval(checkData, 3000);
    return () => clearInterval(interval);
  }, []); // Empty dependency array to prevent infinite loops, settings fetched inside

  const [candlesCollected, setCandlesCollected] = useState<number>(0);
  
  const toggleWs = async () => {
    const action = wsStatus === "connected" ? "stop" : "start";
    setWsStatus(action === "start" ? "connecting" : "disconnected");
    try {
      const res = await fetch("/api/ws", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, coin: activeCoin }) });
      const data = await res.json();
      setWsStatus(data.status);
    } catch (err) { console.error(err); }
  };

  const tradeUsd = parseFloat(botSettings.max_position_size || "100");
  const leverage = botSettings.leverage || "1";
  const activeCoin = botSettings.active_coin || "BTC";

  // Sync WS coin when activeCoin changes or on initial load
  useEffect(() => {
    if (activeCoin) {
      fetch("/api/ws", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setCoin", coin: activeCoin })
      }).catch(console.error);
    }
  }, [activeCoin]);

  const executeTrade = async (side: string) => {
    if (currentPrice === 0) { addToast("Menunggu harga live...", "error"); return; }
    const isLive = botSettings.execution_mode === "live";
    const endpoint = isLive ? "/api/trade" : "/api/paper-trade";
    
    // Konversi USD ke coin Size (Order Size * Leverage / Harga)
    const coinSize = Math.floor(((tradeUsd * parseFloat(leverage)) / currentPrice) * 1000000) / 1000000;
    
    try {
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          symbol: `${activeCoin}/USD`, 
          side, 
          size: coinSize, 
          price: currentPrice,
          network: botSettings.network || "testnet",
          gas_fee: botSettings.gas_fee || "0.01"
        })
      });
      const data = await res.json();
      if (data.success) {
        const msg = isLive ? "Live Trade Berhasil!" : data.message;
        addToast(`${msg} (${coinSize} ${activeCoin})`, "success");
      } else {
        addToast(data.detail || data.error || "Gagal", "error");
      }
    } catch (e) { addToast("Error jaringan", "error"); }
  };

  const closeTrade = async (trade: any) => {
    if (currentPrice === 0) { addToast("Menunggu harga live...", "error"); return; }
    try {
      if (botSettings.execution_mode === "live") {
        const counterSide = trade.side === "LONG" ? "SHORT" : "LONG";
        const closeRes = await fetch("/api/trade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: trade.symbol || "BTC/USD",
            side: counterSide,
            size: trade.size,
            price: currentPrice,
            network: botSettings.network || "testnet",
            reduceOnly: true
          })
        });
        const closeData = await closeRes.json();
        if (!closeData.success) {
          addToast(`Gagal tutup L1: ${closeData.error}`, "error");
          return;
        }
      }

      const res = await fetch("/api/paper-close", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trade_id: trade.id, close_price: currentPrice })
      });
      const data = await res.json();
      if (data.success) addToast(data.message, data.pnl >= 0 ? "success" : "error");
      else addToast(data.detail || "Gagal close", "error");
    } catch (e) { addToast("Error jaringan", "error"); }
  };

  const closeAllTrades = () => {
    const openTrades = paperTrades.filter(t => t.status === "OPEN");
    if (openTrades.length === 0) {
      addToast("Tidak ada posisi yang terbuka.", "info");
      return;
    }
    setShowCloseAllModal(true);
  };

  const confirmCloseAllTrades = async () => {
    setShowCloseAllModal(false);
    const openTrades = paperTrades.filter(t => t.status === "OPEN");
    addToast(`Menutup ${openTrades.length} posisi...`, "info");
    for (const trade of openTrades) {
      await closeTrade(trade);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      
      {/* Custom Close All Modal */}
      {showCloseAllModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/50 p-6 rounded-2xl shadow-2xl max-w-sm w-full relative overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500 to-orange-500"></div>
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 mb-4 mx-auto border border-rose-500/30">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-2">Tutup Semua Posisi?</h3>
            <p className="text-sm text-slate-400 text-center mb-6">
              Apakah Anda yakin ingin menutup <b>{paperTrades.filter(t => t.status === "OPEN").length} posisi</b> secara instan? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowCloseAllModal(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg transition-colors text-sm"
              >
                Batal
              </button>
              <button 
                onClick={confirmCloseAllTrades}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg shadow-[0_0_15px_rgba(225,29,72,0.4)] transition-colors text-sm"
              >
                Ya, Tutup Semua
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className={`${isSidebarExpanded ? "w-64" : "w-20"} glass-panel border-y-0 border-l-0 hidden md:flex flex-col z-10 transition-all duration-300 ease-in-out relative`}>
        <div className="p-4 flex items-center gap-3 border-b border-slate-700/50 overflow-hidden">
          <div className="w-7 h-7 shrink-0 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400"><ZapIcon /></div>
          {isSidebarExpanded && <h1 className="font-bold text-lg tracking-tight text-glow whitespace-nowrap">HyperBot</h1>}
        </div>
        
        <nav className="flex-1 px-3 py-4 space-y-1">
          <div className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-indigo-500/10 text-indigo-300 font-medium border border-indigo-500/20 text-sm cursor-default overflow-hidden`}>
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            {isSidebarExpanded && <span className="whitespace-nowrap">Dashboard</span>}
          </div>
          <Link href="/analysis" className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 text-sm overflow-hidden">
            <BarChart3 className="w-4 h-4 shrink-0" />
            {isSidebarExpanded && <span className="whitespace-nowrap">Analisa</span>}
          </Link>
          <Link href="/settings" className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 text-sm overflow-hidden">
            <Settings className="w-4 h-4 shrink-0" />
            {isSidebarExpanded && <span className="whitespace-nowrap">Settings</span>}
          </Link>
        </nav>

        {/* Toggle Button */}
        <button 
          onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
          className="absolute -right-3 top-20 w-6 h-6 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-all z-20 shadow-lg text-[10px]"
        >
          {isSidebarExpanded ? "‹" : "›"}
        </button>

        <div className="p-3 mt-auto overflow-hidden">
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
            {isSidebarExpanded ? (
              <>
                <p className="text-xs text-slate-400 mb-1">FastAPI Engine</p>
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span></span>
                  <span className="text-xs font-medium text-emerald-400">Online</span>
                </div>
              </>
            ) : (
              <div className="flex justify-center">
                <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span></span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col h-full overflow-y-auto relative">
        <header className="glass-panel border-x-0 border-t-0 p-3 px-6 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <h2 className="text-base font-semibold text-slate-200">Market Overview</h2>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${botSettings.network === "mainnet" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-sky-500/10 text-sky-400 border-sky-500/20"}`}>
                {botSettings.network === "mainnet" ? "🌐 Mainnet" : "🧪 Testnet"}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-indigo-500/10 text-indigo-400 border-indigo-500/20 flex items-center gap-1">
                {botSettings.strategy_type === "real_strength_scalper" ? "🛡️ Real Strength Scalper" : 
                 botSettings.strategy_type === "confirmed_fibonacci" ? "📐 Confirmed Fibonacci" : 
                 botSettings.strategy_type === "manual" ? "🖱️ Manual" : 
                 `📊 ${botSettings.strategy_type?.toUpperCase()}`}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-violet-500/10 text-violet-400 border-violet-500/20 flex items-center gap-1">
                ⚡ Leverage {leverage}x
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 flex items-center gap-1">
                💵 Size: ${botSettings.max_position_size || "100"} USD
              </span>
              {((botSettings.strategy_type === "real_strength_scalper" && candlesCollected < 65) || 
                (botSettings.strategy_type === "confirmed_fibonacci" && candlesCollected < 50)) && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-amber-500/10 text-amber-500 border-amber-500/20 flex items-center gap-1">
                  ⏳ Warmup {candlesCollected}/{botSettings.strategy_type === "real_strength_scalper" ? 65 : 50}
                </span>
              )}
              {botSettings.auto_trade === "true" && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse">
                  🤖 AUTO
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {userAddress && <div className="px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs font-mono text-slate-300">{userAddress.slice(0,6)}...{userAddress.slice(-4)}</div>}
            <button 
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 border border-rose-500/20 transition-all text-xs font-bold"
              title="Lock Dashboard"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Lock</span>
            </button>
          </div>
        </header>

        <div className="p-4 space-y-4 max-w-[1600px] mx-auto w-full h-full flex flex-col">
          {error && <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">{error}</div>}

          {/* Stats & Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
            <div className="glass-panel p-4 rounded-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl -mr-8 -mt-8"></div>
              <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-2 border-b border-slate-700/50 pb-1">Account Value</h3>
              <div className="flex flex-col gap-3">
                {botSettings.execution_mode === "live" ? (
                  <>
                    <div>
                      <span className="text-xs text-emerald-400 block font-bold uppercase tracking-wider">Live Wallet Balance</span>
                      <span className="text-2xl font-bold text-slate-100">${balance}</span>
                    </div>
                    <div className="opacity-40">
                      <span className="text-[10px] text-slate-500 block">Simulation Balance</span>
                      <span className="text-sm font-medium text-slate-400">${paperBalance}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="text-xs text-indigo-400 block font-bold uppercase tracking-wider">Paper Trading Balance</span>
                      <span className="text-2xl font-bold text-slate-100">${paperBalance}</span>
                    </div>
                    <div className="opacity-40">
                      <span className="text-[10px] text-slate-500 block">L1 Exchange Wallet</span>
                      <span className="text-sm font-medium text-slate-400">${balance}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="glass-panel p-4 rounded-xl col-span-1 md:col-span-2 flex flex-col justify-center">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-slate-400 text-xs font-medium mb-1">Execution Controls</h3>
                  <p className="text-[10px] text-slate-500">
                    Mode: <span className={botSettings.execution_mode === "live" ? "text-indigo-400 font-bold" : "text-emerald-400 font-bold"}>{botSettings.execution_mode === "live" ? "Live" : "Paper"}</span> | 
                    Network: <span className={botSettings.network === "mainnet" ? "text-amber-400 font-bold" : "text-sky-400 font-bold"}>{botSettings.network === "mainnet" ? "Mainnet" : "Testnet"}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1 flex flex-col gap-2 border-r border-slate-700/50 pr-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                    {botSettings.execution_mode === "live" ? "🔴 LIVE" : "📝 PAPER"} {leverage}x <span className="text-emerald-500">{currentPrice > 0 ? `$${currentPrice.toLocaleString()}` : "Loading..."}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {botSettings.auto_trade === "true" ? (
                      <div className="flex-1 flex flex-col gap-2">
                        <div className="py-1.5 bg-indigo-500/5 border border-indigo-500/20 rounded-md text-[10px] text-center text-indigo-300 font-medium italic">
                          🤖 Auto Trade is managing positions...
                        </div>
                        {botSettings.execution_mode !== "live" && (
                          <a 
                            href="https://app.hyperliquid-testnet.xyz/trade/BTC" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 hover:text-sky-300 border border-sky-500/20 hover:border-sky-500/30 rounded text-[10px] text-center font-bold transition-all flex items-center justify-center gap-1 shadow-[0_0_10px_rgba(56,189,248,0.05)] hover:shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                          >
                            📈 HL Testnet BTC Chart
                          </a>
                        )}
                      </div>
                    ) : (
                      <>
                        <button 
                          disabled={currentPrice === 0 || (paperTrades || []).filter(t => t.status === "OPEN").length >= parseInt(botSettings.max_open_positions || "3")} 
                          onClick={() => executeTrade("LONG")} 
                          className={`flex-1 py-1.5 flex items-center justify-center gap-2 ${botSettings.execution_mode === "live" ? "bg-indigo-600 text-white hover:bg-indigo-500" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"} rounded-md text-xs font-bold disabled:opacity-50 transition-all`}
                        >
                          <TrendingUp className="w-3 h-3" /> LONG ${tradeUsd}
                        </button>
                        <button 
                          disabled={currentPrice === 0 || (paperTrades || []).filter(t => t.status === "OPEN").length >= parseInt(botSettings.max_open_positions || "3")} 
                          onClick={() => executeTrade("SHORT")} 
                          className={`flex-1 py-1.5 flex items-center justify-center gap-2 ${botSettings.execution_mode === "live" ? "bg-slate-700 text-slate-200 hover:bg-slate-600" : "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20"} rounded-md text-xs font-bold disabled:opacity-50 transition-all`}
                        >
                          <TrendingDown className="w-3 h-3" /> SHORT ${tradeUsd}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {botSettings.execution_mode === "live" && (
                  <div className="flex-1 flex flex-col gap-2 pl-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Real API (EIP-712)</span>
                    <button 
                      onClick={async () => { 
                        try {
                          const res = await fetch("/api/trade", { 
                            method: "POST", 
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ side: "LONG", size: 0.0001, price: currentPrice || 60000, network: botSettings.network || "testnet" }) 
                          }); 
                          const data = await res.json(); 
                          if (data.success) addToast(`API OK: ${data.address}`, "success");
                          else addToast(`API Error: ${data.error || "Unknown"}`, "error");
                        } catch (e) {
                          addToast("Koneksi API Gagal", "error");
                        }
                      }} 
                      className="py-1.5 bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600 rounded-md text-xs font-bold transition-all"
                    >
                      TEST API
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Chart & Trades Log */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 flex-1 min-h-0">
            <div className="xl:col-span-3 glass-panel rounded-xl p-4 flex flex-col h-[500px] xl:h-full">
              <div className="flex items-center gap-2 shrink-0 mb-1">
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                  wsStatus === "connected" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                }`}>
                  {wsStatus === "connected" && <span className="relative flex h-1.5 w-1.5 mr-1"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span></span>}
                  {wsStatus === "connected" ? "Live" : "Offline"}
                </span>
                <button onClick={toggleWs} className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  wsStatus === "connected" ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30" : "bg-indigo-600 text-white hover:bg-indigo-500"
                } transition-all`}>
                  {wsStatus === "connected" ? "Stop" : "Start"}
                </button>
              </div>
              {Object.keys(botSettings).length > 0 ? (
                <TradingChart coin={activeCoin} />
              ) : (
                <div className="flex-1 min-h-[350px] flex items-center justify-center bg-slate-900/50 rounded-lg border border-slate-800">
                  <div className="text-center">
                    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-xs text-slate-500 animate-pulse">Menyiapkan chart...</p>
                  </div>
                </div>
              )}
            </div>

            <div className="glass-panel rounded-xl p-4 flex flex-col xl:h-full">
              <h3 className="font-semibold text-base mb-3 border-b border-slate-700/50 pb-2 shrink-0 flex items-center justify-between">
                <div>
                  <span>{botSettings.execution_mode === "live" ? "🔴 Live Trades Log" : "📝 Paper Trades Log"}</span>
                  {botSettings.execution_mode === "live" && <span className="text-[9px] ml-2 text-indigo-400 animate-pulse">MONITORING L1</span>}
                </div>
                {paperTrades.some(t => t.status === "OPEN") && (
                  <button 
                    onClick={closeAllTrades}
                    disabled={currentPrice === 0}
                    className="px-2 py-1 bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white rounded border border-rose-500/30 text-[10px] font-bold uppercase transition-colors"
                  >
                    Close All
                  </button>
                )}
              </h3>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-[200px]">
                {paperTrades.filter(t => (t.symbol || "").toUpperCase().startsWith(activeCoin.toUpperCase())).length === 0 && <p className="text-xs text-slate-500 text-center mt-4">Belum ada transaksi.</p>}
                {(showAllLogs 
                  ? paperTrades.filter(t => (t.symbol || "").toUpperCase().startsWith(activeCoin.toUpperCase())) 
                  : paperTrades.filter(t => (t.symbol || "").toUpperCase().startsWith(activeCoin.toUpperCase())).slice(0, 5)
                ).map((trade, i) => {
                  const isOpen = trade.status === "OPEN";
                  const entryPrice = parseFloat(trade.price || "0");
                  const size = parseFloat(trade.size || "0");
                  const tradeCost = entryPrice * size;
                  
                  // Perhitungan PnL Realtime
                  let unrealizedPnl = null;
                  let pnlPercent = null;
                  
                  if (isOpen && currentPrice > 0 && entryPrice > 0) {
                    const tradeLeverage = parseInt(trade.leverage || "1", 10);
                    unrealizedPnl = trade.side === "LONG" ? (currentPrice - entryPrice) * size : (entryPrice - currentPrice) * size;
                    // Fix: pnlPercent relative to MARGIN (not notional), no need to multiply leverage again
                    // margin = notional / leverage = (entryPrice * size) / tradeLeverage
                    const tradeMargin = (entryPrice * size) / tradeLeverage;
                    pnlPercent = tradeMargin > 0 ? (unrealizedPnl / tradeMargin) * 100 : 0;
                  }

                  return (
                    <div key={trade.id || i} className={`p-3 rounded-xl border transition-all ${isOpen ? "bg-slate-800/80 border-indigo-500/30 shadow-[0_4px_12px_rgba(79,70,229,0.1)]" : "bg-slate-900/40 border-slate-800/50 opacity-80"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${trade.side === "LONG" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>{trade.side}</span>
                          <span className="font-bold text-xs text-slate-200">{parseFloat(size.toString()).toFixed(4)} {trade.symbol || "BTC"}</span>
                        </div>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${isOpen ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20" : "bg-slate-800 text-slate-500 border-slate-700"}`}>{isOpen ? "LIVE" : "COMPLETED"}</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="flex flex-col">
                          <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Entry Price</span>
                          <span className="text-xs text-slate-300 font-mono">${entryPrice.toLocaleString()}</span>
                          {trade.fee > 0 && <span className="text-[8px] text-slate-600 italic block">Fee: ${trade.fee.toFixed(3)}</span>}
                          {trade.funding_fee !== undefined && trade.funding_fee !== 0 && (
                            <span className={`text-[8px] italic block ${trade.funding_fee > 0 ? "text-rose-400/80" : "text-emerald-400/80"}`}>
                              Funding: {trade.funding_fee > 0 ? "+" : ""}${parseFloat(trade.funding_fee.toString()).toFixed(4)}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">{isOpen ? "Unrealized PnL" : "Realized PnL"}</span>
                          {isOpen && unrealizedPnl !== null ? (
                            trade.funding_fee ? (
                              <div className="flex flex-col items-end">
                                <span className="text-[9px] text-slate-500 font-medium">Gross: {unrealizedPnl >= 0 ? "+" : ""}${unrealizedPnl.toFixed(2)}</span>
                                <span className={`text-xs font-bold font-mono ${(unrealizedPnl - parseFloat(trade.funding_fee.toString())) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                  Net: {(unrealizedPnl - parseFloat(trade.funding_fee.toString())) >= 0 ? "+" : ""}${(unrealizedPnl - parseFloat(trade.funding_fee.toString())).toFixed(2)}
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-end">
                                <span className={`text-xs font-bold font-mono ${unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                  {unrealizedPnl >= 0 ? "+" : ""}${unrealizedPnl.toFixed(2)}
                                </span>
                                <span className={`text-[10px] font-medium ${pnlPercent !== null && pnlPercent >= 0 ? "text-emerald-500/80" : "text-rose-500/80"}`}>
                                  {pnlPercent !== null && pnlPercent >= 0 ? "+" : ""}{pnlPercent?.toFixed(2)}%
                                </span>
                              </div>
                            )
                          ) : !isOpen ? (
                            trade.funding_fee ? (
                              <div className="flex flex-col items-end">
                                <span className="text-[9px] text-slate-500 font-medium">Gross: {parseFloat(trade.pnl || "0") >= 0 ? "+" : ""}${parseFloat(trade.pnl || "0").toFixed(2)}</span>
                                <span className={`text-xs font-bold font-mono ${(parseFloat(trade.pnl || "0") - parseFloat(trade.funding_fee.toString())) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                  Net: {(parseFloat(trade.pnl || "0") - parseFloat(trade.funding_fee.toString())) >= 0 ? "+" : ""}${(parseFloat(trade.pnl || "0") - parseFloat(trade.funding_fee.toString())).toFixed(2)}
                                </span>
                              </div>
                            ) : (
                              <span className={`text-xs font-bold font-mono ${trade.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {trade.pnl >= 0 ? "+" : ""}${parseFloat(trade.pnl || "0").toFixed(2)}
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] text-slate-500 italic">Calculating...</span>
                          )}
                        </div>
                      </div>

                      {isOpen && (
                        <button onClick={() => closeTrade(trade)} disabled={currentPrice === 0} className="w-full py-1.5 mt-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2">
                          <span>Close Position</span>
                          <span className="opacity-50 font-mono">${currentPrice.toLocaleString()}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
                {paperTrades.length > 5 && (
                  <button 
                    onClick={() => setShowAllLogs(!showAllLogs)}
                    className="w-full py-2 mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-indigo-400 transition-colors border border-dashed border-slate-800 rounded-lg hover:border-indigo-500/30"
                  >
                    {showAllLogs ? "↑ Show Less" : `↓ View All (${paperTrades.length})`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
