import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev proxy: the browser calls /api on the Vite origin, so the backend needs no CORS.
const target = new URL(process.env.BORDERWISE_DEV_API_TARGET || 'http://127.0.0.1:3000');
if (target.username || target.password || target.search || target.hash
  || !(target.protocol === 'https:' || target.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname))) {
  throw new Error('Use a trusted HTTPS or loopback HTTP dev backend URL without credentials, query or fragment.');
}
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  server: { port: 5173, proxy: { "/api": target.toString(), "/health": target.toString() } },
});
