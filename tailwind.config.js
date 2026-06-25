/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./frontend/src/**/*.{html,ts,scss}'],
  theme: {
    extend: {
      colors: {
        // Dynamic brand palette mapping to CSS variables
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        error: 'rgb(var(--color-error) / <alpha-value>)',
        'finmate-bg': 'rgb(var(--color-bg) / <alpha-value>)',
        'finmate-card': 'rgb(var(--color-card) / <alpha-value>)',

        // Keeping backward compatibility fallback
        conflict: {
          local: '#f87171', // red-400   — "mine"
          server: '#34d399', // emerald-400 — "theirs"
          action: '#818cf8', // indigo-400 — actions
        },
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      backdropBlur: {
        xs: '4px',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translate(-50%, -46%)' },
          to: { opacity: '1', transform: 'translate(-50%, -50%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease',
        'slide-in': 'slide-in 220ms cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
