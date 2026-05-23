"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Settings, LayoutDashboard, BarChart3, Filter, 
  Calendar, Zap, TrendingUp, TrendingDown, RefreshCw, 
  Search, ArrowUpRight, ArrowDownLeft, ChevronLeft, ChevronRight, Lock
} from "lucide-react";
import Link from "next/link";

// SVG Icons
const ZapIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
);

export default function AnalysisPage() {
  const [trades, setTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  
  // Filters state
  const [filterMode, setFilterMode] = useState("all"); // all, paper, live
  const [filterResult, setFilterResult] = useState("all"); // all, profit, loss
  const [filterStrategy, setFilterStrategy] = useState("all");
  const [filterCoin, setFilterCoin] = useState("all");
  const [filterDate, setFilterDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) window.location.href = "/login";
    } catch (e) {
      alert("Gagal mengunci dashboard");
    }
  };

  const fetchTrades = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/all-trades");
      const d = await res.json();
      if (d.success) setTrades(d.data);
    } catch (e) {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchTrades();
  }, []);

  // Unique strategies for filter
  const strategies = useMemo(() => {
    const s = new Set<string>();
    trades.forEach(t => { if(t.strategy) s.add(t.strategy) });
    return Array.from(s);
  }, [trades]);

  // Unique coins for filter
  const coins = useMemo(() => {
    const c = new Set<string>();
    trades.forEach(t => { 
      if(t.symbol) c.add(t.symbol.split('/')[0].toUpperCase());
    });
    return Array.from(c).sort();
  }, [trades]);

  // Filtering Logic
  const filteredTrades = useMemo(() => {
    return trades.filter(t => {
      // ONLY CLOSED TRADES for Analysis
      if (t.status !== "CLOSED") return false;

      // Search
      const matchesSearch = t.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            t.side.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Mode
      const matchesMode = filterMode === "all" || (t.mode || "paper") === filterMode;
      
      // Result
      const isProfit = (t.pnl || 0) > 0;
      const matchesResult = filterResult === "all" || 
                           (filterResult === "profit" && isProfit) || 
                           (filterResult === "loss" && !isProfit && t.status === "CLOSED");
      
      // Strategy
      const matchesStrategy = filterStrategy === "all" || t.strategy === filterStrategy;
      
      // Coin
      const matchesCoin = filterCoin === "all" || (t.symbol && t.symbol.toUpperCase().startsWith(filterCoin));

      // Date
      const matchesDate = !filterDate || t.timestamp.startsWith(filterDate);

      return matchesSearch && matchesMode && matchesResult && matchesStrategy && matchesCoin && matchesDate;
    });
  }, [trades, searchTerm, filterMode, filterResult, filterStrategy, filterCoin, filterDate]);

  // Stats calculation
  const stats = useMemo(() => {
    const closed = filteredTrades.filter(t => t.status === "CLOSED");
    const totalPnl = closed.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const wins = closed.filter(t => (t.pnl || 0) > 0).length;
    const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
    
    return {
      totalTrades: filteredTrades.length,
      closedTrades: closed.length,
      totalPnl,
      winRate
    };
  }, [filteredTrades]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0b10] text-slate-200">
      
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
          <div className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-indigo-500/10 text-indigo-300 font-medium border border-indigo-500/20 text-sm cursor-default overflow-hidden">
            <BarChart3 className="w-4 h-4 shrink-0" />
            {isSidebarExpanded && <span className="whitespace-nowrap">Analisa</span>}
          </div>
          <Link href="/settings" className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 text-sm overflow-hidden">
            <Settings className="w-4 h-4 shrink-0" />
            {isSidebarExpanded && <span className="whitespace-nowrap">Settings</span>}
          </Link>
        </nav>

        <button 
          onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
          className="absolute -right-3 top-20 w-6 h-6 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-all z-20 shadow-lg text-[10px]"
        >
          {isSidebarExpanded ? "‹" : "›"}
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-y-auto">
        <header className="glass-panel border-x-0 border-t-0 p-4 px-8 flex items-center justify-between sticky top-0 z-20 bg-[#0a0b10]/80 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <BarChart3 className="text-indigo-400" /> Analisa Trading
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchTrades} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all active:scale-95">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
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

        <div className="p-8 max-w-[1600px] mx-auto w-full space-y-8">
          
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-indigo-500">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Win Rate</p>
              <h3 className="text-3xl font-black text-slate-100">{stats.winRate.toFixed(1)}%</h3>
              <div className="mt-2 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full" style={{width: `${stats.winRate}%`}}></div>
              </div>
            </div>
            <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-emerald-500">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total PnL</p>
              <h3 className={`text-3xl font-black ${stats.totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {stats.totalPnl >= 0 ? "+" : ""}${stats.totalPnl.toFixed(2)}
              </h3>
            </div>
            <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-amber-500">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Total Trades</p>
              <h3 className="text-3xl font-black text-slate-100">{stats.totalTrades}</h3>
            </div>
            <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-sky-500">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Closed Positions</p>
              <h3 className="text-3xl font-black text-slate-100">{stats.closedTrades}</h3>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="glass-panel p-4 rounded-2xl flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Cari simbol (BTC/USD)..." 
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-2 pl-10 pr-4 text-sm focus:border-indigo-500 outline-none transition-all"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-700 rounded-xl p-1">
              <button onClick={() => setFilterMode("all")} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filterMode === "all" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>SEMUA</button>
              <button onClick={() => setFilterMode("paper")} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filterMode === "paper" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>PAPER</button>
              <button onClick={() => setFilterMode("live")} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filterMode === "live" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>LIVE</button>
            </div>

            <select 
              value={filterStrategy} 
              onChange={e => setFilterStrategy(e.target.value)}
              className="bg-slate-900/50 border border-slate-700 rounded-xl py-2 px-4 text-xs font-bold outline-none focus:border-indigo-500"
            >
              <option value="all">SEMUA STRATEGI</option>
              {strategies.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
            </select>

            <select 
              value={filterCoin} 
              onChange={e => setFilterCoin(e.target.value)}
              className="bg-slate-900/50 border border-slate-700 rounded-xl py-2 px-4 text-xs font-bold outline-none focus:border-indigo-500"
            >
              <option value="all">SEMUA KOIN</option>
              {coins.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select 
              value={filterResult} 
              onChange={e => setFilterResult(e.target.value)}
              className="bg-slate-900/50 border border-slate-700 rounded-xl py-2 px-4 text-xs font-bold outline-none focus:border-indigo-500"
            >
              <option value="all">SEMUA HASIL</option>
              <option value="profit">PROFIT ONLY</option>
              <option value="loss">LOSS ONLY</option>
            </select>

            <input 
              type="date" 
              className="bg-slate-900/50 border border-slate-700 rounded-xl py-2 px-4 text-xs font-bold outline-none focus:border-indigo-500"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
            />
          </div>

          {/* Trades Table */}
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800/50 border-b border-slate-700">
                    <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Waktu</th>
                    <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Simbol</th>
                    <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Side</th>
                    <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Entry / Close</th>
                    <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Size</th>
                    <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">PnL</th>
                    <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Strategi</th>
                    <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredTrades.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-500 italic">Data transaksi tidak ditemukan.</td>
                    </tr>
                  ) : (
                    filteredTrades.map((trade) => {
                      const isProfit = (trade.pnl || 0) > 0;
                      return (
                        <tr key={trade.id} className="hover:bg-slate-800/30 transition-colors group">
                          <td className="p-4 whitespace-nowrap">
                            <p className="text-[11px] font-bold text-slate-300">{new Date(trade.timestamp).toLocaleDateString()}</p>
                            <p className="text-[10px] text-slate-500">{new Date(trade.timestamp).toLocaleTimeString()}</p>
                          </td>
                          <td className="p-4 font-black text-xs tracking-tight">{trade.symbol}</td>
                          <td className="p-4">
                            <span className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded ${trade.side === "LONG" ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"}`}>
                              {trade.side === "LONG" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                              {trade.side}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-col">
                              <span className="text-[11px] font-bold text-slate-200">${trade.price.toLocaleString()}</span>
                              {trade.close_price && <span className="text-[10px] text-slate-500">${trade.close_price.toLocaleString()}</span>}
                            </div>
                          </td>
                          <td className="p-4 text-xs font-bold text-slate-400">{trade.size} BTC</td>
                          <td className="p-4">
                            <div className="flex flex-col">
                              <span className={`text-xs font-black ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                                {isProfit ? "+" : ""}${trade.pnl?.toFixed(2)}
                              </span>
                              {trade.pnl !== undefined && trade.pnl !== null && (trade.price * trade.size) > 0 && (
                                <span className={`text-[10px] font-medium ${isProfit ? "text-emerald-500/80" : "text-rose-500/80"}`}>
                                  {isProfit ? "+" : ""}{((trade.pnl / (trade.price * trade.size)) * 100 * (parseInt(trade.leverage || "1", 10))).toFixed(2)}% ({trade.leverage || "1"}x)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-4">
                            <span className="text-[10px] font-bold bg-slate-700/50 px-2 py-1 rounded text-slate-300 uppercase">{trade.strategy || "Manual"}</span>
                          </td>
                          <td className="p-4">
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${trade.mode === "live" ? "border-emerald-500/30 text-emerald-500" : "border-amber-500/30 text-amber-500"}`}>
                              {trade.mode?.toUpperCase() || "PAPER"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
