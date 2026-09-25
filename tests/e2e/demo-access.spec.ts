import { expect, test } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import type { BrowserContext } from "@playwright/test";
import type { Draft } from "../../src/lib/finance";

async function verifiedSession(context: BrowserContext) {
  const cookies = await context.cookies();
  const db = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => cookies, setAll: () => {} } });
  const { data: identity, error } = await db.auth.getUser();
  expect(error).toBeNull();
  expect(identity.user).not.toBeNull();
  const { data } = await db.auth.getSession();
  expect(data.session).not.toBeNull();
  const { data: member, error: memberError } = await db.from("organization_members").select("role").eq("user_id", identity.user!.id).eq("organization_id", "00000000-0000-4000-8000-000000000001").single();
  expect(memberError).toBeNull();
  return { db, id: identity.user!.id, role: member!.role, token: data.session!.access_token };
}

test("demo availability follows the server flag; manual login remains available", async ({ page, request }) => {
  const configResponse = await request.get("/api/auth/demo-login");
  const config = await configResponse.json();
  expect(Object.keys(config)).toEqual(["enabled"]);
  expect(configResponse.headers()["cache-control"]).toContain("no-store");
  await page.goto("/orders/new");
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: "Supabase configuration needed" })).toBeVisible();
  }
  if (config.enabled) {
    await expect(page.getByRole("button", { name: "Continue as Sales Adviser" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue as Owner" })).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: /^Continue as/ })).toHaveCount(0);
    const rejected = await request.post("/api/auth/demo-login", { data: { account: "owner" } });
    expect(rejected.status()).toBe(404);
    expect(rejected.headers()["set-cookie"]).toBeUndefined();
  }
});

test("demo route rejects arbitrary credentials and cross-origin login", async ({ request, baseURL }) => {
  test.skip(!(await (await request.get("/api/auth/demo-login")).json()).enabled, "Demo login explicitly disabled.");
  const arbitrary = await request.post("/api/auth/demo-login", { headers: { Origin: new URL(baseURL!).origin }, data: { account: "owner", email: "forged@example.test", password: "forged" } });
  expect(arbitrary.status()).toBe(400);
  expect(arbitrary.headers()["set-cookie"]).toBeUndefined();
  const crossOrigin = await request.post("/api/auth/demo-login", { headers: { Origin: "https://attacker.example" }, data: { account: "owner" } });
  expect(crossOrigin.status()).toBe(403);
  expect(crossOrigin.headers()["set-cookie"]).toBeUndefined();
});

test("one-click accounts have distinct real sessions and preserve database enforcement", async ({ page, context, request }) => {
  test.setTimeout(90000);
  test.skip(!(await (await request.get("/api/auth/demo-login")).json()).enabled, "Demo login explicitly disabled.");
  test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Requires the connected Supabase public environment.");
  const passwords = [process.env.SHAMSY_DEMO_ADVISER_PASSWORD, process.env.SHAMSY_DEMO_OWNER_PASSWORD, process.env.PROOF_ADVISER_PASSWORD, process.env.PROOF_OWNER_PASSWORD].filter((v): v is string => Boolean(v));
  let leaked = false;
  const pendingBodies: Promise<void>[] = [];
  page.on("request", r => { const body = r.postData() || ""; if (passwords.some(secret => body.includes(secret))) leaked = true; });
  page.on("response", r => { if (/json|javascript|text\/html/.test(r.headers()["content-type"] || "")) pendingBodies.push(r.text().then(body => { if (passwords.some(secret => body.includes(secret))) leaked = true; }).catch(() => {})); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/orders/new");
  await page.getByRole("button", { name: "Continue as Sales Adviser" }).click();
  await expect(page.locator(".demo-strip")).toContainText("Signed in as Sales Adviser");
  const adviser = await verifiedSession(context);
  expect(adviser.role).toBe("sales_adviser");
  await page.reload();
  await expect(page.locator(".demo-strip")).toContainText("Sales Adviser");
  await page.getByRole("button", { name: "Load worked example" }).click();
  await expect(page.getByText("Owner approval required · 7.25%")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve discount", exact: true })).toHaveCount(0);
  const draft: Draft = await page.evaluate(() => JSON.parse(localStorage.getItem("shamsy-draft-v3")!));
  const adviserHeaders = { Authorization: `Bearer ${adviser.token}` };
  const bypass = await request.post("/api/orders", { headers: adviserHeaders, data: draft });
  expect(bypass.status()).toBe(403);
  expect((await bypass.json()).error).toBe("OWNER_APPROVAL_REQUIRED");
  const { data: rejectedRows, error } = await adviser.db.from("orders").select("id").eq("idempotency_key", draft.idempotencyKey);
  expect(error).toBeNull(); expect(rejectedRows).toEqual([]);
  const forgedApproval = await request.post("/api/approvals", { headers: adviserHeaders, data: { orderKey: draft.idempotencyKey, line: draft.lines[2], role: "owner" } });
  expect(forgedApproval.status()).toBe(403);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Continue as Owner" })).toBeVisible();
  expect((await context.cookies()).filter(c => c.name.includes("-auth-token"))).toHaveLength(0);

  await page.getByRole("button", { name: "Continue as Owner" }).click();
  await expect(page.locator(".demo-strip")).toContainText("Signed in as Owner");
  const owner = await verifiedSession(context);
  expect(owner.role).toBe("owner");
  expect(owner.id).not.toBe(adviser.id);
  expect(owner.token === adviser.token).toBe(false);
  await page.reload();
  await expect(page.locator(".demo-strip")).toContainText("Owner");
  await page.getByRole("button", { name: "Approve discount", exact: true }).click();
  await expect(page.getByText("Approved by owner · 7.25%")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Continue as Sales Adviser" }).click();
  await expect(page.locator(".demo-strip")).toContainText("Sales Adviser");
  const returnedAdviser = await verifiedSession(context);
  expect(returnedAdviser.id).toBe(adviser.id);
  const changed = structuredClone(draft); changed.lines[2].discountCents = 16000;
  const stale = await request.post("/api/orders", { headers: { Authorization: `Bearer ${returnedAdviser.token}` }, data: changed });
  expect(stale.status()).toBe(403);
  await page.getByRole("button", { name: "Save order" }).click();
  await expect(page.getByText("45,018,000 SDG")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (passwords.some(secret => (page.url()).includes(secret))) leaked = true;
  const html = await page.content();
  if (passwords.some(secret => html.includes(secret))) leaked = true;
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await Promise.all(pendingBodies);
  expect(leaked, "Demo passwords must never appear in page HTML, loaded JS, or browser request/response bodies").toBe(false);
});
