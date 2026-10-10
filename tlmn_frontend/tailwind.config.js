/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          950: '#0B2E23',
          900: '#0F3A2C',
          800: '#123D2E',
          700: '#1C4F3B',
          600: '#255F48',
          500: '#357057',
        },
        lacquer: {
          600: '#A6321E',
          500: '#C13F27',
          400: '#D4573C',
        },
        gold: {
          500: '#BE9A54',
          400: '#D4AF6A',
          300: '#E3C989',
        },
        paper: {
          100: '#F1EAD9',
          200: '#E8DFC9',
        },
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        felt: 'inset 0 2px 24px rgba(0,0,0,0.45)',
      },
    },
  },
  plugins: [],
};
