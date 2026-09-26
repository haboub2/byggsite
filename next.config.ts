import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Phase 2: add Supabase Storage host here for next/image
  // images: { remotePatterns: [{ protocol: "https", hostname: "<project-ref>.supabase.co" }] },

  // URLs from the Byggly 01 structure, so old links and bookmarks keep working.
  async redirects() {
    return [
      { source: "/bygg", destination: "/", permanent: true },
      { source: "/tjanster", destination: "/bygg/tjanster", permanent: true },
      { source: "/tjanster/:slug", destination: "/bygg/tjanster/:slug", permanent: true },
      { source: "/projekt", destination: "/bygg/projekt", permanent: true },
      { source: "/projekt/villa-soder", destination: "/bygg/projekt/villa-sondrum", permanent: true },
      { source: "/projekt/:slug", destination: "/bygg/projekt/:slug", permanent: true },
      { source: "/offert", destination: "/bygg/offert", permanent: true },
      { source: "/01", destination: "/mjukvara", permanent: true },
      { source: "/01/tjanster", destination: "/mjukvara/tjanster", permanent: true },
      { source: "/01/case", destination: "/mjukvara/case", permanent: true },
      { source: "/01/case/byggly-01-sajten", destination: "/mjukvara/case/binaafy-sajten", permanent: true },
      { source: "/01/case/:slug", destination: "/mjukvara/case/:slug", permanent: true },
      { source: "/01/brief", destination: "/mjukvara/brief", permanent: true },
    ];
  },
};

export default nextConfig;
