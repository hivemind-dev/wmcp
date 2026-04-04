import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "wMCP CSR/SSR Demo",
  description: "Demonstrates @aurorah/wmcp protocol with CSR and SSR bindings",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <Link href="/" className="nav-logo">
            wMCP Demo
          </Link>
          <Link href="/ssr" className="nav-link nav-link-ssr">
            SSR
          </Link>
          <Link href="/csr" className="nav-link nav-link-csr">
            CSR
          </Link>
        </nav>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
