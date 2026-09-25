"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { calculateLine, calculateOrder, customers, dollarsInput, fingerprint, MIN_RATE, money, parseUsd, percent, products, sdg, type Draft, type DraftLine, WORKED_EXAMPLE } from "@/lib/finance";
import { clearDraft, getDraft, saveDraft } from "@/lib/draft-store";
import { AuthPanel, SessionStrip, authorizedFetch, type Identity } from "@/lib/auth-client";

function freshDraft(): Draft { return { idempotencyKey: crypto.randomUUID(), customerId: customers[0].id, rate: 8200, lines: [] }; }
const statusLabels = { normal: "No discount", sand: "Within adviser limit", red: "High discount", blocked: "Owner approval required", approved: "Approved by owner" };
export default function NewOrder() { return <AuthPanel>{identity => <NewOrderForm identity={identity} />}</AuthPanel>; }
function NewOrderForm({ identity }: { identity: Identity }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedLocally, setSavedLocally] = useState(false);
  const edited = useRef(false);
  useEffect(() => { const timer = setTimeout(() => setDraft(getDraft() || freshDraft()), 0); return () => clearTimeout(timer); }, []);
  useEffect(() => { if (getDraft()) return; let active = true; authorizedFetch("/api/rate").then(r => r.json()).then(data => { if (active && !edited.current && Number.isSafeInteger(data.rate)) setDraft(d => d && !d.lines.length ? { ...d, rate: data.rate } : d); }).catch(() => {}); return () => { active = false; }; }, []);
  useEffect(() => { if (!draft) return; saveDraft(draft); const timer = setTimeout(() => setSavedLocally(true), 0); return () => clearTimeout(timer); }, [draft]);
  const totals = useMemo(() => { try { return draft && draft.lines.length ? calculateOrder(draft) : null; } catch { return null; } }, [draft]);
  function update(patch: Partial<Draft>) { edited.current = true; setDraft(d => d ? { ...d, ...patch } : d); setSavedLocally(false); setMessage(""); }
  function updateLine(id: string, patch: Partial<DraftLine>) { if (!draft) return; update({ lines: draft.lines.map(line => line.id === id ? { ...line, ...patch, approval: undefined } : line) }); }
  function loadExample() { edited.current = true; setDraft({ ...structuredClone(WORKED_EXAMPLE), idempotencyKey: crypto.randomUUID() }); setMessage(""); }
  function resetForm() { edited.current = true; clearDraft(); setDraft(freshDraft()); setMessage(""); setSavedLocally(false); }
  async function approve(line: DraftLine) {
    if (!draft) return;
    setBusy(true); setMessage("");
    try {
      const response = await authorizedFetch("/api/approvals", { method: "POST", body: JSON.stringify({ orderKey: draft.idempotencyKey, line, note: "Approved for worked example" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDraft({ ...draft, lines: draft.lines.map(item => item.id === line.id ? { ...item, approval: { fingerprint: fingerprint(line), approvedAt: new Date().toISOString(), approvedBy: identity.email, note: "Approved for worked example" } } : item) });
      setMessage("Owner approval recorded for this exact line.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Approval failed."); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!draft) return;
    setBusy(true); setMessage("");
    try {
      const response = await authorizedFetch("/api/orders", { method: "POST", body: JSON.stringify(draft) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save order.");
      clearDraft();
      router.push(`/orders/${data.id}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connection problem. Your draft is saved locally; try again."); }
    finally { setBusy(false); }
  }
  if (!draft) return <div className="page"><p>Restoring local draft…</p></div>;
  return <div className="page order-page"><div className="page-heading"><div><div className="eyebrow">SALES / ORDER ENTRY</div><h1>New order</h1><p>Fixed USD catalogue pricing, line discounts, and one rate snapshot.</p></div><div className="page-actions"><button className="button secondary" onClick={resetForm}>Clear draft</button><button className="button secondary" onClick={loadExample}>Load worked example</button></div></div>
    <SessionStrip identity={identity} onSignOut={() => saveDraft(draft)} />
    <div className="order-layout"><div className="form-column"><section className="panel"><div className="section-head"><span className="step">01</span><div><h2>Customer & rate</h2><p>Rate is captured on the order when saved.</p></div></div><div className="two-fields"><label>Customer<select value={draft.customerId} onChange={e => update({ customerId: e.target.value })}>{customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.city}</option>)}</select></label><label>SDG per USD<input inputMode="numeric" type="number" min={MIN_RATE} value={draft.rate} onChange={e => update({ rate: Number(e.target.value) })} onBlur={() => { if (draft.rate < MIN_RATE || !Number.isSafeInteger(draft.rate)) { update({ rate: MIN_RATE }); setMessage("Minimum rate is 8,000 SDG/USD. Rate reset to 8,000."); } }} /><small>Minimum 8,000 · applies to all lines</small></label></div></section>
      <section className="panel"><div className="section-head"><span className="step">02</span><div><h2>Products & discounts</h2><p>Unit prices come from the fixed catalogue.</p></div></div><div className="line-list">{draft.lines.map((line, index) => { let calc: ReturnType<typeof calculateLine> | null = null; try { calc = calculateLine(line); } catch { /* Invalid input remains editable. */ } return <div className="line" key={line.id}><div className="line-top"><strong>Line {index + 1}</strong><button className="text-button" onClick={() => update({ lines: draft.lines.filter(item => item.id !== line.id) })}>Remove</button></div><label>Product<select value={line.productId} onChange={e => updateLine(line.id, { productId: e.target.value })}>{products.map(p => <option key={p.id} value={p.id}>{p.name} — {p.description}</option>)}</select></label><div className="line-fields"><label>Qty<input aria-label={`Quantity line ${index + 1}`} inputMode="numeric" type="number" min="1" value={line.quantity} onChange={e => updateLine(line.id, { quantity: Number(e.target.value) })} /></label><label>Unit price<div className="fixed-input">{calc ? money(calc.product.priceCents) : "—"}<span>Fixed</span></div></label><label>Discount USD<input aria-label={`Discount line ${index + 1}`} inputMode="decimal" type="number" min="0" step="0.01" value={dollarsInput(line.discountCents)} onChange={e => updateLine(line.id, { discountCents: parseUsd(e.target.value) })} /></label></div>{calc && <div className="line-result"><div><span className={`badge ${calc.status}`}>{statusLabels[calc.status]} · {percent(calc.bps)}</span><small>{money(calc.subtotalCents)} − {money(calc.discountCents)}</small></div><strong>{money(calc.totalCents)}</strong></div>}{calc?.status === "blocked" && identity.role === "owner" && <button className="button approve" disabled={busy} onClick={() => approve(line)}>Approve discount</button>}{line.approval && line.approval.fingerprint !== fingerprint(line) && <p className="field-hint">Financial inputs changed. Approval must be requested again.</p>}</div>; })}</div><button className="button secondary add-button" onClick={() => update({ lines: [...draft.lines, { id: crypto.randomUUID(), productId: products[0].id, quantity: 1, discountCents: 0 }] })}>+ Add product</button></section></div>
      <aside className="summary-panel"><div className="summary-header"><span>ORDER SUMMARY</span><span className="draft-indicator">● {savedLocally ? "Draft saved locally" : "Saving draft…"}</span></div><div className="summary-body"><div className="summary-row"><span>Subtotal</span><strong>{totals ? money(totals.subtotalCents) : "—"}</strong></div><div className="summary-row"><span>Discount</span><strong>{totals ? `−${money(totals.discountCents)}` : "—"}</strong></div><div className="summary-row rate-row"><span>Rate snapshot</span><strong>{draft.rate.toLocaleString("en-US")}</strong></div><div className="summary-total"><span>Total USD</span><strong>{totals ? money(totals.totalCents) : "—"}</strong></div><div className="summary-sdg"><span>Total SDG</span><strong>{totals ? sdg(totals.totalSdg) : "—"}</strong></div>{totals?.blocked && <div className="warning">One line needs owner approval above 5%. Save will ask the server to verify it.</div>}{message && <div className={message.includes("REQUIRED") || message.includes("failed") ? "error-message" : "info-message"} role="status">{message}</div>}<button className="button primary save-button" disabled={busy} onClick={submit}>{busy ? "Saving order…" : "Save order"}</button><p className="demo-note">Orders and approvals are validated and persisted in PostgreSQL.</p></div></aside></div></div>;
}
