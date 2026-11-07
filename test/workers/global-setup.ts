import { applyD1Migrations, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import { env } from "cloudflare:test";

export default async function () {
  // Read migrations from the drizzle directory
  const migrations = await readD1Migrations("./drizzle");
  
  // Apply migrations to the test database
  await applyD1Migrations(env.DB, migrations);
}
