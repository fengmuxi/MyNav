/**
 * 全局提示 (Toast) 状态管理 (Zustand)
 * ------------------------------------------------------------------
 * 统一管理页面接口提示信息，从屏幕右侧滑入展示，自动消失。
 * 替代原本散落在各页面中的 alert / setError / setMsg 等内联提示。
 */
import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  /** 自动消失时长（毫秒），0 表示不自动关闭。默认 3000ms */
  duration: number;
}

interface ToastState {
  toasts: ToastItem[];
  /** 推送一条提示 */
  push: (type: ToastType, message: string, duration?: number) => number;
  /** 关闭并移除某条提示 */
  dismiss: (id: number) => void;
}

let seed = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  // 推送提示：自动生成唯一 id，并按 duration 安排自动消失
  push: (type, message, duration = 3000) => {
    const id = ++seed;
    const item: ToastItem = { id, type, message, duration };
    set((s) => ({ toasts: [...s.toasts, item] }));
    if (duration > 0) {
      window.setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, duration);
    }
    return id;
  },

  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/**
 * 命令式 API：在非组件代码中也可直接调用
 * 例如：toast.success('保存成功') / toast.error('网络错误')
 */
export const toast = {
  success: (msg: string, duration?: number) =>
    useToastStore.getState().push('success', msg, duration),
  error: (msg: string, duration?: number) =>
    useToastStore.getState().push('error', msg, duration),
  warning: (msg: string, duration?: number) =>
    useToastStore.getState().push('warning', msg, duration),
  info: (msg: string, duration?: number) =>
    useToastStore.getState().push('info', msg, duration),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
};
