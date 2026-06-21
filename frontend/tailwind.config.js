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
        'xs': '375px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
      colors: {
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        error: 'rgb(var(--color-error) / <alpha-value>)',
        'finmate-bg': 'rgb(var(--color-bg) / <alpha-value>)',
        'finmate-card': 'rgb(var(--color-card) / <alpha-value>)',

        // Backward compatibility fallbacks
        finmate: {
          dark: '#121212',
          card: '#1e1e1e',
          neon: 'rgb(var(--color-primary))',
          neon2: 'rgb(var(--color-accent))',
          light: '#f8fafc',
          lightCard: '#ffffff',
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-dark': 'linear-gradient(to right bottom, rgb(var(--color-bg)), rgb(var(--color-card)))',
        'gradient-light': 'linear-gradient(to right bottom, #f8fafc, #e2e8f0)',
        'gradient-neon': 'linear-gradient(to right, rgb(var(--color-primary)), rgb(var(--color-accent)))',
      }
    },
  },
  plugins: [],
};

