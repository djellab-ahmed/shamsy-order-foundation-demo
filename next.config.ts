import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.SHAMSY_E2E_SERVER === "1" ? { distDir: ".next-e2e" } : {}),
};

export default nextConfig;
