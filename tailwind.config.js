/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F6F5F1',
        card: '#FFFFFF',
        ink: '#1C2333',
        'ink-soft': '#4A5468',
        line: '#DDD9CF',
        ledger: '#2E4374',
        'ledger-dark': '#1E2D50',
        stamp: '#B5482A',
        brass: '#B8863B',
      },
      fontFamily: {
        display: ['"Source Serif 4"', 'Georgia', 'serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      borderRadius: {
        card: '2px',
      },
    },
  },
  plugins: [],
}
