import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FAFBFC',
        surface: '#FFFFFF',
        'surface-alt': '#EEF2F5',
        text: '#1E293B',
        'text-secondary': '#64748B',
        primary: {
          DEFAULT: '#155E95',
          dark: '#0E436B',
          tint: '#E8F1F8',
        },
        success: {
          DEFAULT: '#1B9C6E',
          tint: '#E6F6EF',
        },
        warning: {
          DEFAULT: '#F2994A',
          tint: '#FDEEE2',
        },
        danger: {
          DEFAULT: '#DC3545',
          tint: '#FCEAEC',
        },
        cyan: '#00C2D1',
        magenta: '#A020C8',
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.04)',
      },
    },
  },
  plugins: [],
};

export default config;
