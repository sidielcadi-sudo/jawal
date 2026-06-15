import type { Config } from 'tailwindcss';
import rtl from 'tailwindcss-rtl';

const config: Config = {
  content: [
    './src/**/*.{ts,tsx,js,jsx,mdx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-arabic)', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Bleu institutionnel — primaire 600 = #1A56DB, hover 700 = #1E40AF.
        brand: {
          50: '#EFF6FF', // fond actif (sidebar / onglet)
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD', // anneau de focus
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#1A56DB', // primaire
          700: '#1E40AF', // hover
          800: '#1E3A8A',
          900: '#172554',
        },
      },
      borderRadius: {
        // Spec design : boutons / inputs / onglets = 6px ; cards / modales = 8px.
        md: '6px',
        lg: '6px',
        xl: '8px',
        '2xl': '8px',
      },
    },
  },
  plugins: [rtl],
};

export default config;
