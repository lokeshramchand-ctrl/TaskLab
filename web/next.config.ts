import type { NextConfig } from 'next';

const config: NextConfig = {
  // Lets a second dev server (screenshots, e2e) run beside the main one without sharing a build cache.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Self-contained server bundle for the Docker image (Coolify).
  output: 'standalone',
  serverExternalPackages: ['youtubei.js', 'jsdom', 'bgutils-js', '@napi-rs/canvas'],
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  // Forwarded browser logs land in .next/dev/logs; on Windows that write was being picked
  // up by the watcher and caused an endless reload loop in dev.
  logging: { browserToTerminal: false },
  agentRules: false,
};

export default config;
