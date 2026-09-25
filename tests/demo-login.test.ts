import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { GET, POST } from "../src/app/api/auth/demo-login/route";

vi.mock("server-only", () => ({}));
vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
const origin = "https://trial.example";
function request(body: unknown, originHeader: string = origin) {
  return new NextRequest(`${origin}/api/auth/demo-login`, { method: "POST", headers: { Origin: originHeader, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
const signIn = vi.fn();
const signOut = vi.fn();
const membership = vi.fn();
const eq = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  for (const [name, value] of Object.entries({ SHAMSY_DEMO_LOGIN_ENABLED: "true", SHAMSY_DEMO_ADVISER_EMAIL: "adviser@example.test", SHAMSY_DEMO_ADVISER_PASSWORD: "server-adviser-password", SHAMSY_DEMO_OWNER_EMAIL: "owner@example.test", SHAMSY_DEMO_OWNER_PASSWORD: "server-owner-password", NEXT_PUBLIC_SUPABASE_URL: "https://database.example", NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key" })) vi.stubEnv(name, value);
  signIn.mockResolvedValue({ data: { user: { id: "authenticated-user" }, session: {} }, error: null });
  signOut.mockResolvedValue({ error: null });
  membership.mockResolvedValue({ data: { role: "sales_adviser" }, error: null });
  eq.mockReturnThis();
  vi.mocked(createServerClient).mockImplementation((_url, _key, options) => {
    const cookieMethods = options.cookies as { setAll: (cookies: { name: string; value: string; options: { path: string; secure: boolean; sameSite: "lax" } }[], headers: Record<string, string>) => void };
    cookieMethods.setAll([{ name: "sb-session", value: "supabase-session", options: { path: "/", secure: true, sameSite: "lax" } }], { "Cache-Control": "private, no-store" });
    return { auth: { signInWithPassword: signIn, signOut }, from: () => ({ select: () => ({ eq, maybeSingle: membership }) }) } as unknown as ReturnType<typeof createServerClient>;
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("server-only demo account selection", () => {
  it.each([undefined, "false", "TRUE", "1"])("fails closed when enabled is %s", async flag => {
    vi.stubEnv("SHAMSY_DEMO_LOGIN_ENABLED", flag);
    expect(await GET().json()).toEqual({ enabled: false });
    const response = await POST(request({ account: "owner" }));
    expect(response.status).toBe(404);
    expect(createServerClient).not.toHaveBeenCalled();
  });
  it("exposes only the availability boolean and prevents caching", async () => {
    const response = GET();
    expect(await response.json()).toEqual({ enabled: true });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it.each(["https://attacker.example", ""])("rejects a foreign or missing origin", async originHeader => {
    expect((await POST(request({ account: "owner" }, originHeader))).status).toBe(403);
    expect(createServerClient).not.toHaveBeenCalled();
  });
  it.each([{ account: "admin" }, { role: "owner" }, { account: "owner", email: "arbitrary@example.test", password: "arbitrary" }, null, []])("rejects arbitrary credential inputs: %j", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(createServerClient).not.toHaveBeenCalled();
  });
  it("fails safely without configured credentials", async () => {
    vi.stubEnv("SHAMSY_DEMO_OWNER_PASSWORD", "");
    expect((await POST(request({ account: "owner" }))).status).toBe(503);
    expect(createServerClient).not.toHaveBeenCalled();
  });
  it("does not return Supabase error details or cookies on failed authentication", async () => {
    signIn.mockResolvedValue({ data: {}, error: { message: "server-owner-password" } });
    const response = await POST(request({ account: "owner" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "DEMO_LOGIN_UNAVAILABLE" });
    expect(response.headers.has("set-cookie")).toBe(false);
  });
  it("does not grant the selected role if database membership disagrees", async () => {
    const response = await POST(request({ account: "owner" }));
    expect(response.status).toBe(503);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it.each(["adviser", "owner"])("authenticates the configured %s account and redirects with cookies", async account => {
    membership.mockResolvedValue({ data: { role: account === "adviser" ? "sales_adviser" : "owner" }, error: null });
    const response = await POST(request({ account }));
    expect(signIn).toHaveBeenCalledWith({ email: `${account}@example.test`, password: `server-${account}-password` });
    expect(eq).toHaveBeenCalledWith("user_id", "authenticated-user");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${origin}/orders/new`);
    expect(response.headers.get("set-cookie")).toContain("sb-session=supabase-session");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toBe("");
  });
});
