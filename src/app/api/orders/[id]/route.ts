import { authenticatedDb, apiError } from "@/lib/supabase-server";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, org } = await authenticatedDb(request);
    const { id } = await context.params;
    const { data: order, error } = await db.from("orders").select("id,customer_id,created_at,exchange_rate_sdg_per_usd,subtotal_usd_cents,discount_usd_cents,total_usd_cents,total_sdg,order_lines(id,product_id,quantity,unit_price_usd_cents,discount_usd_cents,line_total_usd_cents,discount_percentage_basis_points,discount_status,owner_approved_at),audit_events(created_at,event_type,details)").eq("organization_id", org).eq("id", id).single();
    if (error) throw new Error(error.code === "PGRST116" ? "ORDER_NOT_FOUND" : error.message);
    return Response.json(order);
  } catch (error) { return apiError(error); }
}
