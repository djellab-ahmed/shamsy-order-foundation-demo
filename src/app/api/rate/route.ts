import { authenticatedDb, apiError } from "@/lib/supabase-server";
export async function GET(request: Request) {
  try { const { db, org } = await authenticatedDb(request); const { data, error } = await db.from("settings").select("current_rate_sdg_per_usd").eq("organization_id", org).single(); if (error) throw error; return Response.json({ rate: data.current_rate_sdg_per_usd }); }
  catch (error) { return apiError(error); }
}
export async function PATCH(request: Request) {
  try {
    const { db, org } = await authenticatedDb(request);
    const { rate } = await request.json();
    if (!Number.isSafeInteger(rate) || rate < 8000) throw new Error("RATE_BELOW_MINIMUM");
    const { data, error } = await db.from("settings").update({ current_rate_sdg_per_usd: rate }).eq("organization_id", org).select("current_rate_sdg_per_usd").single();
    if (error || !data) throw new Error("OWNER_ROLE_REQUIRED");
    return Response.json({ rate: data.current_rate_sdg_per_usd });
  } catch (error) { return apiError(error); }
}
