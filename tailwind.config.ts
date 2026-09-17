import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pink: { DEFAULT: "#ED3B86", 600: "#D42F76", 50: "#FDECF3" },
        nude: "#C9907A",
        cloud: "#F0EDEA",
        vanta: "#1A1A1A",
        charcoal: "#454041",
        line: "#DFD9D4",
      },
      fontFamily: {
        display: ['"Review Poster"', '"Review Condensed"', '"Arial Black"', "Impact", "sans-serif"],
        body: ['"Review"', "Arial", "Helvetica", "sans-serif"],
      },
      borderRadius: { pill: "999px" },
    },
  },
  plugins: [],
} satisfies Config;
