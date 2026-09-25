export type Role = "adviser" | "owner";
export type DraftLine = { id: string; productId: string; quantity: number; discountCents: number; approval?: { fingerprint: string; approvedAt: string; approvedBy: string; note: string } };
export type Draft = { idempotencyKey: string; customerId: string; rate: number; lines: DraftLine[] };
export type DiscountStatus = "normal" | "sand" | "red" | "blocked" | "approved";
export const customers = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Ahmed Trading", city: "Khartoum" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Nile Solar", city: "Omdurman" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Dongola Power", city: "Dongola" },
] as const;
export const products = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sku: "SPF-6000-ES-PLUS", name: "SPF 6000 ES Plus", description: "6 kW inverter", priceCents: 51500 },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", sku: "SPE-12000-ES", name: "SPE 12000 ES", description: "12 kW inverter", priceCents: 97500 },
  { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", sku: "HOPE-5.0L-B1", name: "Hope 5.0L-B1", description: "5 kWh battery", priceCents: 81000 },
  { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", sku: "HOPE-16.0LM-A1", name: "Hope 16.0LM-A1", description: "16 kWh battery", priceCents: 207000 },
] as const;
export const MIN_RATE = 8000;
export const WORKED_EXAMPLE: Draft = { idempotencyKey: "", customerId: customers[0].id, rate: 8200, lines: [
  { id: "10000000-0000-4000-8000-000000000001", productId: products[0].id, quantity: 4, discountCents: 4000 },
  { id: "10000000-0000-4000-8000-000000000002", productId: products[2].id, quantity: 2, discountCents: 7000 },
  { id: "10000000-0000-4000-8000-000000000003", productId: products[3].id, quantity: 1, discountCents: 15000 },
] };
export function fingerprint(line: DraftLine): string { const price = products.find(p => p.id === line.productId)?.priceCents; return `${line.productId}:${line.quantity}:${price}:${line.discountCents}`; }
export function money(cents: number): string { return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`; }
export function sdg(amount: number): string { return `${amount.toLocaleString("en-US")} SDG`; }
export function percent(bps: number): string { return `${(bps / 100).toFixed(2)}%`; }
export function parseUsd(input: string): number { if (!/^\d+(?:\.\d{0,2})?$/.test(input)) return 0; const [whole, fractional = ""] = input.split("."); return Number(BigInt(whole) * 100n + BigInt(fractional.padEnd(2, "0") || "0")); }
export function dollarsInput(cents: number): string { return (cents / 100).toFixed(2); }
export function calculateLine(line: DraftLine) {
  const product = products.find(p => p.id === line.productId);
  if (!product) throw new Error("Choose a valid product.");
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 9999) throw new Error("Quantity must be between 1 and 9,999.");
  if (!Number.isSafeInteger(line.discountCents) || line.discountCents < 0) throw new Error("Discount must be a non-negative USD amount.");
  const subtotal = BigInt(product.priceCents) * BigInt(line.quantity);
  if (BigInt(line.discountCents) > subtotal) throw new Error("Discount cannot exceed the line value.");
  const bps = Number((BigInt(line.discountCents) * 10000n + subtotal / 2n) / subtotal);
  const discount = BigInt(line.discountCents);
  const status: DiscountStatus = discount === 0n ? "normal" : discount * 100n <= subtotal * 3n ? "sand" : discount * 100n <= subtotal * 5n ? "red" : line.approval?.fingerprint === fingerprint(line) ? "approved" : "blocked";
  return { product, subtotalCents: Number(subtotal), discountCents: line.discountCents, totalCents: Number(subtotal - BigInt(line.discountCents)), bps, status };
}
export function calculateOrder(draft: Draft) {
  if (!Number.isSafeInteger(draft.rate) || draft.rate < MIN_RATE || draft.rate > 100000000) throw new Error(`Exchange rate must be at least ${MIN_RATE.toLocaleString("en-US")} SDG/USD.`);
  if (!customers.some(c => c.id === draft.customerId)) throw new Error("Choose a valid customer.");
  if (draft.lines.length === 0) throw new Error("Add at least one product.");
  const lines = draft.lines.map(calculateLine);
  const subtotalCents = lines.reduce((sum, line) => sum + BigInt(line.subtotalCents), 0n);
  const discountCents = lines.reduce((sum, line) => sum + BigInt(line.discountCents), 0n);
  const totalCents = subtotalCents - discountCents;
  const totalSdg = (totalCents * BigInt(draft.rate) + 50n) / 100n;
  if (totalSdg > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Order amount is too large.");
  return { lines, subtotalCents: Number(subtotalCents), discountCents: Number(discountCents), totalCents: Number(totalCents), totalSdg: Number(totalSdg), blocked: lines.some(line => line.status === "blocked") };
}
export function validateSave(draft: Draft) {
  const result = calculateOrder(draft);
  if (result.blocked) throw new Error("Owner approval is required for one line above the 5% discount threshold.");
  return result;
}
