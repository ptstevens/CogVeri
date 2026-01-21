/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // CogVeri Brand Primary - Teal (from "Veri" text)
        // Represents trust, verification, and knowledge
        primary: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        // CogVeri Brand Navy (from "Cog" text)
        // Professional, technical, trustworthy
        brand: {
          navy: '#1e3a5f',
          'navy-light': '#2d4a6f',
          'navy-lighter': '#4a6a8a',  // 50% lighter - for sidebar
          'navy-pale': '#8f9caf',     // Very light navy
          'navy-dark': '#0f2847',
          teal: '#0d9488',
          'teal-light': '#14b8a6',
          orange: '#f59e0b',
          'orange-light': '#fbbf24',
        },
        // Accent color - Orange (from "Knowledge" tagline)
        accent: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
        // Slate Neutrals - High Contrast & Clean
        gray: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        // Refined Success (Emerald)
        success: {
          DEFAULT: '#10b981',
          50: '#ecfdf5',
          100: '#d1fae5',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        // Refined Warning (Amber)
        warning: {
          DEFAULT: '#f59e0b',
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        // Refined Error (Rose)
        error: {
          DEFAULT: '#e11d48',
          50: '#fff1f2',
          100: '#ffe4e6',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgb(15 23 42 / 0.05)',
        DEFAULT: '0 1px 3px 0 rgb(15 23 42 / 0.1), 0 1px 2px -1px rgb(15 23 42 / 0.1)',
        md: '0 4px 6px -1px rgb(15 23 42 / 0.1), 0 2px 4px -2px rgb(15 23 42 / 0.1)',
        lg: '0 10px 15px -3px rgb(15 23 42 / 0.1), 0 4px 6px -4px rgb(15 23 42 / 0.1)',
        xl: '0 20px 25px -5px rgb(15 23 42 / 0.1), 0 8px 10px -6px rgb(15 23 42 / 0.1)',
        'brand': '0 4px 14px 0 rgb(13 148 136 / 0.25)',
        'brand-lg': '0 10px 25px -3px rgb(13 148 136 / 0.3)',
        'glow': '0 0 20px rgb(13 148 136 / 0.4)',
        'glow-orange': '0 0 20px rgb(245 158 11 / 0.4)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #0d9488 0%, #14b8a6 50%, #2dd4bf 100%)',
        'brand-gradient-dark': 'linear-gradient(135deg, #1e3a5f 0%, #0f2847 100%)',
        'accent-gradient': 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
        'hero-gradient': 'linear-gradient(135deg, #1e3a5f 0%, #0d9488 50%, #14b8a6 100%)',
        'cog-gradient': 'linear-gradient(135deg, #2dd4bf 0%, #a3e635 25%, #fbbf24 50%, #f97316 75%, #a855f7 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'gradient-shift': 'gradient-shift 8s ease infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
