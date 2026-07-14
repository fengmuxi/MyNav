/**
 * 系统设置：共享类型与默认值
 * ------------------------------------------------------------------
 * 后端 settings 路由、auth 路由以及前端 SystemSettings/Register 共用此结构。
 * 前端通过 /api/settings/public 拿到的是脱敏后的 PublicSystemSettings。
 *
 * 设计原则：
 * - 字段尽量扁平，便于直接渲染表单
 * - 第三方注册配置放 oauthProviders 数组，每个 provider 含 id/name/enabled/clientId/clientSecret
 *   clientSecret 仅管理员可见，公开接口不返回
 */
import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { settings as settingsTable } from './db/schema.js';

export type RegisterMethod = 'email' | 'invite' | 'closed';

/** 支持的第三方注册提供方 */
export type OAuthProviderId = 'google' | 'github' | 'wechat' | 'qq' | 'weibo';

export interface OAuthProvider {
  id: OAuthProviderId;
  name: string;
  /** 是否在注册/登录页显示入口 */
  enabled: boolean;
  /** OAuth App Client ID（前端展示用） */
  clientId: string;
  /** OAuth App Client Secret（仅后端持有，不返回给前端公开接口） */
  clientSecret: string;
}

export interface SystemSettings {
  // 基本设置
  siteName: string;
  siteDescription: string;
  siteIcon: string;
  icp: string;
  // 注册设置
  allowRegister: boolean;
  registerMethod: RegisterMethod;
  defaultRole: 'USER' | 'ADMIN';
  inviteCode: string;
  // 第三方注册配置
  oauthProviders: OAuthProvider[];
  // 功能设置
  allowCustomTheme: boolean;
  allowPublicNav: boolean;
  pageSize: number;
  enableSearch: boolean;
  // 安全设置
  maxLoginAttempts: number;
  lockMinutes: number;
  sessionHours: number;
  force2FA: boolean;
  // 维护设置
  maintenanceMode: boolean;
  maintenanceNotice: string;
  // 邮件 SMTP 配置（用于忘记密码等邮件通知）
  smtp: SmtpConfig;
}

/**
 * SMTP 邮件服务器配置
 * - enabled: 是否启用邮件发送；未启用时忘记密码接口会返回开发模式提示
 * - host/port/secure: SMTP 服务器地址与端口（secure=true 使用 465/SSL，false 使用 587/STARTTLS）
 * - user/pass: SMTP 登录凭据（pass 仅后端持有，公开接口不返回）
 * - fromName/fromEmail: 发件人显示名与邮箱
 */
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

/** 第三方注册提供方的展示元数据（前端图标/名称） */
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

/** 默认开启的第三方注册提供方模板（默认全部禁用，需管理员手动启用） */
export function defaultOAuthProviders(): OAuthProvider[] {
  return [
    { id: 'google', name: 'Google', enabled: false, clientId: '', clientSecret: '' },
    { id: 'github', name: 'GitHub', enabled: false, clientId: '', clientSecret: '' },
    { id: 'wechat', name: '微信', enabled: false, clientId: '', clientSecret: '' },
    { id: 'qq', name: 'QQ', enabled: false, clientId: '', clientSecret: '' },
    { id: 'weibo', name: '微博', enabled: false, clientId: '', clientSecret: '' },
  ];
}

/** 默认 SMTP 配置（未启用，需管理员手动配置） */
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

/** 默认系统设置 */
export const DEFAULT_SETTINGS: SystemSettings = {
  siteName: '沐曦导航',
  siteDescription: '沐曦导航 - 简洁优雅的个人导航主页',
  siteIcon: '/logo.png',
  icp: '',
  allowRegister: true,
  registerMethod: 'email',
  defaultRole: 'USER',
  inviteCode: 'NAV2026',
  oauthProviders: defaultOAuthProviders(),
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

/**
 * 公开可见的系统设置（脱敏后）
 * - 不包含 oauthProviders[].clientSecret
 * - 仅包含已 enabled 的 oauthProviders，未配置的注册方式不返回 → 前端不显示
 * - 不包含邀请码（如果业务需要可在 invite 注册时单独校验）
 * - 不包含敏感的安全参数细节
 */
export interface PublicSystemSettings {
  siteName: string;
  siteDescription: string;
  siteIcon: string;
  icp: string;
  allowRegister: boolean;
  registerMethod: RegisterMethod;
  /** 已启用的第三方注册提供方（仅 id 与 name） */
  oauthProviders: { id: OAuthProviderId; name: string }[];
  allowCustomTheme: boolean;
  enableSearch: boolean;
  maintenanceMode: boolean;
  maintenanceNotice: string;
}

/** 将完整设置脱敏为公开设置 */
export function toPublicSettings(s: SystemSettings): PublicSystemSettings {
  return {
    siteName: s.siteName,
    siteDescription: s.siteDescription,
    siteIcon: s.siteIcon,
    icp: s.icp,
    allowRegister: s.allowRegister,
    registerMethod: s.registerMethod,
    oauthProviders: s.oauthProviders
      .filter((p) => p.enabled)
      .map((p) => ({ id: p.id, name: p.name })),
    allowCustomTheme: s.allowCustomTheme,
    enableSearch: s.enableSearch,
    maintenanceMode: s.maintenanceMode,
    maintenanceNotice: s.maintenanceNotice,
  };
}

const SETTINGS_KEY = 'system';

/** 从数据库读取设置；无记录时返回默认值 */
export function readSettings(): SystemSettings {
  const row = db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, SETTINGS_KEY))
    .get();
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    return mergeSettings(JSON.parse(row.value));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** 写入设置（upsert：存在则更新，不存在则插入） */
export function writeSettings(s: SystemSettings): void {
  const json = JSON.stringify(s);
  const existing = db
    .select({ key: settingsTable.key })
    .from(settingsTable)
    .where(eq(settingsTable.key, SETTINGS_KEY))
    .get();
  if (existing) {
    db.update(settingsTable)
      .set({ value: json })
      .where(eq(settingsTable.key, SETTINGS_KEY))
      .run();
  } else {
    db.insert(settingsTable)
      .values({ key: SETTINGS_KEY, value: json })
      .run();
  }
}

/** 安全合并：用传入对象覆盖默认设置，缺失字段补默认值；oauthProviders 与 smtp 做深度合并 */
export function mergeSettings(input: unknown): SystemSettings {
  if (!input || typeof input !== 'object') return { ...DEFAULT_SETTINGS };
  const obj = input as Partial<SystemSettings>;
  const merged: SystemSettings = {
    ...DEFAULT_SETTINGS,
    ...(obj as SystemSettings),
  };

  // oauthProviders 合并：以默认模板为基线，按 id 对齐，缺失补默认
  const defaults = defaultOAuthProviders();
  const incoming = Array.isArray(obj.oauthProviders) ? obj.oauthProviders : [];
  merged.oauthProviders = defaults.map((d) => {
    const hit = incoming.find((p) => p && (p as OAuthProvider).id === d.id);
    return hit ? { ...d, ...(hit as OAuthProvider) } : d;
  });

  // smtp 合并：与默认值合并，确保字段完整
  const incomingSmtp = (obj.smtp && typeof obj.smtp === 'object' ? obj.smtp : {}) as Partial<SmtpConfig>;
  merged.smtp = { ...DEFAULT_SMTP, ...incomingSmtp };

  return merged;
}
