/** TailwindCSS 配置 */
/** @type {import('tailwindcss').Config} */
export default {
  // 深色模式基于 class（在 <html> 上加 .dark）
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // 毛玻璃相关工具类
      backdropBlur: {
        xs: '2px',
      },
      // 卡片悬停过渡
      transitionTimingFunction: {
        nav: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      // 自定义背景色（深色模式基调）
      colors: {
        navbg: '#0f172a',
        navbg2: '#111827',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};
