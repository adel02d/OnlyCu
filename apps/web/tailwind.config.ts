import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0d0e15',
        panel: '#171924',
        violet: '#9c7cff',
      },
      boxShadow: {
        glow: '0 12px 44px rgba(156, 124, 255, 0.22)',
      },
    },
  },
  plugins: [],
};

export default config;
