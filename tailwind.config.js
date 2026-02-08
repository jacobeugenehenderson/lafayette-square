/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Category hex colors (match src/tokens/categories.js)
        // Use for neon-band-colored UI elements beyond the Tailwind palette
        'cat-dining':    '#f97316',
        'cat-historic':  '#f59e0b',
        'cat-arts':      '#8b5cf6',
        'cat-parks':     '#10b981',
        'cat-shopping':  '#f43f5e',
        'cat-services':  '#0ea5e9',
        'cat-community': '#64748b',
        // Scene background
        'scene-bg': '#1a1a2e',
      },
    },
  },
  plugins: [],
}
