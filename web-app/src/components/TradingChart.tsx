"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCw } from "lucide-react";

type Trade = {
  id: number;
  side: "LONG" | "SHORT";
  status: "OPEN" | "CLOSED";
  entryTime: number;
  entryPrice: number;
  closeTime: number | null;
  closePrice: number | null;
  pnl: number | null;
};

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const INTERVALS = ["1m", "3m", "5m", "15m", "1h", "4h"];

function findClosestCandle(list: Candle[], ts: number): Candle | null {
  if (!list.length) return null;
  return list.reduce((best, c) =>
    Math.abs(c.time - ts) < Math.abs(best.time - ts) ? c : best
  );
}

export default function TradingChart({ coin = "BTC" }: { coin?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const seriesMarkersRef = useRef<any>(null);
  const createSeriesMarkersRef = useRef<any>(null);
  const intervalRef = useRef("3m");

  const [selectedInterval, setSelectedInterval] = useState("3m");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastPrice, setLastPrice] = useState<number | null>(null);
  const [lastChange, setLastChange] = useState<number | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);

  // ─── Draw markers (v5: createSeriesMarkers) ───────────────────────
  const drawMarkers = useCallback((series: any, tradeList: Trade[], candleList: Candle[]) => {
    if (!series || !candleList.length || !createSeriesMarkersRef.current) return;

    const markers: any[] = [];
    for (const t of tradeList) {
      const entryC = findClosestCandle(candleList, t.entryTime);
      if (entryC) {
        markers.push({
          time: entryC.time,
          position: t.side === "LONG" ? "belowBar" : "aboveBar",
          color: t.side === "LONG" ? "#10b981" : "#f43f5e",
          shape: t.side === "LONG" ? "arrowUp" : "arrowDown",
          text: `${t.side === "LONG" ? "▲" : "▼"} $${t.entryPrice.toLocaleString()}`,
          size: 1.5,
        });
      }
      if (t.status === "CLOSED" && t.closeTime && t.closePrice !== null) {
        const closeC = findClosestCandle(candleList, t.closeTime);
        if (closeC) {
          const profit = (t.pnl ?? 0) >= 0;
          markers.push({
            time: closeC.time,
            position: t.side === "LONG" ? "aboveBar" : "belowBar",
            color: profit ? "#f59e0b" : "#94a3b8",
            shape: "circle",
            text: `✕ ${profit ? "+" : ""}$${(t.pnl ?? 0).toFixed(2)}`,
            size: 1,
          });
        }
      }
    }
    markers.sort((a, b) => a.time - b.time);

    // Clean up previous marker plugin
    if (seriesMarkersRef.current) {
      try { seriesMarkersRef.current.detach?.(); } catch (_) {}
      seriesMarkersRef.current = null;
    }
    seriesMarkersRef.current = createSeriesMarkersRef.current(series, markers);
  }, []);

  // ─── Fetch candles ────────────────────────────────────────────────
  const fetchData = useCallback(async (iv: string, silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/candles?coin=${coin}&interval=${iv}&limit=200`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Gagal memuat candle");

      const newCandles: Candle[] = data.candles;
      const newTrades: Trade[] = data.trades || [];
      setCandles(newCandles);
      setTrades(newTrades);

      if (candleSeriesRef.current && newCandles.length > 0) {
        candleSeriesRef.current.setData(newCandles);
        volumeSeriesRef.current?.setData(newCandles.map((c: Candle) => ({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open ? "rgba(16,185,129,0.2)" : "rgba(244,63,94,0.2)",
        })));
        const last = newCandles[newCandles.length - 1];
        const prev = newCandles[newCandles.length - 2];
        setLastPrice(last.close);
        setLastChange(prev ? ((last.close - prev.close) / prev.close) * 100 : 0);
        drawMarkers(candleSeriesRef.current, newTrades, newCandles);
        chartRef.current?.timeScale().fitContent();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [coin, drawMarkers]);

  // ─── Init chart once ─────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let chart: any;
    let destroyed = false;

    (async () => {
      const lc: any = await import("lightweight-charts");
      const { createChart, CrosshairMode, ColorType } = lc;
      createSeriesMarkersRef.current = lc.createSeriesMarkers;

      if (destroyed || !containerRef.current) return;

      const w = containerRef.current.clientWidth || 600;
      const h = containerRef.current.clientHeight || 400;

      chart = createChart(containerRef.current, {
        width: w,
        height: h,
        layout: {
          background: { type: ColorType.Solid, color: "#0a0f1e" },
          textColor: "#94a3b8",
          fontSize: 11,
          fontFamily: "Inter, sans-serif",
        },
        grid: {
          vertLines: { color: "rgba(30,41,59,0.6)" },
          horzLines: { color: "rgba(30,41,59,0.6)" },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: "#475569", labelBackgroundColor: "#1e293b" },
          horzLine: { color: "#475569", labelBackgroundColor: "#1e293b" },
        },
        rightPriceScale: {
          borderColor: "#1e293b",
          scaleMargins: { top: 0.08, bottom: 0.22 },
        },
        timeScale: {
          borderColor: "#1e293b",
          timeVisible: true,
          secondsVisible: false,
        },
      });

      chartRef.current = chart;

      candleSeriesRef.current = chart.addSeries(lc.CandlestickSeries, {
        upColor: "#10b981",
        downColor: "#f43f5e",
        borderUpColor: "#10b981",
        borderDownColor: "#f43f5e",
        wickUpColor: "#10b981",
        wickDownColor: "#f43f5e",
      });

      volumeSeriesRef.current = chart.addSeries(lc.HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });

      // ResizeObserver — set explicit size (no autoSize conflict)
      const ro = new ResizeObserver((entries) => {
        if (!chartRef.current || !entries[0]) return;
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          chartRef.current.applyOptions({ width, height });
        }
      });
      ro.observe(containerRef.current);

      // Initial data fetch
      try {
        const res = await fetch(`/api/candles?coin=${coin}&interval=${intervalRef.current}&limit=200`);
        const data = await res.json();
        if (!destroyed && data.success && data.candles?.length > 0) {
          candleSeriesRef.current.setData(data.candles);
          volumeSeriesRef.current.setData(data.candles.map((c: Candle) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? "rgba(16,185,129,0.2)" : "rgba(244,63,94,0.2)",
          })));
          const last = data.candles[data.candles.length - 1];
          const prev = data.candles[data.candles.length - 2];
          if (!destroyed) {
            setLastPrice(last.close);
            setLastChange(prev ? ((last.close - prev.close) / prev.close) * 100 : 0);
            setCandles(data.candles);
            setTrades(data.trades || []);
            drawMarkers(candleSeriesRef.current, data.trades || [], data.candles);
            chart.timeScale().fitContent();
          }
        }
      } catch (_) {}

      if (!destroyed) setLoading(false);

      return () => ro.disconnect();
    })();

    return () => {
      destroyed = true;
      if (seriesMarkersRef.current) {
        try { seriesMarkersRef.current.detach?.(); } catch (_) {}
        seriesMarkersRef.current = null;
      }
      chart?.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Live tick update ────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(async () => {
      if (!candleSeriesRef.current || !candles.length) return;
      try {
        const res = await fetch("/api/chart-data");
        const d = await res.json();
        if (!d.success || !d.data?.length) return;
        const price = d.data[d.data.length - 1].price;
        const barSec: Record<string, number> = {
          "1m": 60, "3m": 180, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400,
        };
        const sec = barSec[selectedInterval] || 60;
        const barTime = Math.floor(Math.floor(Date.now() / 1000) / sec) * sec;
        const last = candles[candles.length - 1];
        if (last.time === barTime) {
          candleSeriesRef.current.update({
            time: barTime,
            open: last.open,
            high: Math.max(last.high, price),
            low: Math.min(last.low, price),
            close: price,
          });
          setLastPrice(price);
          const prev = candles[candles.length - 2];
          if (prev) setLastChange(((price - prev.close) / prev.close) * 100);
        }
      } catch (_) {}
    }, 2000);
    return () => clearInterval(id);
  }, [candles, selectedInterval]);

  // ─── Redraw markers ──────────────────────────────────────────────
  useEffect(() => {
    if (candleSeriesRef.current && candles.length) {
      drawMarkers(candleSeriesRef.current, trades, candles);
    }
  }, [trades, candles, drawMarkers]);

  // ─── Fetch on coin change ────────────────────────────────────────
  useEffect(() => {
    fetchData(selectedInterval);
  }, [coin, selectedInterval, fetchData]);

  // ─── Periodic full refresh ───────────────────────────────────────
  useEffect(() => {
    const ms: Record<string, number> = {
      "1m": 60000, "3m": 180000, "5m": 300000, "15m": 900000, "1h": 3600000, "4h": 14400000,
    };
    const id = setInterval(() => fetchData(selectedInterval, true), ms[selectedInterval] || 60000);
    return () => clearInterval(id);
  }, [selectedInterval, fetchData]);

  const changeInterval = (iv: string) => {
    setSelectedInterval(iv);
    intervalRef.current = iv;
    fetchData(iv);
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2 shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-slate-200">{coin}/USD</span>
          {lastPrice !== null && (
            <span className="text-sm font-mono font-bold text-slate-100">
              ${lastPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          {lastChange !== null && (
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${lastChange >= 0 ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"}`}>
              {lastChange >= 0 ? "+" : ""}{lastChange.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-slate-900/60 border border-slate-700/60 rounded-lg p-0.5">
            {INTERVALS.map(iv => (
              <button key={iv} onClick={() => changeInterval(iv)}
                className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${selectedInterval === iv ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
                {iv}
              </button>
            ))}
          </div>
          <button onClick={() => fetchData(selectedInterval)} disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-all">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-2 shrink-0 flex-wrap text-[10px] text-slate-500">
        <span><span className="text-emerald-400 font-black">▲</span> Long Entry</span>
        <span><span className="text-rose-400 font-black">▼</span> Short Entry</span>
        <span><span className="text-amber-400 font-black">●</span> Close Profit</span>
        <span><span className="text-slate-400 font-black">●</span> Close Loss</span>
        {loading && <span className="text-indigo-400 animate-pulse">Memuat...</span>}
        {error && <span className="text-rose-400">{error}</span>}
      </div>

      {/* Chart */}
      <div className="flex-1 relative min-h-0" style={{ minHeight: "350px" }}>
        <div ref={containerRef} className="absolute inset-0" />
        {loading && candles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm z-10">
            <div className="flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
              <span className="text-xs text-slate-400">Memuat candle {coin}/USD...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
