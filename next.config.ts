import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const OCR_TRACE_INCLUDES = [
  "./lib/tickets/tessdata/**",
  "./node_modules/tesseract.js/**",
  "./node_modules/tesseract.js-core/**",
  "./node_modules/wasm-feature-detect/**",
  "./node_modules/regenerator-runtime/**",
  "./node_modules/is-url/**",
  "./node_modules/bmp-js/**",
  "./node_modules/zlibjs/**",
  "./node_modules/node-fetch/**",
  "./node_modules/idb-keyval/**",
];

const nextConfig: NextConfig = {
  // @napi-rs/canvas: native module (price-overlay background sampling in
  // lib/tickets/overlay-price.ts) — must stay a runtime require, not a
  // bundled chunk.
  // tesseract.js: spawns its worker thread from a __dirname-relative path;
  // bundling breaks that path and the spawn failure is swallowed (browser-only
  // worker.onerror assignment), so createWorker() hangs forever on Vercel.
  serverExternalPackages: ["@napi-rs/canvas", "tesseract.js"],
  // The OCR worker script is spawned by file path (never require()d), so nft
  // can't discover it or its deps; the traineddata is read via
  // path.join(process.cwd(), ...). Include them all explicitly in every route
  // that can OCR: the export (price overlay) and the maritime editor's
  // text-spans read (scanned tickets).
  outputFileTracingIncludes: {
    "/api/tickets/*/export": OCR_TRACE_INCLUDES,
    "/api/tickets/*/text-spans": OCR_TRACE_INCLUDES,
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "abdou-0q",

  project: "tikalo",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  }
});
