/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Architectural neutral palette: ink, paper, stone.
        ink: {
          DEFAULT: '#111111',
          900: '#0A0A0A',
          800: '#141414',
          700: '#1F1F1F',
          600: '#2E2E2E',
          500: '#4A4A4A',
          400: '#6B6B6B',
          300: '#8F8F8F',
          200: '#B8B8B8',
          100: '#D9D9D9',
        },
        paper: {
          DEFAULT: '#FFFFFF',
          off: '#FAF9F7',
          warm: '#F4F2EE',
          sand: '#EDEAE4',
        },
        stone: {
          line: '#E4E1DB',
          mute: '#CFCBC3',
        },
        accent: {
          DEFAULT: '#111111',
          soft: '#F4F2EE',
        },
        state: {
          success: '#1F6B4A',
          warning: '#8A6A1F',
          danger: '#9B2C2C',
          info: '#25506E',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Archivo"', '"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        architect: '0.18em',
        wider2: '0.28em',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      maxWidth: {
        site: '1400px',
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '3px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(17,17,17,0.04), 0 8px 24px -12px rgba(17,17,17,0.12)',
        lift: '0 2px 4px rgba(17,17,17,0.04), 0 18px 40px -16px rgba(17,17,17,0.18)',
        panel: '0 24px 60px -24px rgba(17,17,17,0.28)',
      },
      transitionTimingFunction: {
        architect: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.3s ease both',
        'slide-in-right': 'slide-in-right 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
