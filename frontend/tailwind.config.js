const { createGlobPatternsForDependencies } = require('@nx/angular/tailwind');
const { join } = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    join(__dirname, 'src/**/!(*.stories|*.spec).{ts,html}'),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: {
    extend: {
      screens: {
        xs: '375px',
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
      },
      colors: {
        // Core semantic tokens — all mapped to CSS vars in styles.scss
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        error: 'rgb(var(--color-error) / <alpha-value>)',
        'finmate-bg': 'rgb(var(--color-bg) / <alpha-value>)',
        'finmate-card': 'rgb(var(--color-card) / <alpha-value>)',

        // Surface tokens — for inputs, panels, inner cards
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-alt': 'rgb(var(--color-surface-alt) / <alpha-value>)',

        // Text token — warm muted gray
        muted: 'rgb(var(--color-muted) / <alpha-value>)',

        // Border token — used at low opacity
        border: 'rgb(var(--color-border) / <alpha-value>)',

        // Legacy aliases (for gradients and backward compat)
        finmate: {
          dark: '#121212',
          card: 'rgb(var(--color-card))',
          neon: 'rgb(var(--color-primary))',
          neon2: 'rgb(var(--color-accent))',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-dark':
          'linear-gradient(to right bottom, rgb(var(--color-bg)), rgb(var(--color-card)))',
        'gradient-light': 'linear-gradient(to right bottom, #f8fafc, #e2e8f0)',
        'gradient-neon':
          'linear-gradient(to right, rgb(var(--color-primary)), rgb(var(--color-accent)))',
      },
    },
  },
  plugins: [],
};
