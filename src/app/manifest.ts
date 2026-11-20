import type { MetadataRoute } from "next";

/**
 * Served as /manifest.webmanifest and linked from every page by Next.js.
 * With the service worker in public/sw.js this is what lets Chrome and Edge
 * offer "Install app", so the portal opens in its own window from the home
 * screen. The path has a file extension, so the middleware lets it through
 * for signed-out visitors.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Huda Beauty Vendor Portal",
    short_name: "HB Vendors",
    description: "Trade agreements, requests for quotation and purchase orders for Huda Beauty suppliers.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#FFFFFF",
    theme_color: "#ED3B86",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
