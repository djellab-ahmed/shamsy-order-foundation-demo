import { authenticatedDb, apiError } from "@/lib/supabase-server";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request: Request) {
  try {
    const { db, org } = await authenticatedDb(request);
    const body = await request.json();
    const line = body.line;
    if (!uuid.test(body.orderKey) || !line || !uuid.test(line.id) || !uuid.test(line.productId) || !Number.isSafeInteger(line.quantity) || !Number.isSafeInteger(line.discountCents)) throw new Error("INVALID_APPROVAL_INPUT");
    const { data, error } = await db.rpc("approve_order_discount", { p_org: org, p_order_key: body.orderKey, p_line_key: line.id, p_product: line.productId, p_quantity: line.quantity, p_discount_usd_cents: line.discountCents, p_note: String(body.note || "").slice(0, 240) });
    if (error) throw new Error(error.message.includes("Owner role required") ? "OWNER_ROLE_REQUIRED" : error.message);
    return Response.json({ id: data, approved: true });
  } catch (error) { return apiError(error); }
}
