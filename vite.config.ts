import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import pkg from "./package.json";
import { devApi } from "./server/vite-dev-api";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The dev API reads GITHUB_TOKEN, ADMIN_SECRET etc. from process.env, like Vercel does.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) process.env[key] ??= value;

  return {
    plugins: [react(), devApi()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: {
      port: 5173,
      open: true,
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
