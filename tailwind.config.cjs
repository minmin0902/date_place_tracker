/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: {
          50: "#FFFBF5",
          100: "#FFF5E8",
          200: "#FCE8D0",
        },
        peach: {
          100: "#FFE4D6",
          200: "#FFCBB0",
          300: "#FFB088",
          400: "#F89570",
          500: "#E87858",
        },
        rose: {
          100: "#FDE2E4",
          200: "#FBC5C9",
          300: "#F5A5AD",
          400: "#E47C88",
          500: "#C95D6B",
        },
        sage: {
          100: "#E6EFE1",
          200: "#CADBC2",
          300: "#A7C198",
          400: "#7FA16E",
        },
        sand: {
          100: "#F3EBDF",
          200: "#E4D5BE",
          300: "#CDB896",
        },
        ink: {
          900: "#3A2E2A",
          700: "#5C4B45",
          500: "#8A7870",
          300: "#B8A9A1",
        },
      },
      fontFamily: {
        // Pretendard handles Korean + Latin. CJK fonts MUST come before
        // -apple-system / system-ui — otherwise iOS Safari with a
        // Korean system locale maps SF Pro's CJK fallback to a
        // Korean-styled face, and Chinese characters render visibly
        // off (slightly Japanese-looking strokes / wrong proportions).
        // Same chain as index.css body so the .font-sans utility
        // doesn't override the base body font with a worse stack.
        sans: [
          '"Pretendard Variable"',
          "Pretendard",
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Noto Sans SC"',
          '"Microsoft YaHei"',
          "-apple-system",
          "system-ui",
          "sans-serif",
        ],
        // Display goes serif: Gowun Batang for Korean, Noto Serif SC for
        // Chinese characters it doesn't cover.
        display: ['"Gowun Batang"', '"Noto Serif SC"', "serif"],
        // Rounded Latin for numbers / English accents — Quicksand on top,
        // then falls back to Pretendard so Korean/Chinese look consistent
        // when mixed into the same span. CJK ordering mirrors `sans`.
        number: [
          "Quicksand",
          '"Pretendard Variable"',
          "Pretendard",
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Noto Sans SC"',
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      boxShadow: {
        // Warm tinted (existing — keeps the peach/rose aesthetic)
        soft: "0 4px 20px -6px rgba(180, 130, 100, 0.15)",
        card: "0 2px 12px -2px rgba(180, 130, 100, 0.12)",
        // Wide, airy, nearly-neutral shadow for a softer iOS-style feel
        airy: "0 8px 30px rgb(0 0 0 / 0.06)",
        // Big lift for FABs / modals
        lift: "0 12px 40px rgb(0 0 0 / 0.12)",
      },
      backgroundImage: {
        "warm-gradient":
          "linear-gradient(135deg, #FFF5E8 0%, #FDE2E4 50%, #FFE4D6 100%)",
      },
    },
  },
  plugins: [],
};
