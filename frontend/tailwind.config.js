/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    fontFamily: {
      display: ['Space Grotesk', 'system-ui', 'sans-serif'],
      sans: ['Manrope', 'system-ui', 'sans-serif'],
      mono: ['Space Mono', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
    },
    extend: {
      colors: {
        surface: {
          DEFAULT: '#18181B',
          dark: '#111111',
          darker: '#0A0A0A',
        },
        border: {
          DEFAULT: '#27272A',
          hover: '#3F3F46',
        },
        accent: {
          DEFAULT: '#C4F82A',
          hover: '#D4FF4A',
          muted: 'rgba(196, 248, 42, 0.08)',
          border: 'rgba(196, 248, 42, 0.25)',
        },
      },
      boxShadow: {
        glow: '0 0 20px rgba(196, 248, 42, 0.12)',
        'glow-lg': '0 0 40px rgba(196, 248, 42, 0.18)',
      },
    },
  },
  plugins: [],
};
