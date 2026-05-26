"use client";

import { useState } from "react";
import { 
  Settings, Activity, LayoutDashboard, BarChart3, Lock, Terminal, BookOpen, 
  Shield, Zap, Compass, Info, TrendingUp, AlertTriangle, Scale, CheckCircle2, XCircle
} from "lucide-react";
import Link from "next/link";

const ZapIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
);

type MarketCondition = "bull_trend" | "bear_trend" | "flat_sideways" | "high_volatility";

interface StrategyData {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  risk: "Low" | "Medium" | "High";
  riskColor: string;
  riskPercent: number;
  timeframe: string;
  bestFor: string;
  indicators: string[];
  pros: string[];
  cons: string[];
  description: string;
  compatibility: Record<MarketCondition, { score: number; text: string }>;
}

const STRATEGIES: StrategyData[] = [
  {
    id: "rapid_scalper",
    name: "Rapid Scalper (EMA Cross)",
    emoji: "⚡",
    tagline: "Eksekusi kilat memanfaatkan momentum persilangan rata-rata bergerak super cepat.",
    risk: "High",
    riskColor: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    riskPercent: 85,
    timeframe: "1m - 3m",
    bestFor: "Koin Likuiditas Tinggi (BTC, ETH)",
    indicators: ["EMA 2 (Fast)", "EMA 5 (Slow)"],
    pros: [
      "Sangat responsif terhadap pembalikan arah instan.",
      "Frekuensi perdagangan tinggi untuk perolehan profit mikro berkelanjutan.",
      "Sederhana tanpa keterlambatan indikator rumit."
    ],
    cons: [
      "Banyak memicu sinyal palsu (whipsaw) saat pasar sideways.",
      "Biaya trading (fee) dapat membengkak akibat tingginya frekuensi perdagangan."
    ],
    description: "Menggunakan dua Exponential Moving Average (EMA) dengan periode super pendek (2 dan 5) untuk mendeteksi perubahan momentum mikro secara instan. Ketika EMA-2 menyilang di atas EMA-5, bot akan langsung membuka posisi LONG, begitu pula sebaliknya untuk SHORT.",
    compatibility: {
      bull_trend: { score: 75, text: "Sangat baik jika tren memiliki akselerasi cepat." },
      bear_trend: { score: 75, text: "Sangat baik untuk menangkap jatuhnya harga secara cepat." },
      flat_sideways: { score: 20, text: "Berbahaya. Sinyal palsu akan menguras saldo Anda." },
      high_volatility: { score: 90, text: "Luar biasa. Sangat lincah di pergerakan liar." }
    }
  },
  {
    id: "real_strength_scalper",
    name: "Real Strength Scalper (RSS)",
    emoji: "🛡️",
    tagline: "Strategi komprehensif berbasis kekuatan tren, konfirmasi volume, dan penyaring arah pasar.",
    risk: "Medium",
    riskColor: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    riskPercent: 55,
    timeframe: "1m - 5m",
    bestFor: "Koin dengan Volatilitas Menengah (SUI, SOL, ARB)",
    indicators: ["ROC Momentum (9)", "Volume Ratio (20)", "ADX & DMI (14)", "SMA 30 & 60 Filter"],
    pros: [
      "Akurasi sinyal masuk yang sangat tinggi berkat penyaring ganda.",
      "Menghindari jebakan sideways dengan filter ADX dan Volume.",
      "Menjamin perdagangan searah tren besar dengan filter SMA ganda."
    ],
    cons: [
      "Sedikit terlambat masuk tren (lagging) demi konfirmasi keamanan.",
      "Melewatkan tren mikro yang berjalan terlalu cepat."
    ],
    description: "Menggabungkan indikator kekuatan tren ADX, arah momentum DMI, rasio volume transaksi di atas rata-rata (Volume Ratio), momentum harga (ROC), serta penyaring tren makro (SMA 30/60). Bot hanya akan melakukan entri jika seluruh elemen ini menyetujui arah yang sama.",
    compatibility: {
      bull_trend: { score: 95, text: "Luar biasa. Mengunci profit di sepanjang tren naik." },
      bear_trend: { score: 90, text: "Sangat tangguh mendeteksi momentum short yang valid." },
      flat_sideways: { score: 65, text: "Aman. Bot akan memilih HOLD karena kekuatan tren (ADX) rendah." },
      high_volatility: { score: 80, text: "Cukup baik jika volatilitas memiliki arah tren jelas." }
    }
  },
  {
    id: "confirmed_fibonacci",
    name: "Confirmed Fibonacci Strategy",
    emoji: "📐",
    tagline: "Strategi geometri pasar dengan memburu area diskon Golden Ratio pasca perubahan struktur harga.",
    risk: "Low",
    riskColor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    riskPercent: 30,
    timeframe: "3m - 15m",
    bestFor: "Semua Koin yang memiliki Ayunan Gelombang Sehat",
    indicators: ["Pivot High/Low (8)", "Fibonacci Retracement (0.618 - 0.786)", "ATR 14"],
    pros: [
      "Rasio Risk/Reward (R:R) terbaik karena membeli di ujung koreksi terendah.",
      "Memanfaatkan titik pantulan paling kuat secara matematis.",
      "Mengurangi emosi dengan menunggu di area diskon."
    ],
    cons: [
      "Frekuensi perdagangan sangat rendah, membutuhkan kesabaran tinggi.",
      "Sinyal bisa dibatalkan jika harga menembus area invalidasi."
    ],
    description: "Mendeteksi perubahan arah pasar melalui Break of Structure (BOS) dari ayunan pivot harga tertinggi/terendah. Begitu terjadi patah struktur, bot akan menarik garis Fibonacci dan memasang jaring entri eksklusif hanya pada area Golden Zone (61.8% - 78.6% retracement).",
    compatibility: {
      bull_trend: { score: 90, text: "Sempurna untuk strategi 'Buy the Dip' di pasar naik." },
      bear_trend: { score: 85, text: "Sangat baik untuk memburu 'Sell the Rally' di area premium." },
      flat_sideways: { score: 30, text: "Kurang efektif karena ayunan harga terlalu sempit." },
      high_volatility: { score: 70, text: "Berfungsi dengan baik jika ayunan membentuk pivot stabil." }
    }
  },
  {
    id: "ichimoku_ultimate",
    name: "Ichimoku Ultimate Pro",
    emoji: "🐉",
    tagline: "Sistem grafik awan legendaris Jepang untuk navigasi tren makro multi-dimensi.",
    risk: "Medium",
    riskColor: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    riskPercent: 50,
    timeframe: "3m - 1h",
    bestFor: "Koin berkapitalisasi besar dengan tren stabil",
    indicators: ["Tenkan-Sen (9)", "Kijun-Sen (26)", "Senkou Span A & B (52)", "Chikou Span (26)"],
    pros: [
      "Menyajikan support & resistance dinamis paling andal melalui awan Kumo.",
      "Menyaring pembalikan arah palsu dengan konfirmasi Chikou Span.",
      "Sangat kokoh untuk melipatgandakan profit pada tren berkelanjutan."
    ],
    cons: [
      "Menghasilkan keputusan membingungkan saat harga terombang-ambing di dalam awan.",
      "Memerlukan waktu pemanasan lilin (warmup) yang lebih panjang (minimal 80 bars)."
    ],
    description: "Sistem trading legendaris yang memanfaatkan lima garis dinamis. Sinyal entri dipicu saat terjadi persilangan Tenkan/Kijun (TK Cross), dengan syarat didukung penuh oleh warna awan Kumo masa depan, posisi harga relatif terhadap awan saat ini, dan kekuatan lagger Chikou Span.",
    compatibility: {
      bull_trend: { score: 95, text: "Sempurna. Mengunci tren naik jangka menengah secara utuh." },
      bear_trend: { score: 95, text: "Luar biasa untuk mengarungi tren turun di bawah awan." },
      flat_sideways: { score: 40, text: "Buruk. Harga akan terjebak di dalam awan dan sering terpotong." },
      high_volatility: { score: 75, text: "Cukup baik jika volatilitas berujung pada breakout awan." }
    }
  },
  {
    id: "adaptive_fib_trailing",
    name: "Adaptive Fib Trailing (AFT)",
    emoji: "🌀",
    tagline: "Sistem pengikut tren dinamis yang menyesuaikan stop retracement berdasarkan regime volatilitas pasar.",
    risk: "Medium",
    riskColor: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    riskPercent: 60,
    timeframe: "3m - 30m",
    bestFor: "Koin Tren Kuat & Volatilitas Dinamis",
    indicators: ["Pivot High/Low (13)", "ADX & DMI (14)", "ATR Volatility Ratio", "SMA 50 Confluence"],
    pros: [
      "Mengurangi whipsaw secara dramatis di pasar sideways dengan merapatkan stop.",
      "Mengunci profit maksimal di tren kuat dengan melonggarkan batas retracement.",
      "Mempunyai sistem penilaian tingkat keyakinan (Confidence Grade A-D) bawaan."
    ],
    cons: [
      "Memerlukan setidaknya 60 lilin pemanasan awal untuk kestabilan sinyal.",
      "Cukup sensitif terhadap pergeseran mendadak dari tren ke konsolidasi ketat."
    ],
    description: "Menggabungkan pendeteksian pivot struktur harga (lookback 13) dengan analisis regime pasar ADX dan Volatility Ratio. Jarak stop ditarik berdasarkan rasio Fibonacci (0.382 / 0.50 / 0.618) yang beradaptasi secara otomatis: stop lebar saat trending, stop rapat saat sideways, dan stop menengah di kondisi volatil tinggi.",
    compatibility: {
      bull_trend: { score: 95, text: "Sangat tangguh. Retracement 0.382 mengunci keuntungan besar." },
      bear_trend: { score: 90, text: "Sangat baik menangkap pullback pendek di pasar turun." },
      flat_sideways: { score: 70, text: "Cukup aman. Stop rapat (0.618) membatasi kerugian saat sideways." },
      high_volatility: { score: 85, text: "Bagus. Penyesuaian ATR melebarkan stop agar tidak terlempar dini." }
    }
  }
];

