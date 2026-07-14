/**
 * 主题状态管理 (Zustand)
 * ------------------------------------------------------------------
 * 职责：
 * 1. 持有当前主题 ThemePreset（主色、背景、表面、文字、圆角、阴影）
 * 2. 将主题写入设计稿 token CSS 变量（--color-primary / --bg-page / --text-primary 等）
 * 3. 根据背景亮度自动派生 secondary/tertiary/border/inset 等辅助色
 * 4. 未登录时持久化到 localStorage（本地偏好）
 * 5. 登录后从后端拉取用户主题并覆盖本地（fetchRemote）
 * 6. 修改主题时同步到后端（save，需已登录）
 *
 * 写入的 CSS 变量（在 index.css 中被 .bg-page/.text-primary 等消费）：
 *   --color-primary, --bg-page, --bg-surface, --bg-inset,
 *   --text-primary, --text-secondary, --text-tertiary,
 *   --border-default, --border-strong, --border-focus,
 *   --radius-card, --shadow-card
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemePreset, CardRadius, CardShadow } from '../types';
import { DEFAULT_THEME } from '../types';
import api from '../api/axios';
import { useAuthStore } from './authStore';

/** 圆角档位 -> CSS 值 */
const RADIUS_MAP: Record<CardRadius, string> = {
  none: '0px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
};

/** 阴影模式 -> CSS box-shadow 值（浅色基调，深色主题用更深的阴影） */
const SHADOW_MAP_LIGHT: Record<CardShadow, string> = {
  none: 'none',
  sm: '0 1px 3px rgba(22, 26, 38, 0.05)',
  md: '0 4px 12px rgba(22, 26, 38, 0.05)',
  lg: '0 8px 24px rgba(22, 26, 38, 0.08)',
  glow: '0 0 24px var(--color-primary-soft, rgba(79, 110, 247, 0.35))',
};

const SHADOW_MAP_DARK: Record<CardShadow, string> = {
  none: 'none',
  sm: '0 1px 3px rgba(0, 0, 0, 0.25)',
  md: '0 4px 12px rgba(0, 0, 0, 0.35)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.45)',
  glow: '0 0 24px var(--color-primary-soft, rgba(168, 85, 247, 0.4))',
};

