"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { 
  Settings, Activity, LayoutDashboard, BarChart3, Lock, Terminal, RefreshCw, AlertCircle, Cpu, HardDrive, Search, Sliders, Info
} from "lucide-react";
import Link from "next/link";

// SVG Icons
const ZapIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
);

type ToastType = "success" | "error" | "info";
type ToastItem = { id: number; message: string; type: ToastType };

type DockerContainer = {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Created: number;
  Ports: Array<{ PrivatePort: number; PublicPort: number; Type: string }>;
};

type ContainerStats = {
  cpu_percent: number;
  memory_usage: string; // formatted
  memory_percent: number;
};

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

export default function TerminalPage() {
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [selectedContainer, setSelectedContainer] = useState<string>("");
  const [logs, setLogs] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [logTail, setLogTail] = useState<number>(300);
  const [isAutoScroll, setIsAutoScroll] = useState<boolean>(true);
  const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(true);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  
  // Stats states
  const [stats, setStats] = useState<Record<string, ContainerStats>>({});
  
  // UI states
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(false);
  
  const consoleRef = useRef<HTMLPreElement>(null);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  // 1. Fetch docker containers
  const fetchContainers = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingList(true);
    try {
      const res = await fetch("/api/docker");
      const data = await res.json();
      if (data.success) {
        setContainers(data.containers);
        
        // Auto select the engine container if found and none selected
        if (!selectedContainer && data.containers.length > 0) {
          const engine = data.containers.find((c: DockerContainer) => 
            c.Names.some(n => n.includes("engine"))
          );
          if (engine) {
            setSelectedContainer(engine.Id);
          } else {
            setSelectedContainer(data.containers[0].Id);
          }
        }
      } else {
        addToast(data.error || "Gagal mendapatkan list kontainer", "error");
      }
    } catch (e: any) {
      addToast(`Error jaringan: ${e.message}`, "error");
    } finally {
      if (!isSilent) setLoadingList(false);
    }
  }, [selectedContainer, addToast]);

  // 2. Fetch logs for selected container
  const fetchLogs = useCallback(async (isSilent = false) => {
    if (!selectedContainer) return;
    if (!isSilent) setLoadingLogs(true);
    try {
      const res = await fetch(`/api/docker?action=logs&container=${selectedContainer}&tail=${logTail}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs);
      } else {
        setLogs(`Error memuat logs:\n${data.error}\n\n${data.details || ""}`);
      }
    } catch (e: any) {
      setLogs(`Koneksi gagal: ${e.message}`);
    } finally {
      if (!isSilent) setLoadingLogs(false);
    }
  }, [selectedContainer, logTail]);

  // 3. Fetch CPU/Memory stats for containers
  const fetchContainerStats = useCallback(async (containerId: string) => {
    try {
      const res = await fetch(`/api/docker?action=stats&container=${containerId}`);
      const data = await res.json();
      if (data.success && data.stats) {
        const raw = data.stats;
        
        // Calculate CPU usage percentage
        let cpuPercent = 0;
        if (raw.cpu_stats && raw.precpu_stats) {
          const cpuDelta = raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
          const systemDelta = raw.cpu_stats.system_cpu_usage - raw.precpu_stats.system_cpu_usage;
          const onlineCpus = raw.cpu_stats.online_cpus || 1;
          if (systemDelta > 0 && cpuDelta > 0) {
            cpuPercent = (cpuDelta / systemDelta) * onlineCpus * 100;
          }
        }

        // Calculate Memory usage
        let memUsage = "0 MB";
        let memPercent = 0;
        if (raw.memory_stats && raw.memory_stats.usage) {
          const bytes = raw.memory_stats.usage;
          const limit = raw.memory_stats.limit || 1;
          const mb = bytes / (1024 * 1024);
          memUsage = `${mb.toFixed(1)} MB`;
          memPercent = (bytes / limit) * 100;
        }

        setStats(prev => ({
          ...prev,
          [containerId]: {
            cpu_percent: Math.min(cpuPercent, 100),
            memory_usage: memUsage,
            memory_percent: Math.min(memPercent, 100)
          }
        }));
      }
    } catch (e) {
      // Quiet fail to avoid spamming alerts
    }
  }, []);

  // Initial mount load
  useEffect(() => {
    fetchContainers();
  }, [fetchContainers]);

  // Periodic Log Refresh
  useEffect(() => {
    if (autoRefreshIntervalRef.current) clearInterval(autoRefreshIntervalRef.current);
    
    if (isAutoRefresh && selectedContainer) {
      autoRefreshIntervalRef.current = setInterval(() => {
        fetchLogs(true);
      }, 3500);
    }
    
    return () => {
      if (autoRefreshIntervalRef.current) clearInterval(autoRefreshIntervalRef.current);
    };
  }, [isAutoRefresh, selectedContainer, logTail, fetchLogs]);

  // Logs trigger on change of selected container or tail amount
  useEffect(() => {
    if (selectedContainer) {
      fetchLogs();
      fetchContainerStats(selectedContainer);
    }
  }, [selectedContainer, logTail, fetchLogs, fetchContainerStats]);

  // Auto-fetch stats periodically for all running containers
  useEffect(() => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    
    if (containers.length > 0) {
      const runningContainers = containers.filter(c => c.State === "running");
      
      const fetchAllStats = () => {
        runningContainers.forEach(c => {
          fetchContainerStats(c.Id);
        });
      };
      
      fetchAllStats(); // Initial check
      statsIntervalRef.current = setInterval(fetchAllStats, 10000); // Every 10s
    }
    
    return () => {
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    };
  }, [containers, fetchContainerStats]);

  // Auto-scroll logs logic
  useEffect(() => {
    if (isAutoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs, isAutoScroll]);

  // Helper to colorize terminal output lines
  const colorizeLogLine = (line: string, index: number) => {
    if (!line.trim()) return <div key={index} className="h-4"></div>;

    // ISO timestamp parser (e.g. 2026-05-24T06:22:42.123456Z or 2026-05-24 06:22:42)
    const timestampRegex = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\s*)/;
    const match = line.match(timestampRegex);
    
    let timestampPart = "";
    let contentPart = line;
    
    if (match) {
      timestampPart = match[1];
      contentPart = line.substring(timestampPart.length);
    }

    const lowerContent = contentPart.toLowerCase();
    let textClass = "text-slate-300";

    if (lowerContent.includes("error") || lowerContent.includes("exception") || lowerContent.includes("fail") || lowerContent.includes("critical")) {
      textClass = "text-rose-400 font-semibold bg-rose-950/20 px-1 rounded";
    } else if (lowerContent.includes("warning") || lowerContent.includes("warn")) {
      textClass = "text-amber-400 font-semibold bg-amber-950/10 px-1 rounded";
    } else if (lowerContent.includes("success") || lowerContent.includes("connected") || lowerContent.includes("successfully") || lowerContent.includes("placed order")) {
      textClass = "text-emerald-400 font-semibold";
    } else if (lowerContent.includes("info")) {
      textClass = "text-blue-400";
    } else if (lowerContent.includes("debug")) {
      textClass = "text-slate-500 text-xs";
    }

    return (
      <div key={index} className="flex hover:bg-slate-900/40 py-0.5 px-2 border-l border-transparent hover:border-indigo-500/50 transition-colors">
        <span className="text-[10px] text-slate-600 w-8 select-none shrink-0 text-right pr-2 font-mono">
          {index + 1}
        </span>
        {timestampPart && (
          <span className="text-cyan-600/80 shrink-0 font-mono text-[11px] select-all mr-2">
            {timestampPart.trim()}
          </span>
        )}
        <span className={`font-mono text-xs whitespace-pre-wrap select-all break-all ${textClass}`}>
          {contentPart}
        </span>
      </div>
    );
  };

  // Filter logs based on search query
  const filteredLogLines = logs.split("\n").filter((line) => {
    if (!searchQuery) return true;
    return line.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const activeContainer = containers.find(c => c.Id === selectedContainer);

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
          <div className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-indigo-500/10 text-indigo-300 font-medium border border-indigo-500/20 text-sm cursor-default overflow-hidden">
            <Terminal className="w-4 h-4 shrink-0" />
            {isSidebarExpanded && <span className="whitespace-nowrap">Terminal & Logs</span>}
          </div>
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
      </aside>

      {/* Main Panel */}
      <main className="flex-1 flex flex-col h-full overflow-hidden pb-16 md:pb-0 bg-slate-950/40">
        <header className="glass-panel border-x-0 border-t-0 p-3 px-6 flex items-center justify-between z-20">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-200">Terminal & Logs Docker</h2>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => fetchContainers()} 
              disabled={loadingList}
              className="p-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
              title="Refresh Container List"
            >
              <RefreshCw className={`w-4 h-4 ${loadingList ? "animate-spin" : ""}`} />
            </button>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 border border-rose-500/20 transition-all text-xs font-bold"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Lock</span>
            </button>
          </div>
        </header>

        <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden p-6 gap-6 pb-24 lg:pb-6">
          {/* Left panel: Containers list & Control */}
          <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4 overflow-y-auto pr-1">
            <div className="glass-panel p-4 rounded-xl flex flex-col gap-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                <span>Docker Container Status</span>
              </h3>
              
              {loadingList ? (
                <div className="flex flex-col gap-2 py-4 items-center justify-center text-slate-500 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin text-indigo-500 mb-1" />
                  <span>Mendeteksi container VPS...</span>
                </div>
              ) : containers.length === 0 ? (
                <div className="text-xs text-rose-400 p-3 bg-rose-500/5 border border-rose-500/20 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Docker Socket Error</p>
                    <p className="text-[10px] text-slate-400 mt-1">Gagal terhubung ke docker daemon socket. Apakah docker berjalan dan mounted?</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {containers.map((c) => {
                    const containerName = c.Names[0]?.replace(/^\//, "") || c.Id.slice(0, 12);
                    const isSelected = selectedContainer === c.Id;
                    const isRunning = c.State === "running";
                    
                    const stat = stats[c.Id];

                    return (
                      <div 
                        key={c.Id}
                        onClick={() => setSelectedContainer(c.Id)}
                        className={`group p-3 rounded-lg border transition-all cursor-pointer flex flex-col gap-2 relative overflow-hidden ${isSelected ? "bg-indigo-500/10 border-indigo-500/40 shadow-[inset_0_0_12px_rgba(99,102,241,0.15)]" : "bg-slate-900/60 border-slate-800 hover:border-slate-700"}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col min-w-0">
                            <span className={`text-xs font-bold truncate ${isSelected ? "text-indigo-300" : "text-slate-200 group-hover:text-white"}`}>
                              {containerName}
                            </span>
                            <span className="text-[10px] text-slate-500 truncate mt-0.5">
                              {c.Image.split("@")[0]}
                            </span>
                          </div>
                          
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${isRunning ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/15 text-rose-400 border border-rose-500/20"}`}>
                            {c.State}
                          </span>
                        </div>

                        {/* CPU / RAM stats mini widget */}
                        {isRunning && stat && (
                          <div className="grid grid-cols-2 gap-2 mt-1.5 pt-1.5 border-t border-slate-800/60 text-[10px]">
                            <div className="flex items-center gap-1.5 text-slate-400">
                              <Cpu className="w-3 h-3 text-indigo-400 shrink-0" />
                              <span className="truncate">CPU: {stat.cpu_percent.toFixed(1)}%</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-400">
                              <HardDrive className="w-3 h-3 text-indigo-400 shrink-0" />
                              <span className="truncate">RAM: {stat.memory_usage}</span>
                            </div>
                          </div>
                        )}

                        <div className="text-[10px] text-slate-500 mt-1 italic">
                          {c.Status}
                        </div>

                        {/* Interactive overlay indicator */}
                        {isSelected && (
                          <div className="absolute right-0 top-0 bottom-0 w-1 bg-indigo-500 shadow-[0_0_10px_#4f46e5]"></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Selected Container Detail Panel */}
            {activeContainer && (
              <div className="glass-panel p-4 rounded-xl flex flex-col gap-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Detail Kontainer</span>
                </h3>
                <div className="flex flex-col gap-2 text-[11px]">
                  <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="text-slate-500">Nama</span>
                    <span className="text-slate-300 font-bold font-mono">{activeContainer.Names[0]?.replace(/^\//, "")}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="text-slate-500">ID</span>
                    <span className="text-slate-300 font-mono" title={activeContainer.Id}>{activeContainer.Id.slice(0, 12)}</span>
                  </div>
                  <div className="flex flex-col border-b border-slate-800/60 pb-1.5 gap-1">
                    <span className="text-slate-500 font-medium">Image</span>
                    <span className="text-slate-300 font-mono break-all text-[10px]">{activeContainer.Image.split("@")[0]}</span>
                  </div>
                  {activeContainer.Ports && activeContainer.Ports.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-slate-500">Port Mapping</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {activeContainer.Ports.map((p, idx) => (
                          <span key={idx} className="bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-[10px] text-slate-400 font-mono">
                            {p.PublicPort ? `${p.PublicPort}->` : ""}{p.PrivatePort}/{p.Type}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* System Info card */}
            <div className="glass-panel p-4 rounded-xl text-xs text-slate-400 flex flex-col gap-2">
              <span className="font-bold text-slate-300">💡 Docker Tips</span>
              <p className="leading-relaxed text-[11px] text-slate-500">
                Konsol ini bersifat <strong>Read-Only</strong> dan aman untuk memantau status logs di VPS Anda secara real-time. Jika Anda mendeteksi kegagalan transaksi / error bot, periksa logs menggunakan input kata kunci di atas.
              </p>
            </div>
          </div>

          {/* Right panel: Log Terminal Console */}
          <div className="flex-1 min-h-[500px] lg:min-h-0 flex flex-col glass-panel rounded-xl overflow-hidden border border-slate-800/80 bg-slate-950">
            {/* Console header controls */}
            <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 px-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-xs font-mono font-bold text-slate-200">
                  {activeContainer ? activeContainer.Names[0]?.replace(/^\//, "") : "pilih container"}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  ({filteredLogLines.length} baris ditemukan)
                </span>
              </div>
              
              <div className="flex items-center gap-3 flex-wrap">
                {/* Search Bar */}
                <div className="relative w-44">
                  <input
                    type="text"
                    placeholder="Cari kata kunci..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-indigo-500 transition-all font-mono"
                  />
                  <Search className="absolute left-2.5 top-1.5 w-3.5 h-3.5 text-slate-500" />
                </div>

                {/* Log Tail dropdown */}
                <select
                  value={logTail}
                  onChange={(e) => setLogTail(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-700 text-slate-300 text-[11px] px-2 py-1 rounded-lg focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer"
                >
                  <option value={100}>Tail: 100</option>
                  <option value={300}>Tail: 300</option>
                  <option value={500}>Tail: 500</option>
                  <option value={1000}>Tail: 1000</option>
                </select>

                {/* Autoscroll checkbox */}
                <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isAutoScroll}
                    onChange={(e) => setIsAutoScroll(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0 focus:ring-offset-0"
                  />
                  <span>AutoScroll</span>
                </label>

                {/* Autorefresh checkbox */}
                <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isAutoRefresh}
                    onChange={(e) => setIsAutoRefresh(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0 focus:ring-offset-0"
                  />
                  <span>AutoRefresh</span>
                </label>

                <button 
                  onClick={() => fetchLogs()} 
                  disabled={loadingLogs}
                  className="p-1 bg-slate-950 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                  title="Manual Reload logs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Console body */}
            <div className="flex-1 overflow-auto p-2 bg-slate-950/90 font-mono">
              {loadingLogs && logs.length === 0 ? (
                <div className="flex flex-col gap-2 items-center justify-center h-full text-slate-500 text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                  <span>Menghubungkan ke kontainer & mengambil logs...</span>
                </div>
              ) : filteredLogLines.length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-600 text-xs italic">
                  {searchQuery ? "Tidak ada logs yang cocok dengan pencarian" : "Tidak ada logs yang tersedia"}
                </div>
              ) : (
                <pre 
                  ref={consoleRef}
                  className="h-full overflow-y-auto flex flex-col pr-2 text-left"
                  style={{ maxHeight: "calc(100vh - 210px)" }}
                >
                  {filteredLogLines.map((line, idx) => colorizeLogLine(line, idx))}
                </pre>
              )}
            </div>
            
            {/* Footer information */}
            <div className="p-2 bg-slate-900 border-t border-slate-800 text-[10px] text-slate-500 font-mono flex items-center justify-between px-4">
              <span>Status: {loadingLogs ? "Membaca data stream..." : "Aktif & Terkoneksi"}</span>
              <span>Gunakan pencarian untuk menyaring error log secara instan</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
