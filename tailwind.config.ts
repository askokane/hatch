import type { Config } from "tailwindcss";

// HATCH design tokens — builder-serious, terminal/monospace register.
// Palette (5 values): paper (bg), ink (text), pine (accent), hairline (border), brick (danger/state).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAFAF7",
        ink: "#14181B",
        pine: "#2F6F4F",
        hairline: "#D8D8D2",
        brick: "#B23B2E",
        // muted derivations for secondary text / subtle fills, kept within the family
        "ink-muted": "#5B6469",
        "pine-soft": "#E8F0EB",
        "brick-soft": "#F6E7E5",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        // 7-step type scale: 12 / 14 / 16 / 18 / 24 / 32 / 44
        "2xs": ["0.75rem", { lineHeight: "1rem" }],
        xs: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.6rem" }],
        lg: ["1.125rem", { lineHeight: "1.7rem" }],
        xl: ["1.5rem", { lineHeight: "1.9rem" }],
        "2xl": ["2rem", { lineHeight: "2.3rem" }],
        "3xl": ["2.75rem", { lineHeight: "3rem" }],
      },
      borderColor: {
        DEFAULT: "#D8D8D2",
      },
    },
  },
  plugins: [],
};

export default config;
