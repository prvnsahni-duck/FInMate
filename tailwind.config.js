/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './frontend/src/**/*.{html,ts,scss}',
  ],
  theme: {
    extend: {
      colors: {
        // FinMate brand palette
        surface: {
          DEFAULT: 'rgba(15, 16, 28, 0.97)',
          muted:   'rgba(255, 255, 255, 0.03)',
        },
        border: {
          glass: 'rgba(255, 255, 255, 0.08)',
        },
        conflict: {
          local:  '#f87171',   // red-400   — "mine"
          server: '#34d399',   // emerald-400 — "theirs"
          action: '#818cf8',   // indigo-400 — actions
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      backdropBlur: {
        xs: '4px',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translate(-50%, -46%)' },
          to:   { opacity: '1', transform: 'translate(-50%, -50%)' },
        },
      },
      animation: {
        'fade-in':  'fade-in 150ms ease',
        'slide-in': 'slide-in 220ms cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