export default function AlmanacPage() {
  const [selectedMarket, setSelectedMarket] = useState<MarketCondition>("bull_trend");
  const [selectedStrategy, setSelectedStrategy] = useState<string>("real_strength_scalper");
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

  const activeStrategy = STRATEGIES.find(s => s.id === selectedStrategy) || STRATEGIES[1];

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-emerald-400 font-bold bg-emerald-500/10 border-emerald-500/20";
    if (score >= 70) return "text-indigo-400 font-semibold bg-indigo-500/10 border-indigo-500/20";
    if (score >= 50) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    return "text-rose-400 bg-rose-500/10 border-rose-500/20";
  };

  return (
    <div className="flex h-screen overflow-hidden">
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
            <BookOpen className="w-4 h-4 shrink-0" />
            {isSidebarExpanded && <span className="whitespace-nowrap">Almanac</span>}
          </div>
          <Link href="/terminal" className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 text-sm overflow-hidden font-sans">
            <Terminal className="w-4 h-4 shrink-0" />
            {isSidebarExpanded && <span className="whitespace-nowrap">Terminal & Logs</span>}
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
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-y-auto pb-16 md:pb-0 bg-slate-950">
        {/* Header */}
        <header className="glass-panel border-x-0 border-t-0 p-4 px-6 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-200">Almanac & Panduan Strategi</h2>
          </div>
          <Link href="/settings" className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold text-white shadow-[0_0_15px_rgba(79,70,229,0.3)] transition-all">
            ⚙️ Terapkan di Settings
          </Link>
        </header>

        <div className="p-6 max-w-6xl mx-auto w-full space-y-8">
          {/* Section 1: Hero Section */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/30 p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-6">
            <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-[100px] -z-10" />
            <div className="flex-1 space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400 bg-indigo-400/10 px-2.5 py-1 rounded-full">Almanac Pasar Cerdas</span>
              <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Temukan Strategi Terbaik untuk Pasar Saat Ini</h1>
              <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">
                Setiap algoritma memiliki keunggulan geografis dan kecocokan tren tersendiri. Gunakan asisten pencocokan di bawah ini untuk mensimulasikan kondisi pasar real-time dan melihat rekomendasi otomatis kami.
              </p>
            </div>
          </div>

          {/* Section 2: Interactive Market Matcher */}
          <div className="glass-panel rounded-xl p-6 border-slate-800/80 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-800/50">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Compass className="w-4 h-4 text-indigo-400" />
                  Pencocok Strategi Otomatis
                </h3>
                <p className="text-xs text-slate-500">Pilih keadaan pasar saat ini untuk melihat tingkat kesesuaian algoritma.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["bull_trend", "bear_trend", "flat_sideways", "high_volatility"] as MarketCondition[]).map((cond) => (
                  <button
                    key={cond}
                    onClick={() => setSelectedMarket(cond)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all border ${
                      selectedMarket === cond
                        ? "bg-indigo-600 border-indigo-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.35)] scale-[1.02]"
                        : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {cond === "bull_trend" ? "📈 Tren Kuat Bullish" :
                     cond === "bear_trend" ? "📉 Tren Kuat Bearish" :
                     cond === "flat_sideways" ? "⏸️ Konsolidasi (Sideways)" :
                     "🔥 Volatilitas Tinggi / Breakout"}
                  </button>
                ))}
              </div>
            </div>

            {/* Score Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {STRATEGIES.map((strat) => {
                const compat = strat.compatibility[selectedMarket];
                const isBest = compat.score === Math.max(...STRATEGIES.map(s => s.compatibility[selectedMarket].score));

                return (
                  <div 
                    key={strat.id} 
                    onClick={() => setSelectedStrategy(strat.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer relative group flex flex-col justify-between ${
                      selectedStrategy === strat.id 
                        ? "bg-slate-900/80 border-indigo-500/80 shadow-[0_0_20px_rgba(99,102,241,0.15)]" 
                        : "bg-slate-900/30 border-slate-800/80 hover:border-slate-700/80"
                    } ${isBest ? "ring-1 ring-emerald-500/30" : ""}`}
                  >
                    {isBest && (
                      <span className="absolute -top-2.5 right-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        ⭐ Rekomendasi Utama
                      </span>
                    )}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{strat.emoji}</span>
                        <h4 className="text-xs font-bold text-slate-200 leading-tight group-hover:text-indigo-300 transition-colors">{strat.name}</h4>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">{strat.tagline}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/50 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">Kesesuaian:</span>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${getScoreColor(compat.score)}`}>
                        {compat.score}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Detailed Strategy Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left selector */}
            <div className="lg:col-span-1 space-y-3">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider px-1">Daftar Algoritma</h3>
              <div className="flex flex-col gap-2">
                {STRATEGIES.map((strat) => (
                  <button
                    key={strat.id}
                    onClick={() => setSelectedStrategy(strat.id)}
                    className={`w-full p-4 rounded-xl border text-left flex items-start gap-3 transition-all ${
                      selectedStrategy === strat.id
                        ? "bg-indigo-600/10 border-indigo-500/40 text-slate-100 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]"
                        : "bg-slate-900/30 border-slate-800/60 hover:bg-slate-900/50 text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    <span className="text-2xl mt-0.5 bg-slate-950/40 w-10 h-10 rounded-lg flex items-center justify-center border border-slate-800/40 shrink-0">{strat.emoji}</span>
                    <div className="space-y-0.5 overflow-hidden">
                      <h4 className="text-xs font-bold leading-tight truncate">{strat.name}</h4>
                      <p className="text-[10px] text-slate-500 font-medium tracking-wide">{strat.timeframe} • {strat.risk} Risk</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right Detailed Inspector Panel */}
            <div className="lg:col-span-2 glass-panel rounded-xl p-6 border-slate-800/80 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/50">
                <div className="flex items-center gap-3">
                  <span className="text-3xl bg-indigo-500/10 p-2.5 rounded-xl border border-indigo-500/20">{activeStrategy.emoji}</span>
                  <div className="space-y-0.5">
                    <h3 className="text-base font-bold text-slate-100">{activeStrategy.name}</h3>
                    <p className="text-xs text-slate-500 font-sans">Timeframe optimal: <span className="text-indigo-400 font-semibold">{activeStrategy.timeframe}</span></p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider ${activeStrategy.riskColor}`}>
                    ⚡ Risk: {activeStrategy.risk}
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-indigo-400" />
                  Bagaimana Cara Kerjanya?
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed font-sans bg-slate-900/30 p-3.5 rounded-lg border border-slate-900/80">
                  {activeStrategy.description}
                </p>
              </div>

              {/* Indicator Tags */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-indigo-400" />
                  Kumpulan Indikator Utama
                </h4>
                <div className="flex flex-wrap gap-2">
                  {activeStrategy.indicators.map((ind, i) => (
                    <span key={i} className="px-3 py-1.5 bg-slate-900 text-slate-300 border border-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full shrink-0" />
                      {ind}
                    </span>
                  ))}
                </div>
              </div>

              {/* Risk Level Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <h4 className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5 text-indigo-400" />
                    Profil Risiko & Volatilitas
                  </h4>
                  <span className="text-[10px] text-slate-500">Tingkat Paparan: {activeStrategy.riskPercent}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      activeStrategy.risk === "High" ? "bg-rose-500" :
                      activeStrategy.risk === "Medium" ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${activeStrategy.riskPercent}%` }}
                  />
                </div>
              </div>

              {/* Pros and Cons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/10 space-y-3">
                  <h5 className="text-xs font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Kelebihan / Keuntungan
                  </h5>
                  <ul className="space-y-1.5">
                    {activeStrategy.pros.map((pro, i) => (
                      <li key={i} className="text-[11px] text-slate-300 leading-relaxed flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
                        <span>{pro}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-lg bg-rose-500/5 border border-rose-500/10 space-y-3">
                  <h5 className="text-xs font-bold text-rose-400 uppercase tracking-wide flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 shrink-0" />
                    Kekurangan / Risiko
                  </h5>
                  <ul className="space-y-1.5">
                    {activeStrategy.cons.map((con, i) => (
                      <li key={i} className="text-[11px] text-slate-300 leading-relaxed flex items-start gap-2">
                        <span className="text-rose-500 mt-0.5 shrink-0">•</span>
                        <span>{con}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Compact Comparison Table */}
          <div className="glass-panel rounded-xl p-6 border-slate-800/80 space-y-4">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Scale className="w-4 h-4 text-indigo-400" />
              Tabel Perbandingan Ringkas
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-800/80">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/80 text-[10px] text-slate-400 uppercase font-bold tracking-wider border-b border-slate-800">
                    <th className="p-3.5">Strategi</th>
                    <th className="p-3.5">Akurasi</th>
                    <th className="p-3.5">Profil Risiko</th>
                    <th className="p-3.5">Frekuensi</th>
                    <th className="p-3.5">Optimal Saat...</th>
                    <th className="p-3.5">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-xs">
                  {STRATEGIES.map((strat) => (
                    <tr key={strat.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="p-3.5 font-bold text-slate-200 flex items-center gap-2">
                        <span className="text-lg">{strat.emoji}</span>
                        <span>{strat.name}</span>
                      </td>
                      <td className="p-3.5 font-medium text-slate-300">
                        {strat.id === "confirmed_fibonacci" ? "🥇 Sangat Tinggi" :
                         strat.id === "real_strength_scalper" ? "🥈 Tinggi" :
                         strat.id === "ichimoku_ultimate" ? "🥈 Tinggi" :
                         strat.id === "adaptive_fib_trailing" ? "🥈 Tinggi" : "🥉 Rendah-Sedang"}
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border uppercase tracking-wider ${strat.riskColor}`}>
                          {strat.risk}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-400">
                        {strat.id === "rapid_scalper" ? "⚡ Hiperaktif" :
                         strat.id === "real_strength_scalper" ? "⏱️ Sedang" :
                         strat.id === "ichimoku_ultimate" ? "⏱️ Sedang" :
                         strat.id === "adaptive_fib_trailing" ? "⏱️ Sedang" : "🐌 Lambat (Selektif)"}
                      </td>
                      <td className="p-3.5 text-slate-400 italic">
                        {strat.id === "rapid_scalper" ? "Volatilitas kilat & tren tajam" :
                         strat.id === "real_strength_scalper" ? "Pembalikan & tren berlanjut" :
                         strat.id === "ichimoku_ultimate" ? "Tren jangka menengah-panjang" :
                         strat.id === "adaptive_fib_trailing" ? "Tren adaptif & swing volatilitas" : "Koreksi sehat / ayunan tangga"}
                      </td>
                      <td className="p-3.5">
                        <button
                          onClick={() => setSelectedStrategy(strat.id)}
                          className="px-3 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-300 font-bold hover:text-indigo-400 hover:border-indigo-500/40 transition-all"
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
