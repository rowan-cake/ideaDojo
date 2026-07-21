import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json" with { type: "json" };
import { sites } from "./build/sites-vite-plugin.js";

const PLACEHOLDER_DATABASE_ID = "00000000-0000-4000-8000-000000000000";

export default defineConfig({
  plugins: [
    sites(),
    cloudflare({
      persistState: { path: ".wrangler/state" },
      config: {
        name: "server",
        main: "./server/index.js",
        compatibility_date: "2026-07-19",
        compatibility_flags: ["nodejs_compat"],
        d1_databases: hostingConfig.d1 ? [{
          binding: hostingConfig.d1,
          database_name: "idea-dojo-local",
          database_id: PLACEHOLDER_DATABASE_ID,
        }] : [],
        vars: process.env.LOCAL_DEV_USER_EMAIL ? {
          LOCAL_DEV_USER_EMAIL: process.env.LOCAL_DEV_USER_EMAIL,
        } : {},
        assets: {
          binding: "ASSETS",
          not_found_handling: "single-page-application",
          run_worker_first: ["/api/*"],
        },
      },
    }),
  ],
});
