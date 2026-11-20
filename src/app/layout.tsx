import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Huda Beauty | Vendor portal",
  description: "Trade agreements, requests for quotation and purchase orders for Huda Beauty suppliers.",
  applicationName: "HB Vendors",
  // The HUDA monogram from public/, used as the browser tab and home screen icon.
  // The installable app's own icons are listed in src/app/manifest.ts.
  icons: {
    icon: [
      { url: "/HBBrandLogo.jpg", type: "image/jpeg" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/HBBrandLogo.jpg",
    apple: "/icons/icon-192.png",
  },
  // iPhone and iPad: open from the home screen without Safari's bars.
  appleWebApp: { capable: true, title: "HB Vendors", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#ED3B86",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* The Review family is named first in the Tailwind stacks. Until those
          files are available the guidelines' own fallback, Arial Black and
          Impact for display, carries the condensed all-caps treatment. */}
      <body className="min-h-screen font-body antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
