/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // iOS semantic colors. Values live in CSS variables (src/index.css) so
      // they flip with the system light/dark setting without `dark:` variants.
      colors: {
        ios: {
          bg: 'var(--ios-bg)',
          card: 'var(--ios-card)',
          fill: 'var(--ios-fill)',
          label: 'var(--ios-label)',
          secondary: 'var(--ios-secondary)',
          tertiary: 'var(--ios-tertiary)',
          separator: 'var(--ios-separator)',
          blue: 'var(--ios-blue)',
          green: 'var(--ios-green)',
          red: 'var(--ios-red)',
          orange: 'var(--ios-orange)',
          purple: 'var(--ios-purple)',
          indigo: 'var(--ios-indigo)',
          teal: 'var(--ios-teal)',
          yellow: 'var(--ios-yellow)',
          gray: 'var(--ios-gray)',
          segment: 'var(--ios-segment)',
        },
      },
      // iOS Dynamic Type sizes at the default content size.
      fontSize: {
        'ios-large': ['34px', { lineHeight: '41px', letterSpacing: '0.37px', fontWeight: '700' }],
        'ios-title2': ['22px', { lineHeight: '28px', letterSpacing: '0.35px' }],
        'ios-title3': ['20px', { lineHeight: '25px', letterSpacing: '0.38px' }],
        'ios-headline': ['17px', { lineHeight: '22px', letterSpacing: '-0.41px', fontWeight: '600' }],
        'ios-body': ['17px', { lineHeight: '22px', letterSpacing: '-0.41px' }],
        'ios-subhead': ['15px', { lineHeight: '20px', letterSpacing: '-0.24px' }],
        'ios-footnote': ['13px', { lineHeight: '18px', letterSpacing: '-0.08px' }],
        'ios-caption': ['12px', { lineHeight: '16px' }],
        'ios-caption2': ['11px', { lineHeight: '13px', letterSpacing: '0.07px' }],
      },
      fontFamily: {
        rounded: ['ui-rounded', '"SF Pro Rounded"', '-apple-system', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        ios: '22px',
      },
    },
  },
  plugins: [],
}
