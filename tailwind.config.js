/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf4ed',
          100: '#f9e3d1',
          200: '#f2c4a3',
          300: '#e89f6e',
          400: '#d97d43',
          500: '#b95c23',
          600: '#a34e1c',
          700: '#873f18',
          800: '#6f3317',
          900: '#5a2b16',
        },
      },
    },
  },
  plugins: [],
};
