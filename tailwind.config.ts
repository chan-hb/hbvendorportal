import type { Config } from "tailwindcss";

/**
 * The official HB palette. Pantone references are the source of truth; these
 * hex values are screen approximations, as the guidelines state.
 */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Power Pink, Pantone 2039C. The single hero accent.
        pink: { DEFAULT: "#ED3B86", 600: "#D42F76", 100: "#F9C4DA", 50: "#FDECF3" },
        // New Nude, Pantone 7605C. A supporting tone, not a UI colour.
        nude: "#C9907A",
        // Cloud. Preferred background for content-heavy layouts.
        cloud: "#F0EDEA",
        // Very Vanta. The luxury dark end of the palette.
        vanta: "#1A1A1A",
        // HB Charcoal. Replaces black for body text and UI chrome.
        charcoal: "#454041",
        line: "#DFD9D4",
      },
      fontFamily: {
        // Review is Huda Beauty's bespoke family. The fallback stack is the one
        // named in the guidelines rather than a substitute of my choosing, so
        // dropping the real font files in is all that is needed to use them.
        display: ['"Review Poster"', '"Review Condensed"', '"Arial Black"', "Impact", "Arial", "sans-serif"],
        headline: ['"Review Condensed"', '"Arial Black"', "Impact", "Arial", "sans-serif"],
        body: ['"Review"', "Arial", "Helvetica", "sans-serif"],
      },
      borderRadius: { pill: "999px" },
    },
  },
  plugins: [],
} satisfies Config;
