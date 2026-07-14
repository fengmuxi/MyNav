/**
 * 系统设置：前端共享类型
 * ------------------------------------------------------------------
 * 与后端 server/src/settings.ts 保持结构一致。
 * 前端通过 GET /api/settings/public 拿到 PublicSystemSettings（脱敏）。
 * 管理员通过 GET/PUT /api/admin/settings 读写完整 SystemSettings。
 */

export type RegisterMethod = 'email' | 'invite' | 'closed';

/** 支持的第三方注册提供方 */
export type OAuthProviderId = 'google' | 'github' | 'wechat' | 'qq' | 'weibo';

export interface OAuthProvider {
  id: OAuthProviderId;
  name: string;
  enabled: boolean;
  clientId: string;
  clientSecret: string;
}

export interface SmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

export interface SystemSettings {
  siteName: string;
  siteDescription: string;
  siteIcon: string;
  icp: string;
  allowRegister: boolean;
  registerMethod: RegisterMethod;
  defaultRole: 'USER' | 'ADMIN';
  inviteCode: string;
  oauthProviders: OAuthProvider[];
  allowCustomTheme: boolean;
  allowPublicNav: boolean;
  pageSize: number;
  enableSearch: boolean;
  maxLoginAttempts: number;
  lockMinutes: number;
  sessionHours: number;
  force2FA: boolean;
  maintenanceMode: boolean;
  maintenanceNotice: string;
  smtp: SmtpConfig;
}

/** 公开设置：oauthProviders 仅含已启用项且不含 clientSecret */
export interface PublicSystemSettings {
  siteName: string;
  siteDescription: string;
  siteIcon: string;
  icp: string;
  allowRegister: boolean;
  registerMethod: RegisterMethod;
  oauthProviders: { id: OAuthProviderId; name: string }[];
  allowCustomTheme: boolean;
  enableSearch: boolean;
  maintenanceMode: boolean;
  maintenanceNotice: string;
}

/** 第三方提供方展示元数据（品牌色与图标 key） */
export const OAUTH_PROVIDER_META: Record<
  OAuthProviderId,
  { name: string; color: string }
> = {
  google: { name: 'Google', color: '#4285F4' },
  github: { name: 'GitHub', color: '#24292e' },
  wechat: { name: '微信', color: '#07C160' },
  qq: { name: 'QQ', color: '#12B7F5' },
  weibo: { name: '微博', color: '#E6162D' },
};

/** 默认 SMTP 配置（未启用） */
export const DEFAULT_SMTP: SmtpConfig = {
  enabled: false,
  host: '',
  port: 465,
  secure: true,
  user: '',
  pass: '',
  fromName: '沐曦导航',
  fromEmail: '',
};

/** 默认系统设置（前端 fallback） */
export const DEFAULT_SETTINGS: SystemSettings = {
  siteName: '沐曦导航',
  siteDescription: '沐曦导航 - 简洁优雅的个人导航主页',
  siteIcon: '/logo.png',
  icp: '',
  allowRegister: true,
  registerMethod: 'email',
  defaultRole: 'USER',
  inviteCode: 'NAV2026',
  oauthProviders: [
    { id: 'google', name: 'Google', enabled: false, clientId: '', clientSecret: '' },
    { id: 'github', name: 'GitHub', enabled: false, clientId: '', clientSecret: '' },
    { id: 'wechat', name: '微信', enabled: false, clientId: '', clientSecret: '' },
    { id: 'qq', name: 'QQ', enabled: false, clientId: '', clientSecret: '' },
    { id: 'weibo', name: '微博', enabled: false, clientId: '', clientSecret: '' },
  ],
  allowCustomTheme: true,
  allowPublicNav: true,
  pageSize: 20,
  enableSearch: true,
  maxLoginAttempts: 5,
  lockMinutes: 30,
  sessionHours: 24,
  force2FA: false,
  maintenanceMode: false,
  maintenanceNotice: '',
  smtp: { ...DEFAULT_SMTP },
};
