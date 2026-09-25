import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
export const metadata: Metadata = { title: "Shamsy Operations", description: "Order & Finance Foundation Concept" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><div className="app-shell"><header className="topbar"><Link href="/orders/new" className="brand"><span className="brand-mark">S</span><span><strong>Shamsy Operations</strong><small>Order entry</small></span></Link><nav><Link href="/orders/new">New order</Link><Link href="/orders">Orders</Link><Link href="/architecture">Architecture</Link><Link href="/tests">Verification</Link></nav></header><main>{children}</main><footer>Fictional trial data · authenticated order entry</footer></div></body></html>;
}
