import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(execFileSync("npx", ["--yes", "supabase", "status", "--output", "json"], { encoding: "utf8" }));
if (!status.API_URL || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error("Start the local Supabase stack first.");
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const accounts = [
  { email: "shamsy-owner@local.test", password: randomBytes(18).toString("base64url") + "Aa1!", role: "owner" },
  { email: "shamsy-adviser@local.test", password: randomBytes(18).toString("base64url") + "Aa1!", role: "sales_adviser" },
];
for (const account of accounts) {
  const { data: created, error } = await admin.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
  if (error && !error.message.includes("already been registered")) throw error;
  let id = created.user?.id;
  if (!id) {
    const { data: listed, error: listError } = await admin.auth.admin.listUsers();
    if (listError) throw listError;
    id = listed.users.find(user => user.email === account.email)?.id;
  }
  if (!id) throw new Error(`Could not resolve local user ${account.email}`);
  if (!created.user) {
    const { error: updateError } = await admin.auth.admin.updateUserById(id, { password: account.password });
    if (updateError) throw updateError;
  }
  const { error: membershipError } = await admin.from("organization_members").upsert({ organization_id: "00000000-0000-4000-8000-000000000001", user_id: id, role: account.role, active: true }, { onConflict: "organization_id,user_id" });
  if (membershipError) throw membershipError;
}
const updates = {
  SHAMSY_DEMO_LOGIN_ENABLED: "true",
  SHAMSY_DEMO_OWNER_EMAIL: accounts[0].email,
  SHAMSY_DEMO_OWNER_PASSWORD: accounts[0].password,
  SHAMSY_DEMO_ADVISER_EMAIL: accounts[1].email,
  SHAMSY_DEMO_ADVISER_PASSWORD: accounts[1].password,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  PROOF_BASE_URL: "http://127.0.0.1:3100",
  PROOF_OWNER_EMAIL: accounts[0].email,
  PROOF_OWNER_PASSWORD: accounts[0].password,
  PROOF_ADVISER_EMAIL: accounts[1].email,
  PROOF_ADVISER_PASSWORD: accounts[1].password,
};
const previous = (() => { try { return readFileSync(".env.local", "utf8"); } catch { return ""; } })();
const retained = previous.split("\n").filter(line => !Object.keys(updates).some(key => line.startsWith(`${key}=`))).join("\n").trimEnd();
writeFileSync(".env.local", `${retained ? retained + "\n" : ""}${Object.entries(updates).map(([key, value]) => `${key}=${value}`).join("\n")}\n`, { mode: 0o600 });
chmodSync(".env.local", 0o600);
console.log("Local Supabase users and ignored .env.local are ready. Start Next.js on port 3100, then run npm run prove.");
