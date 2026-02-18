/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0E1012',
        panel: '#171A1F',
        muted: '#9EA4AE',
        accent: '#FC4C02',
        border: '#262B33'
      },
      boxShadow: {
        card: '0 10px 30px rgba(0, 0, 0, 0.25)'
      }
    }
  },
  plugins: []
};
