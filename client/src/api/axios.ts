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
  timeout: 15000,
});

// 请求拦截：附带 JWT + 调试日志
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // 调试日志：方便排查 Docker 部署后无法登录的问题
  console.log(`[API] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
  return config;
});

// 响应拦截：401 处理 + 调试日志
api.interceptors.response.use(
  (res) => {
    console.log(`[API] ${res.config.method?.toUpperCase()} ${res.config.url} -> ${res.status}`);
    return res;
  },
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || '';
    const method = error?.config?.method?.toUpperCase() || '';
    console.error(`[API] ${method} ${url} -> 失败: ${error?.message || error}`, {
      status,
      data: error?.response?.data,
    });

    if (status === 401) {
      // 注册/登录接口的 401 是业务错误（凭据无效等），不应清登录态或跳转
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
