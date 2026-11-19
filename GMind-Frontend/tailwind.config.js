/** @type {import('tailwindcss').Config} */
const blue = { 50: '#eef4ff', 100: '#dbe7ff', 200: '#bdd3ff', 300: '#8fb4fb', 400: '#5d8ef4', 500: '#3a6fe8', 600: '#2b57cf', 700: '#2445a6', 800: '#213b84', 900: '#1f3468', 950: '#141f3f' };
const violet = { 50: '#f6f3ff', 100: '#ede7ff', 200: '#ddd2ff', 300: '#c2b0fd', 400: '#a387f8', 500: '#8a62f2', 600: '#7346e0', 700: '#5f36bf', 800: '#4d2f99', 900: '#3f297a' };
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: blue,
        accent: violet,
        violet,
        canvas: '#f5f7fb',
        surface: { DEFAULT: '#ffffff', subtle: '#f0f3f9' },
        line: { DEFAULT: '#e3e8f1', strong: '#cdd5e2' },
        ink: { DEFAULT: '#121a2c', secondary: '#46526b', muted: '#5f6b84' },
        success: { 50: '#ecfbf2', 100: '#d3f5e0', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
        warning: { 50: '#fff6e5', 100: '#feeccc', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
        danger: { 50: '#fff1f0', 100: '#ffe0dd', 500: '#ef4444', 600: '#dc2626', 700: '#b42318' },
      },
      fontFamily: { sans: ['"Be Vietnam Pro"', '"Segoe UI"', 'system-ui', 'sans-serif'] },
      fontSize: {
        caption: ['0.75rem', { lineHeight: '1.4' }],
        small: ['0.8125rem', { lineHeight: '1.5' }],
        body: ['0.9375rem', { lineHeight: '1.6' }],
        section: ['1.125rem', { lineHeight: '1.45' }],
        title: ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.015em' }],
        display: ['1.875rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
      },
      borderRadius: { xl: '10px', '2xl': '14px', '3xl': '20px' },
      boxShadow: {
        raised: '0 1px 2px rgb(18 26 44 / .06), 0 4px 12px -4px rgb(18 26 44 / .08)',
        overlay: '0 16px 40px -12px rgb(18 26 44 / .22), 0 2px 6px rgb(18 26 44 / .06)',
        card: '0 1px 2px rgb(18 26 44 / .06), 0 4px 12px -4px rgb(18 26 44 / .08)',
      },
      transitionTimingFunction: { out: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      keyframes: {
        'dialog-in': { from: { opacity: '0', transform: 'translateY(6px) scale(.98)' }, to: { opacity: '1', transform: 'none' } },
        'drawer-in': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
      },
      animation: {
        'dialog-in': 'dialog-in 180ms cubic-bezier(0.16,1,0.3,1)',
        'drawer-in': 'drawer-in 220ms cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
};
