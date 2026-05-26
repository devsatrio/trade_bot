"use client";

import React, { useState, useEffect } from "react";
import { WifiOff, RefreshCw } from "lucide-react";

// Robust external reachability check
const checkInternetConnection = async (): Promise<boolean> => {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return false;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s limit
    
    // Using no-cors mode to bypass any CORS restrictions on connectivity checks
    await fetch("https://www.google.com/generate_204", {
      method: "GET",
      mode: "no-cors",
      signal: controller.signal,
      cache: "no-store"
    });
    
    clearTimeout(timeoutId);
    return true;
  } catch (err) {
    return false;
  }
};

export default function InternetConnectionDetector() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // 1. Initial connection check
      const runInitialCheck = async () => {
        const online = await checkInternetConnection();
        setIsOnline(online);
      };
      runInitialCheck();

      // 2. Network card interface event listeners
      const handleOnline = async () => {
        const online = await checkInternetConnection();
        setIsOnline(online);
      };
      const handleOffline = () => setIsOnline(false);

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      // 3. Heartbeat loop (every 5 seconds) to catch Docker bridge bypasses
      const interval = setInterval(async () => {
        const online = await checkInternetConnection();
        setIsOnline(online);
      }, 5000);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
        clearInterval(interval);
      };
    }
  }, []);

  const triggerManualCheck = async () => {
    setIsChecking(true);
    const online = await checkInternetConnection();
    setIsOnline(online);
    setTimeout(() => setIsChecking(false), 600);
  };

  if (isOnline) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-xl p-4">
      {/* Dynamic Animated Background Blur */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1.5s" }}></div>
      </div>

      <div className="glass-panel p-8 rounded-2xl max-w-md w-full text-center relative border border-rose-500/20 shadow-[0_0_50px_rgba(244,63,94,0.15)] flex flex-col items-center justify-center overflow-hidden animate-scale-up">
        {/* Colorful Glow Top Line */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500"></div>

        {/* Animated WifiOff Container */}
        <div className="w-16 h-16 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full flex items-center justify-center mb-6 relative animate-bounce">
          <WifiOff className="w-8 h-8" />
          <span className="absolute top-0 right-0 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
          </span>
        </div>

        {/* Text Details */}
        <h2 className="text-xl font-bold text-slate-100 tracking-tight mb-2">
          Koneksi Internet Terputus
        </h2>
        <p className="text-sm text-slate-400 mb-6 max-w-xs leading-relaxed">
          Kami mendeteksi perangkat Anda tidak terhubung ke jaringan internet. Halaman dashboard otomatis terkunci untuk mencegah kegagalan analisis dan eksekusi transaksi.
        </p>

        {/* Action Recheck Button */}
        <button
          disabled={isChecking}
          onClick={triggerManualCheck}
          className="w-full py-2.5 px-4 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white rounded-lg text-sm font-bold transition-all shadow-[0_4px_20px_rgba(244,63,94,0.3)] hover:shadow-[0_4px_25px_rgba(244,63,94,0.5)] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isChecking ? "animate-spin" : ""}`} />
          {isChecking ? "MEMERIKSA KONEKSI..." : "PERIKSA ULANG KONEKSI"}
        </button>

        {/* Bottom Ping Status */}
        <div className="mt-4 text-[9px] text-slate-500 font-mono uppercase tracking-wider flex items-center gap-1.5 justify-center">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
          HyperBot Offline Protection Active
        </div>
      </div>
    </div>
  );
}
