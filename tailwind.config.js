/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef4ff', 100: '#dbe6fe', 200: '#bfd3fe', 300: '#93b4fd', 400: '#608bfa', 500: '#3b64f6', 600: '#2549eb', 700: '#1d38d8', 800: '#1e2faf', 900: '#1e2c8a' },
      },
      boxShadow: { card: '0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.1)' },
    },
  },
  plugins: [],
}
