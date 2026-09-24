import type { NextConfig } from "next";

const githubPages = process.env.GITHUB_PAGES === "true";
const basePath = githubPages ? process.env.NEXT_PUBLIC_BASE_PATH ?? "" : "";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_AMAP_KEY: process.env.NEXT_PUBLIC_AMAP_KEY || process.env.VITE_AMAP_KEY || "" },
  output: githubPages ? "export" : undefined,
  basePath,
  assetPrefix: basePath,
  trailingSlash: githubPages,
  images: { unoptimized: true },
};

export default nextConfig;
