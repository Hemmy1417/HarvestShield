import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The app is its own root; lockfiles above the repository are not ours.
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
