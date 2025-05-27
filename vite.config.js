import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://3.37.127.247:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/proxy-image": {
        target: "https://arc-risk-finder.s3.ap-northeast-2.amazonaws.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy-image/, ""),
      },
    },
  },
});
