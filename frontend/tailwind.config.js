const { createGlobPatternsForDependencies } = require('@nx/angular/tailwind');
const { join } = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // We will toggle 'dark' class on the body
  content: [
    join(__dirname, 'src/**/!(*.stories|*.spec).{ts,html}'),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: {
    extend: {
      colors: {
        finmate: {
          dark: '#121212', // Deep charcoal
          card: '#1e1e1e', // Slightly lighter dark
          neon: '#00f2fe', // Cyan neon
          neon2: '#4facfe', // Blue neon
          light: '#f8fafc', // Soft gray/white
          lightCard: '#ffffff', // Pure white
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-dark': 'linear-gradient(to right bottom, #121212, #1a1a2e)',
        'gradient-light': 'linear-gradient(to right bottom, #f8fafc, #e2e8f0)',
        'gradient-neon': 'linear-gradient(to right, #00f2fe, #4facfe)',
      }
    },
  },
  plugins: [],
};
