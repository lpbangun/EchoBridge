/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    fontFamily: {
      sans: ['Helvetica Neue', 'Helvetica', 'Arial', 'system-ui', 'sans-serif'],
      mono: ['SF Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
    },
    extend: {},
  },
  plugins: [],
};
