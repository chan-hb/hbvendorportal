import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Huda Beauty | Vendor portal",
  description: "Trade agreements, requests for quotation and vendor collaboration for Dynamics 365.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-body antialiased">{children}</body>
    </html>
  );
}
