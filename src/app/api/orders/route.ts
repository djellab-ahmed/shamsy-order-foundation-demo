import { authenticatedDb, apiError } from "@/lib/supabase-server";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request: Request) {
  try {
    const { db, org } = await authenticatedDb(request);
    const draft = await request.json();
    if (!uuid.test(draft.idempotencyKey) || !uuid.test(draft.customerId) || !Number.isSafeInteger(draft.rate) || !Array.isArray(draft.lines) || draft.lines.length < 1 || draft.lines.length > 100) throw new Error("INVALID_ORDER_INPUT");
    const keys = new Set<string>();
    const lines = draft.lines.map((line: Record<string, unknown>) => {
      if (typeof line.id !== "string" || !uuid.test(line.id) || keys.has(line.id) || typeof line.productId !== "string" || !uuid.test(line.productId) || !Number.isSafeInteger(line.quantity) || !Number.isSafeInteger(line.discountCents)) throw new Error("INVALID_ORDER_LINE");
      keys.add(line.id);
      return { line_key: line.id, product_id: line.productId, quantity: line.quantity, discount_usd_cents: line.discountCents };
    });
    const { data, error } = await db.rpc("create_shamsy_order", { p_org: org, p_order_key: draft.idempotencyKey, p_customer: draft.customerId, p_rate: draft.rate, p_lines: lines });
    if (error) {
      const message = error.message;
      throw new Error(message.includes("Owner approval is required") ? "OWNER_APPROVAL_REQUIRED" : message.includes("Exchange rate below minimum") ? "RATE_BELOW_MINIMUM" : message.includes("Sales role required") ? "SALES_ROLE_REQUIRED" : message);
    }
    return Response.json({ id: data }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function GET(request: Request) {
  try {
    const { db, org } = await authenticatedDb(request);
    const { data, error } = await db.from("orders").select("id,customer_id,created_at,exchange_rate_sdg_per_usd,total_usd_cents,total_sdg").eq("organization_id", org).order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json(data);
  } catch (error) { return apiError(error); }
}
