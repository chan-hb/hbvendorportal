import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Huda Beauty | Vendor portal",
  description: "Trade agreements, requests for quotation and vendor collaboration for Dynamics 365.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* The Review family is named first in the Tailwind stacks. Until those
          files are available the guidelines' own fallback, Arial Black and
          Impact for display, carries the condensed all-caps treatment. */}
      <body className="min-h-screen font-body antialiased">{children}</body>
    </html>
  );
}
