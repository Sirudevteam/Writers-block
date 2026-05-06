import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './src/shared/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1rem",
        sm: "1.5rem",
        lg: "2rem",
      },
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      screens: {
        xs: "480px",
      },
      maxWidth: {
        "content-sm": "42rem",
        "content": "48rem",
        "content-lg": "72rem",
        "content-xl": "80rem",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        cinematic: {
          orange: "#ff6b35",
          blue: "#00d4ff",
          dark: "#0a0a0a",
          darker: "#050505",
          gray: "#1a1a1a",
          light: "#f5f5f5",
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        // Inter first for Latin; browser picks Noto Sans Tamil for Tamil code points.
        sans: [
          "var(--font-inter)",
          "var(--font-noto-tamil)",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--font-courier)",
          "var(--font-noto-tamil)",
          "Courier New",
          "monospace",
        ],
        display: [
          "var(--font-space)",
          "var(--font-noto-tamil)",
          "system-ui",
          "sans-serif",
        ],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        glow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "auth-glow-slow": {
          "0%, 100%": { opacity: "0.12", transform: "scale(1)" },
          "50%": { opacity: "0.22", transform: "scale(1.08)" },
        },
        "auth-glow-slower": {
          "0%, 100%": { opacity: "0.1", transform: "scale(1)" },
          "50%": { opacity: "0.2", transform: "scale(1.06)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "glow": "glow 2s ease-in-out infinite",
        "auth-glow-slow": "auth-glow-slow 14s ease-in-out infinite",
        "auth-glow-slower": "auth-glow-slower 16s ease-in-out 2s infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
