/**
 * 认证状态管理 (Zustand)
 * ------------------------------------------------------------------
 * 管理 token 与 user，并持久化到 localStorage。
 *
 * 关键说明（persist 水合时序）：
 * - zustand persist 从 localStorage 恢复是异步的
 * - 首次渲染 token=null，水合完成后 token 才是真实值
 * - 提供 hasHydrated 标志，组件可在水合完成前避免渲染内容
 *   防止登录用户首次进入时闪一下未登录/公共导航界面
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import api from '../api/axios';
import { encryptPassword, isSecureContext, clearPublicKeyCache } from '../api/crypto';
import { srpLogin } from '../api/srp';
import { useThemeStore } from './themeStore';

interface AuthState {
  token: string | null;
  user: User | null;
  /** persist 是否已完成从 localStorage 水合 */
  hasHydrated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  /** 局部更新当前用户信息（用于个人资料编辑后同步本地状态） */
  updateUser: (patch: Partial<User>) => void;
  /** 标记水合完成（由 persist onRehydrateStorage 触发） */
  setHydrated: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      hasHydrated: false,

      // 调用登录接口并保存 token/user
      // 根据安全上下文自动选择认证方案：
      // - HTTPS（安全上下文）：RSA 加密密码传输，后端解密后比对 bcrypt
      // - HTTP（非安全上下文）：SRP-6a 握手，密码永不离开客户端
      // 登录成功后立即拉取用户主题方案
      login: async (username, password) => {
        let token: string;
        let user: User;

        if (isSecureContext()) {
          // ===== HTTPS：RSA 加密流程 =====
          console.log('[AuthStore] 安全上下文，使用 RSA 加密登录');
          let encryptedPassword = await encryptPassword(password);
          let loginResp;
          try {
            loginResp = await api.post('/auth/login', {
              username,
              password: encryptedPassword,
            });
          } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
            // RSA 密钥可能已重新生成（管理员操作），旧公钥加密的密文无法被新私钥解密
            if (axiosErr.response?.status === 400 && axiosErr.response?.data?.error?.includes('解密失败')) {
              console.log('[AuthStore] RSA 解密失败，推测密钥已更新，清除缓存并重试');
              clearPublicKeyCache();
              encryptedPassword = await encryptPassword(password);
              loginResp = await api.post('/auth/login', {
                username,
                password: encryptedPassword,
              });
            } else {
              throw err;
            }
          }
          if (!loginResp.data.token || !loginResp.data.user) throw new Error('登录响应不完整');
          token = loginResp.data.token;
          user = loginResp.data.user;
        } else {
          // ===== HTTP：SRP-6a 握手流程 =====
          console.log('[AuthStore] 非安全上下文，使用 SRP-6a 握手登录');
          const result = await srpLogin(username, password);
          token = result.token;
          user = result.user as User;
        }

        set({ token, user });
        await useThemeStore.getState().fetchRemote();
      },

      // 退出：清空状态，主题保留本地偏好（不强制重置）
      logout: () => set({ token: null, user: null }),

      // 局部更新用户信息
      updateUser: (patch) =>
        set((state) => (state.user ? { user: { ...state.user, ...patch } } : state)),

      setHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'mynav-auth', // localStorage key
      // 水合完成后触发：标记为 true，让等待的组件可以渲染
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
