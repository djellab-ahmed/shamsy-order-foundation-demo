import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ref = process.env.SHAMSY_SUPABASE_PROJECT_REF;
if (!ref || !/^[a-z]{20}$/.test(ref)) throw new Error("Set SHAMSY_SUPABASE_PROJECT_REF to the newly migrated project ref.");
const response = JSON.parse(execFileSync("npx", ["--yes", "supabase", "projects", "api-keys", "--project-ref", ref, "--reveal", "--output-format", "json"], { encoding: "utf8" }));
const anon = response.keys.find(key => key.name === "anon")?.api_key;
const service = response.keys.find(key => key.name === "service_role")?.api_key;
if (!anon || !service) throw new Error("Supabase API keys are unavailable.");
const url = `https://${ref}.supabase.co`;
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const accounts = [
  { email: "shamsy-owner@example.com", password: randomBytes(18).toString("base64url") + "Aa1!", role: "owner" },
  { email: "shamsy-adviser@example.com", password: randomBytes(18).toString("base64url") + "Aa1!", role: "sales_adviser" },
];
for (const account of accounts) {
  const { data, error } = await admin.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
  if (error || !data.user) throw new Error(`Could not create ${account.role}: ${error?.message}`);
  const { error: membershipError } = await admin.from("organization_members").insert({ organization_id: "00000000-0000-4000-8000-000000000001", user_id: data.user.id, role: account.role });
  if (membershipError) throw membershipError;
}
const env = {
  SHAMSY_DEMO_LOGIN_ENABLED: "true",
  SHAMSY_DEMO_OWNER_EMAIL: accounts[0].email,
  SHAMSY_DEMO_OWNER_PASSWORD: accounts[0].password,
  SHAMSY_DEMO_ADVISER_EMAIL: accounts[1].email,
  SHAMSY_DEMO_ADVISER_PASSWORD: accounts[1].password,
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
  PROOF_OWNER_EMAIL: accounts[0].email,
  PROOF_OWNER_PASSWORD: accounts[0].password,
  PROOF_ADVISER_EMAIL: accounts[1].email,
  PROOF_ADVISER_PASSWORD: accounts[1].password,
};
writeFileSync(".env.hosted.local", `${Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n")}\n`, { mode: 0o600 });
chmodSync(".env.hosted.local", 0o600);
console.log("Hosted trial users created. Public app variables and account credentials are in ignored .env.hosted.local. The service-role key was not saved.");
