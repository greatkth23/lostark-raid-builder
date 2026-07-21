import vinext from "vinext";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const CLOUDFLARE_D1_DATABASE_NAME = "lostark-raid-builder-db";
const CLOUDFLARE_D1_DATABASE_ID = "df969583-75a9-44b3-b774-a56ae8bb756d";

const { d1, r2 } = hostingConfig;

const localBindingConfig = {
  name: "loiar",
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: CLOUDFLARE_D1_DATABASE_NAME,
          database_id: CLOUDFLARE_D1_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig({
  plugins: [
    vinext(),
    sites(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      config: localBindingConfig,
    }),
  ],
});