/** #rrggbb / #rgb -> rgba()，非 hex 时返回原值兜底 */
function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (h.length !== 6) return hex; // 非 hex（如已是 rgba），原样返回
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 计算 hex 颜色的相对亮度（0~1），用于判断浅/深色主题 */
function getLuminance(hex: string): number {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (h.length !== 6) return 1; // 非 hex 默认按浅色处理
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  // sRGB 亮度公式
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 将主题写入设计稿 token CSS 变量
 * - 主色/背景/表面/文字直接写入
 * - secondary/tertiary/border/inset 根据背景亮度派生
 * - 同时写入一个半透明主色变量供 glow 阴影使用
 */
function applyThemeToDOM(theme: ThemePreset): void {
  const root = document.documentElement;
  const isLight = getLuminance(theme.background) > 0.4;

  // ---- 主色及派生色阶 ----
  root.style.setProperty('--color-primary', theme.accentColor);
  root.style.setProperty('--color-primary-soft', hexToRgba(theme.accentColor, 0.35));
  // 主色 50/100 浅色背景（用于 hover/选中态）
  root.style.setProperty('--color-primary-50', hexToRgba(theme.accentColor, isLight ? 0.06 : 0.12));
  root.style.setProperty('--color-primary-100', hexToRgba(theme.accentColor, isLight ? 0.12 : 0.2));

  // ---- 背景 ----
  root.style.setProperty('--bg-page', theme.background);
  root.style.setProperty('--bg-surface', theme.surfaceColor);
  // inset：浅色主题用浅灰，深色主题用稍亮的深色
  root.style.setProperty('--bg-inset', isLight ? '#F1F3F8' : 'rgba(255, 255, 255, 0.04)');

  // ---- 文字 ----
  root.style.setProperty('--text-primary', theme.textColor);
  if (isLight) {
    root.style.setProperty('--text-secondary', '#4A5168');
    root.style.setProperty('--text-tertiary', '#9AA3B8');
  } else {
    root.style.setProperty('--text-secondary', 'rgba(255, 255, 255, 0.7)');
    root.style.setProperty('--text-tertiary', 'rgba(255, 255, 255, 0.45)');
  }

  // ---- 边框 ----
  if (isLight) {
    root.style.setProperty('--border-default', '#E5E8F0');
    root.style.setProperty('--border-strong', '#CBD1DE');
  } else {
    root.style.setProperty('--border-default', 'rgba(255, 255, 255, 0.1)');
    root.style.setProperty('--border-strong', 'rgba(255, 255, 255, 0.18)');
  }
  root.style.setProperty('--border-focus', theme.accentColor);

  // ---- 卡片圆角/阴影 ----
  root.style.setProperty('--radius-card', RADIUS_MAP[theme.cardRadius]);
  const shadowMap = isLight ? SHADOW_MAP_LIGHT : SHADOW_MAP_DARK;
  root.style.setProperty('--shadow-card', shadowMap[theme.cardShadow]);

  // ---- color-scheme：影响原生控件（滚动条/日期选择器等） ----
  root.style.setProperty('color-scheme', isLight ? 'light' : 'dark');
}

interface ThemeState {
  theme: ThemePreset;
  /** 应用主题到 DOM（不落库） */
  apply: (theme: ThemePreset) => void;
  /** 切换到某个预设 */
  usePreset: (preset: ThemePreset) => void;
  /** 局部更新当前主题（自定义时调用） */
  patch: (partial: Partial<ThemePreset>) => void;
  /** 登录后从后端拉取并覆盖本地主题 */
  fetchRemote: () => Promise<void>;
  /** 保存当前主题到后端（需登录） */
  save: () => Promise<void>;
  /** 重置为默认主题 */
  reset: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: DEFAULT_THEME,

      // 仅应用，不改状态来源标识
      apply: (theme) => {
        applyThemeToDOM(theme);
        set({ theme });
      },

      // 切换预设：presetId 保持为该预设 id
      usePreset: (preset) => {
        const next: ThemePreset = { ...preset, presetId: preset.id };
        applyThemeToDOM(next);
        set({ theme: next });
        // 切换预设后自动保存（如已登录）
        void get().save();
      },

      // 局部更新：标记为 custom（脱离原预设）
      patch: (partial) => {
        const current = get().theme;
        const next: ThemePreset = {
          ...current,
          ...partial,
          presetId: 'custom', // 任何局部改动都视为自定义
          name: partial.name ?? '自定义',
        };
        applyThemeToDOM(next);
        set({ theme: next });
      },

      // 登录后从后端拉取主题，覆盖本地
      fetchRemote: async () => {
        try {
          const { data } = await api.get<{ theme: ThemePreset | null }>('/user/theme');
          if (data.theme) {
            // 后端返回的主题覆盖本地
            applyThemeToDOM(data.theme);
            set({ theme: data.theme });
          }
          // 若后端为 null，保留本地主题不动（首次登录沿用本地偏好）
        } catch {
          // 拉取失败不影响使用，沿用本地主题
        }
      },

      // 保存到后端：
      // - 已登录：PUT /user/theme 同步到账户
      // - 未登录：直接跳过（主题已由 persist 写入 localStorage）
      //   失败时抛错以便调用方提示用户
      save: async () => {
        if (!useAuthStore.getState().token) return;
        await api.put('/user/theme', { theme: get().theme });
      },

      reset: () => {
        const next: ThemePreset = { ...DEFAULT_THEME };
        applyThemeToDOM(next);
        set({ theme: next });
        void get().save();
      },
    }),
    {
      name: 'mynav-theme', // localStorage key
      // 持久化时同时应用一次到 DOM，保证刷新后生效
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeToDOM(state.theme);
      },
    },
  ),
);

// 模块加载时立即应用一次，避免首屏闪烁
if (typeof document !== 'undefined') {
  applyThemeToDOM(useThemeStore.getState().theme);
}
