import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Taken from the retail site's own theme colour.
        pink: { DEFAULT: "#EB3986", 600: "#D12A73", 100: "#FAD3E3", 50: "#FDF0F6" },
        vanta: "#000000",
        charcoal: "#1A1A1A",
        muted: "#6E6E6E",
        cloud: "#F6F4F2",
        line: "#E3E0DD",
        nude: "#B07A5E",
      },
      fontFamily: {
        // Loaded in the root layout via next/font, so they are self hosted and
        // do not depend on what the viewer happens to have installed.
        display: ["var(--font-display)", '"Helvetica Neue"', "Arial Narrow", "sans-serif"],
        body: ["var(--font-body)", '"Helvetica Neue"', "Helvetica", "Arial", "sans-serif"],
      },
      borderRadius: { pill: "999px" },
      letterSpacing: { brand: "0.08em" },
    },
  },
  plugins: [],
} satisfies Config;
