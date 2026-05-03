const themeTokens = require('./ui/src/design-system/tailwind-theme.cjs');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './ui/index.html',
    './ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      ...themeTokens,
    },
  },
  plugins: [],
};
