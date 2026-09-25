import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const base = process.env.PROOF_BASE_URL || "http://127.0.0.1:3100";
for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "PROOF_ADVISER_EMAIL", "PROOF_ADVISER_PASSWORD", "PROOF_OWNER_EMAIL", "PROOF_OWNER_PASSWORD"]) if (!process.env[name]) throw new Error(`Set ${name} before running this hosted Supabase proof.`);

async function login(email, password) {
  const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Authentication failed for ${email}: ${error?.message}`);
  return { db, token: data.session.access_token };
}
async function call(path, token, method = "GET", body) {
  const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
const adviser = await login(process.env.PROOF_ADVISER_EMAIL, process.env.PROOF_ADVISER_PASSWORD);
const owner = await login(process.env.PROOF_OWNER_EMAIL, process.env.PROOF_OWNER_PASSWORD);
const { data: adviserUser } = await adviser.db.auth.getUser();
const directKey = crypto.randomUUID();
const { error: directInsertError } = await adviser.db.from("orders").insert({ organization_id: "00000000-0000-4000-8000-000000000001", customer_id: "11111111-1111-4111-8111-111111111111", created_by: adviserUser.user.id, idempotency_key: directKey, exchange_rate_sdg_per_usd: 8200, subtotal_usd_cents: 207000, discount_usd_cents: 15000, total_usd_cents: 192000, total_sdg: 15744000 });
assert.ok(directInsertError, "Adviser direct table insert unexpectedly succeeded");
const { data: directRows } = await adviser.db.from("orders").select("id").eq("idempotency_key", directKey);
assert.equal(directRows.length, 0);
const { data: hiddenApprovals } = await adviser.db.from("discount_approvals").select("id");
assert.equal(hiddenApprovals.length, 0);
console.log("PASS direct Supabase table insert denied; adviser cannot enumerate approvals");
const orderKey = crypto.randomUUID();
const third = { id: crypto.randomUUID(), productId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", quantity: 1, discountCents: 15000, unitPriceCents: 1, approved: true };
const draft = { idempotencyKey: orderKey, customerId: "11111111-1111-4111-8111-111111111111", rate: 8200, totalCents: 1, lines: [
  { id: crypto.randomUUID(), productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quantity: 4, discountCents: 4000 },
  { id: crypto.randomUUID(), productId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", quantity: 2, discountCents: 7000 }, third ] };

const rejected = await call("/api/orders", adviser.token, "POST", draft);
assert.equal(rejected.status, 403);
assert.equal(rejected.data.error, "OWNER_APPROVAL_REQUIRED");
const { data: before, error: beforeError } = await adviser.db.from("orders").select("id").eq("idempotency_key", orderKey);
if (beforeError) throw beforeError;
assert.equal(before.length, 0);
console.log("PASS adviser direct POST: 403 OWNER_APPROVAL_REQUIRED; 0 persisted orders");

const adviserApproval = await call("/api/approvals", adviser.token, "POST", { orderKey, line: third, role: "owner" });
assert.equal(adviserApproval.status, 403);
console.log("PASS forged role: adviser cannot approve");

const approval = await call("/api/approvals", owner.token, "POST", { orderKey, line: third, note: "Worked example" });
assert.equal(approval.status, 200);
const changed = structuredClone(draft);
changed.lines[2].discountCents = 16000;
const stale = await call("/api/orders", adviser.token, "POST", changed);
assert.equal(stale.status, 403);
assert.equal(stale.data.error, "OWNER_APPROVAL_REQUIRED");
console.log("PASS owner approval bound to exact inputs; changed discount rejected");

const badRate = await call("/api/orders", adviser.token, "POST", { ...draft, rate: 7900 });
assert.equal(badRate.status, 422);
assert.equal(badRate.data.error, "RATE_BELOW_MINIMUM");
console.log("PASS direct 7,900 rate rejected by PostgreSQL");

const saved = await call("/api/orders", adviser.token, "POST", draft);
assert.equal(saved.status, 201);
const detail = await call(`/api/orders/${saved.data.id}`, adviser.token);
assert.equal(detail.data.total_usd_cents, 549000);
assert.equal(detail.data.total_sdg, 45018000);
assert.equal(detail.data.exchange_rate_sdg_per_usd, 8200);
assert.equal(detail.data.order_lines.find(line => line.product_id === third.productId).unit_price_usd_cents, 207000);
const retry = await call("/api/orders", adviser.token, "POST", draft);
assert.equal(retry.data.id, saved.data.id);
console.log("PASS approved $5,490 / 45,018,000 SDG; forged price ignored; retry returns same order");

const current = await call("/api/rate", owner.token, "PATCH", { rate: 9000 });
assert.equal(current.status, 200);
const historical = await call(`/api/orders/${saved.data.id}`, adviser.token);
assert.equal(historical.data.exchange_rate_sdg_per_usd, 8200);
assert.equal(historical.data.total_sdg, 45018000);
console.log("PASS current rate 9,000; saved order still 8,200 / 45,018,000 SDG");
