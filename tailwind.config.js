/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FAFBFC',
        surface: '#FFFFFF',
        'surface-alt': '#EEF2F5',
        text: '#1E293B',
        'text-secondary': '#64748B',
        primary: { DEFAULT: '#155E95', dark: '#0B3F5C' },
        success: '#23A879',
        warning: '#F09A63',
        danger: '#DC3545',
        cyan: '#00BFD3',
        magenta: '#C83CC9',
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
