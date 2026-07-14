/**
 * Axios 实例配置
 * ------------------------------------------------------------------
 * - baseURL: /api（由 Vite 代理转发到后端）
 * - 请求拦截器：自动在 Authorization 头附带 Bearer token
 * - 响应拦截器：401 时清除登录状态并跳转登录页
 */
import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

// 请求拦截：附带 JWT
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截：401 处理
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      // 注册/登录接口的 401 是业务错误（凭据无效等），不应清登录态或跳转
      const url = error?.config?.url || '';
      const isAuthEndpoint = url.startsWith('/auth/login') || url.startsWith('/auth/register');
      if (!isAuthEndpoint) {
        // token 失效：清除并跳转登录
        useAuthStore.getState().logout();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;
