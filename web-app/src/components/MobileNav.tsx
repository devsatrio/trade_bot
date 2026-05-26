"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart3, Terminal, Settings, BookOpen } from "lucide-react";

export default function MobileNav() {
  const pathname = usePathname();

  // Jangan tampilkan navigasi jika user berada di halaman login
  if (pathname === "/login") return null;

  const navItems = [
    {
      name: "Dashboard",
      href: "/",
      icon: LayoutDashboard,
    },
    {
      name: "Analisa",
      href: "/analysis",
      icon: BarChart3,
    },
    {
      name: "Almanac",
      href: "/almanac",
      icon: BookOpen,
    },
    {
      name: "Terminal",
      href: "/terminal",
      icon: Terminal,
    },
    {
      name: "Settings",
      href: "/settings",
      icon: Settings,
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden block">
      {/* Bottom spacer to prevent content overlap */}
      <div className="h-16 w-full" />
      
      {/* Sleek Glassmorphic Nav Bar */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 backdrop-blur-xl bg-slate-950/80 border-t border-slate-900/80 flex items-center justify-around px-4 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 py-1 px-3 rounded-xl transition-all duration-300 gap-1 ${
                isActive 
                  ? "text-indigo-400 font-bold scale-105" 
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? "drop-shadow-[0_0_8px_rgba(99,102,241,0.6)]" : ""}`} />
              <span className="text-[10px] tracking-wide font-semibold uppercase">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
