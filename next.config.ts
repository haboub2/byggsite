import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Phase 2: add Supabase Storage host here for next/image
  // images: { remotePatterns: [{ protocol: "https", hostname: "<project-ref>.supabase.co" }] },
};

export default nextConfig;
