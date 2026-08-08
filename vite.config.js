import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { handleApi } from "./apiHandler.mjs";
import { usingDefaultPw } from "./store.mjs";

// Plugin: liga a API (mesmo handler que o server.mjs de produção).
function apiPlugin() {
  return {
    name: "app-api",
    configureServer(server) {
      if (usingDefaultPw()) console.warn("\n[admin] ADMIN_PASSWORD não definido — a usar password de DEV 'admin'. Define ADMIN_PASSWORD antes de expor o site.\n");
      server.middlewares.use(async (req, res, next) => {
        const handled = await handleApi(req, res);
        if (!handled) next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiPlugin()],
  server: {
    port: Number(process.env.PORT) || 5199,
    strictPort: false,
    fs: { allow: [".."] }, // permite importar ../EarningsEdge.jsx
  },
});
