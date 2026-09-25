import "server-only";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { DEMO_ORG } from "@/lib/tenant";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store", "Pragma": "no-cache" };

export function GET() {
  return NextResponse.json({ enabled: process.env.SHAMSY_DEMO_LOGIN_ENABLED === "true" }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });
  if (process.env.SHAMSY_DEMO_LOGIN_ENABLED !== "true") return fail("DEMO_LOGIN_DISABLED", 404);
  // This browser login endpoint must not allow another site to replace a visitor's session.
  const requestUrl = new URL(request.url);
  // Next's development server can normalize request.url to localhost; Host is the
  // actual browser-facing host, and cannot be overridden by a cross-origin form.
  requestUrl.host = request.headers.get("host") || requestUrl.host;
  if (request.headers.get("origin") !== requestUrl.origin) return fail("INVALID_ORIGIN", 403);
  let input: unknown;
  try { input = await request.json(); } catch { return fail("INVALID_DEMO_ACCOUNT", 400); }
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 || !("account" in input) || (input.account !== "adviser" && input.account !== "owner")) return fail("INVALID_DEMO_ACCOUNT", 400);

  // The selector chooses a provisioned account; it grants no permissions itself.
  const email = input.account === "adviser" ? process.env.SHAMSY_DEMO_ADVISER_EMAIL : process.env.SHAMSY_DEMO_OWNER_EMAIL;
  const password = input.account === "adviser" ? process.env.SHAMSY_DEMO_ADVISER_PASSWORD : process.env.SHAMSY_DEMO_OWNER_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!email || !password || !url || !key) return fail("DEMO_LOGIN_UNAVAILABLE", 503);

  // Attach cookies only to the successful redirect, never to an error response.
  const response = NextResponse.redirect(new URL("/orders/new", requestUrl), 303);
  for (const [name, value] of Object.entries(noStore)) response.headers.set(name, value);
  const db = createServerClient(url, key, {
    cookieOptions: { sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies, headers) => {
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      },
    },
  });
  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.session) return fail("DEMO_LOGIN_UNAVAILABLE", 503);
    const { data: member, error: memberError } = await db.from("organization_members").select("role").eq("organization_id", DEMO_ORG).eq("user_id", data.user.id).eq("active", true).maybeSingle();
    const expectedRole = input.account === "adviser" ? "sales_adviser" : "owner";
    if (memberError || member?.role !== expectedRole) {
      await db.auth.signOut({ scope: "local" });
      return fail("DEMO_LOGIN_UNAVAILABLE", 503);
    }
    return response;
  } catch { return fail("DEMO_LOGIN_UNAVAILABLE", 503); }
}
