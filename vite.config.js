import { defineConfig } from "vite";

const apiPort = process.env.API_PORT || "8787";

export default defineConfig({
  server: {
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`,
    },
  },
});
