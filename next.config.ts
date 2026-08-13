import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdfjs-dist) resolves its worker script relative to its
  // own module location at runtime. Webpack/Turbopack normally bundle
  // dependencies into hashed chunk files, which breaks that relative path
  // and crashes PDF parsing in production ("Setting up fake worker failed").
  // Marking these as server-external tells Next.js to leave them as plain
  // node_modules requires instead of bundling them, so the worker path
  // resolves correctly.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
