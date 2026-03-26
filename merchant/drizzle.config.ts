// ⚠️  READ-ONLY: consumer/ is the single source of truth for DB migrations.
// Never run `drizzle-kit generate`, `push`, or `pull` from this app.
// To create a migration: cd ../consumer && pnpm db:generate
// To apply migrations:   cd ../consumer && pnpm db:migrate
// This config exists only to support `drizzle-kit studio` for inspection.

import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({
  path: ".env.local",
});

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // biome-ignore lint: Forbidden non-null assertion.
    url: process.env.POSTGRES_URL!,
  },
});
