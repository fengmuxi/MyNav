/**
 * 全局系统设置状态 (Zustand)
 * ------------------------------------------------------------------
 * 从后端 /api/settings/public 拉取公开设置，供全站组件使用。
 * - siteName: 站点名称（Logo、标题、页脚）
 * - siteDescription: 站点描述（登录页副标题、SEO）
 * - siteIcon: 站点图标
 * - icp: ICP备案号（页脚）
 * - 其余字段用于注册、主题、搜索等功能开关
 *
 * 无需 persist：设置由服务端管理，每次刷新重新拉取即可。
 */
import { create } from 'zustand';
import api from '../api/axios';
import type { PublicSystemSettings } from '../types/settings';

interface SettingsState {
  settings: PublicSystemSettings | null;
  loaded: boolean;
  load: () => Promise<void>;
}

const DEFAULT_PUBLIC: PublicSystemSettings = {
  siteName: '沐曦导航',
  siteDescription: '沐曦导航 - 简洁优雅的个人导航主页',
  siteIcon: '/logo.png',
  icp: '',
  allowRegister: true,
  registerMethod: 'email',
  oauthProviders: [],
  allowCustomTheme: true,
  enableSearch: true,
  maintenanceMode: false,
  maintenanceNotice: '',
};

/**
 * 动态更新浏览器标签页 favicon
 * - 存在 link[rel="icon"] 则更新 href
 * - 不存在则创建并插入 head
 */
function applyFavicon(href: string) {
  if (!href) return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loaded: false,

  load: async () => {
    try {
      const { data } = await api.get<PublicSystemSettings>('/settings/public');
      set({ settings: data, loaded: true });
      if (data.siteIcon) applyFavicon(data.siteIcon);
    } catch {
      // 后端不可用：使用默认值，避免页面空白
      set({ settings: DEFAULT_PUBLIC, loaded: true });
      if (DEFAULT_PUBLIC.siteIcon) applyFavicon(DEFAULT_PUBLIC.siteIcon);
    }
  },
}));
