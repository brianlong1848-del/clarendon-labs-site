import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        "bg-2": "rgb(var(--bg-2) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-2": "rgb(var(--ink-2) / <alpha-value>)",
        mute: "rgb(var(--mute) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        "line-2": "rgb(var(--line-2) / <alpha-value>)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        "accent-text": "var(--accent-text)",
        background: "rgb(var(--bg) / <alpha-value>)",
        foreground: "rgb(var(--ink) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
