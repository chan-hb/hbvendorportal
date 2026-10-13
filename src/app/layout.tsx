import type { Metadata } from "next";
import { Archivo, Archivo_Narrow } from "next/font/google";
import "./globals.css";

/**
 * The storefront uses a licensed condensed grotesque. These are the closest
 * open equivalents, loaded properly rather than relying on a narrow face
 * happening to exist on the machine. Swap the imports if Huda Beauty licenses
 * the real family for internal tools.
 */
const body = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const display = Archivo_Narrow({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Huda Beauty | Vendor portal",
  description: "Trade agreements, requests for quotation and vendor collaboration for Dynamics 365.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body className="min-h-screen font-body antialiased">{children}</body>
    </html>
  );
}
