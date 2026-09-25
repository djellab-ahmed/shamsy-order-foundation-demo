import "server-only";
import { createClient } from "@supabase/supabase-js";
import { DEMO_ORG } from "./tenant";

export async function authenticatedDb(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new Error("AUTH_REQUIRED");
  if (!url || !key) throw new Error("SUPABASE_NOT_CONFIGURED");
  const db = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("AUTH_REQUIRED");
  return { db, user: data.user, org: DEMO_ORG };
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "REQUEST_FAILED";
  const status = message === "AUTH_REQUIRED" ? 401 : message === "SUPABASE_NOT_CONFIGURED" ? 503 : message === "OWNER_APPROVAL_REQUIRED" || message === "OWNER_ROLE_REQUIRED" || message === "SALES_ROLE_REQUIRED" ? 403 : 422;
  return Response.json({ error: message }, { status });
}
