/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{js,ts,jsx,tsx}"],
  corePlugins: {
    // Polaris ships its own base styles; do not reset the admin UI.
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        // Align with Polaris surface fill when variables exist (embedded admin).
        muted: "var(--p-color-bg-fill-secondary, #e3e3e3)",
      },
    },
  },
  plugins: [],
};
