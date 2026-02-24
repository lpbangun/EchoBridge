/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    fontFamily: {
      sans: ['Outfit', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
    },
    extend: {
      colors: {
        glass: {
          DEFAULT: 'rgba(255, 255, 255, 0.05)',
          hover: 'rgba(255, 255, 255, 0.08)',
          border: 'rgba(255, 255, 255, 0.1)',
          strong: 'rgba(255, 255, 255, 0.12)',
        },
      },
      backdropBlur: {
        glass: '20px',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0, 0, 0, 0.2)',
        glow: '0 0 20px rgba(249, 115, 22, 0.15)',
        'glow-lg': '0 0 40px rgba(249, 115, 22, 0.2)',
      },
    },
  },
  plugins: [],
};
