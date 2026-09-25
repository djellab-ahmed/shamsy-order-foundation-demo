import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const entries = Object.fromEntries(readFileSync(".env.hosted.local", "utf8").trim().split("\n").map(line => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
const publicNames = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const demoNames = ["SHAMSY_DEMO_ADVISER_EMAIL", "SHAMSY_DEMO_ADVISER_PASSWORD", "SHAMSY_DEMO_OWNER_EMAIL", "SHAMSY_DEMO_OWNER_PASSWORD"];
const enabled = entries.SHAMSY_DEMO_LOGIN_ENABLED === "true";
const names = [...publicNames, "SHAMSY_DEMO_LOGIN_ENABLED", ...(enabled ? demoNames : [])];
entries.SHAMSY_DEMO_LOGIN_ENABLED = String(enabled);
// Validate the complete configuration before changing Vercel.
for (const name of names) if (!entries[name]) throw new Error(`Missing ${name} in .env.hosted.local`);
for (const name of names) {
  execFileSync("npx", ["--yes", "vercel", "env", "add", name, "production", "--yes", "--force", demoNames.includes(name) ? "--sensitive" : "--no-sensitive"], { input: entries[name], encoding: "utf8" });
  console.log(`Configured Vercel production ${name}`);
}
