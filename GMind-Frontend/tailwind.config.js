/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { 50: '#eef4fd', 100: '#dce8fa', 200: '#bcd4f5', 300: '#8fb8ee', 400: '#5c97e8', 500: '#3679e5', 600: '#2f66c4', 700: '#2852a0', 800: '#234380', 900: '#1d3867' },
        success: { 50: '#f0fdf4', 100: '#dcfce7', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
        warning: { 50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
        danger: { 50: '#fef2f2', 100: '#fee2e2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
      },
      boxShadow: { card: '0 1px 2px rgba(24, 37, 61, 0.04), 0 4px 16px rgba(24, 37, 61, 0.06)' },
      borderRadius: { '2xl': '18px' },
    },
  },
  plugins: [],
};
