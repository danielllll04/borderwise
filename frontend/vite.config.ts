import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev proxy: the browser calls /api on the Vite origin, so the backend needs no CORS.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:3000", "/health": "http://127.0.0.1:3000" } },
});
