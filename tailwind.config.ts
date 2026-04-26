import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        "bg-panel": "rgb(var(--bg-panel) / <alpha-value>)",
        "bg-deep": "rgb(var(--bg-deep) / <alpha-value>)",
        ink: "rgb(var(--text) / <alpha-value>)",
        "ink-mid": "rgb(var(--text) / 0.72)",
        "ink-dim": "rgb(var(--text) / 0.5)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        rule: "rgb(var(--text) / 0.08)",
        "rule-strong": "rgb(var(--text) / 0.16)",
        background: "rgb(var(--bg) / <alpha-value>)",
        foreground: "rgb(var(--text) / <alpha-value>)",
      },
      fontFamily: {
        display: [
          "Impact",
          "Arial Black",
          "Helvetica Neue Condensed Bold",
          "Helvetica Neue",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
