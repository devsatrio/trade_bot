import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Allow external access from the VPS IP in development mode
  allowedDevOrigins: ['43.129.39.18', 'localhost'],
  /* config options here */
};

export default nextConfig;
