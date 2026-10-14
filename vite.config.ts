import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import pkg from "./package.json";
import { devApi } from "./server/vite-dev-api";

// https://vite.dev/config/
export default defineConfig(({ mode, isSsrBuild }) => {
  // The dev API reads GITHUB_TOKEN, ADMIN_SECRET etc. from process.env, like Vercel does.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) process.env[key] ??= value;

  return {
    plugins: [react(), devApi()],
    // The server bundle serves dist/, so it needs no copy of public/.
    publicDir: isSsrBuild ? false : "public",
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    // Chunk splitting is for the browser bundle only; the Node server build
    // (pnpm build:server) keeps its dependencies external.
    build: isSsrBuild ? {} : {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
            motion: ["motion/react"],
            metal: ["metal-fx"],
            primitives: [
              "@radix-ui/react-avatar",
              "@radix-ui/react-dialog",
              "@radix-ui/react-slot",
              "@radix-ui/react-switch",
              "@radix-ui/react-tabs",
              "@radix-ui/react-tooltip",
            ],
          },
        },
      },
    },
    server: {
      port: 5173,
      open: false,
    },
    preview: {
      port: 4173,
    },
    resolve: {
      alias: {
        "@shared": path.resolve(__dirname, "./shared"),
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
