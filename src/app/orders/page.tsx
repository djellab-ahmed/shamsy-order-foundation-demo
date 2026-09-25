"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { customers, money, sdg } from "@/lib/finance";
import { AuthPanel, SessionStrip, authorizedFetch, type Identity } from "@/lib/auth-client";
type OrderRow = { id: string; customer_id: string; created_at: string; exchange_rate_sdg_per_usd: number; total_usd_cents: number; total_sdg: number };
export default function Orders() { return <AuthPanel>{identity => <OrdersList identity={identity} />}</AuthPanel>; }
function OrdersList({ identity }: { identity: Identity }) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { authorizedFetch("/api/orders").then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); setOrders(data); }).catch(e => setError(e.message)); }, []);
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">SALES / ORDERS</div><h1>Orders</h1><p>Saved order facts retain their original rate and prices.</p></div><Link href="/orders/new" className="button primary">+ New order</Link></div><SessionStrip identity={identity} />{error && <p className="error-message">{error}</p>}<div className="panel list-panel"><div className="list-heading"><span>Customer</span><span>Created</span><span>Rate</span><span>Total</span></div>{orders.length ? orders.map(order => <Link className="order-row" key={order.id} href={`/orders/${order.id}`}><strong>{customers.find(c => c.id === order.customer_id)?.name}</strong><span>{new Date(order.created_at).toLocaleDateString("en-GB")}</span><span>{order.exchange_rate_sdg_per_usd.toLocaleString("en-US")}</span><span><b>{money(order.total_usd_cents)}</b><small>{sdg(order.total_sdg)}</small></span></Link>) : <div className="empty"><h2>No saved orders yet</h2><p>Load the worked example to see the discount approval and rate snapshot flow.</p><Link className="button secondary" href="/orders/new">Create an order</Link></div>}</div></div>;
}
