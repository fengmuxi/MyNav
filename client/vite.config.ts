import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite 配置
// - 启用 React 插件
// - 将 /api 请求代理到后端 (默认 http://localhost:3000)
// - 将 /uploads 静态资源代理到后端（用户上传的头像等）
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
