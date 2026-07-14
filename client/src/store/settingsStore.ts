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
 * 版本检查：
 * - version: 本地打包版本信息（版本号、发布日期、变更摘要）
 * - versionCheck: GitHub Release 对比结果（含 hasUpdate 字段供前端提示更新）
 *
 * 无需 persist：设置由服务端管理，每次刷新重新拉取即可。
 */
import { create } from 'zustand';
import api from '../api/axios';
import type { PublicSystemSettings } from '../types/settings';

/** 本地打包版本信息 */
export interface VersionInfo {
  version: string;
  releaseDate: string;
  changelogSummary: string;
}

/** GitHub Release 远端版本信息 */
export interface RemoteVersionInfo {
  version: string;
  name: string;
  publishedAt: string;
  htmlUrl: string;
  changelog: string;
}

/** 版本检查响应 */
export interface VersionCheckResult {
  local: VersionInfo;
  remote: RemoteVersionInfo | null;
  isLatest: boolean;
  hasUpdate: boolean;
  message: string;
  checkedAt: string;
}

interface SettingsState {
  settings: PublicSystemSettings | null;
  loaded: boolean;
  /** 本地版本信息（页面加载时一并拉取） */
  version: VersionInfo | null;
  /** 版本检查结果（含远端版本与是否有更新） */
  versionCheck: VersionCheckResult | null;
  versionChecking: boolean;
  load: () => Promise<void>;
  /** 主动触发版本检查（按钮点击或 footer 加载时调用） */
  checkVersion: () => Promise<void>;
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
  githubEnabled: true,
  githubUrl: 'https://github.com/fengmuxi/MyNav',
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

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loaded: false,
  version: null,
  versionCheck: null,
  versionChecking: false,

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
    // 并行拉取本地版本信息（失败静默处理）
    try {
      const { data: v } = await api.get<VersionInfo>('/settings/version');
      set({ version: v });
    } catch {
      /* 版本信息拉取失败不影响主流程 */
    }
    // 若已启用 GitHub 信息，则自动触发一次版本检查
    const settings = get().settings;
    if (settings?.githubEnabled && settings.githubUrl) {
      void get().checkVersion();
    }
  },

  checkVersion: async () => {
    if (get().versionChecking) return;
    set({ versionChecking: true });
    try {
      const { data } = await api.get<VersionCheckResult>('/settings/version/check');
      set({ versionCheck: data, versionChecking: false });
    } catch {
      set({ versionChecking: false });
    }
  },
}));
