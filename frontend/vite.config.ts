import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// In production, Vercel serves /api/* via the backend serverless functions.
// In dev, we proxy /api/* requests to `vercel dev` running on port 3001.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@commonality/shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
