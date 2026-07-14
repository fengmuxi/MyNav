/**
 * 共享类型定义
 * 与后端 schema 保持一致
 */
export type Role = 'USER' | 'ADMIN';
export type UserStatus = 'active' | 'disabled';

export interface User {
  id: number;
  username: string;
  role: Role;
  displayName?: string | null;
  email?: string | null;
  bio?: string | null;
  avatar?: string | null;
  status?: UserStatus;
}

/** 管理员视角的用户对象（含创建时间） */
export interface AdminUser extends User {
  createdAt?: string | Date;
}

export interface NavItem {
  id: number;
  title: string;
  url: string;
  icon: string | null;
  categoryId: number | null;
  groupId: number | null;
  orderIndex: number;
  color: string | null;
  shape: 'rounded' | 'square';
  size: 'sm' | 'md' | 'lg';
  /** 卡片备注（可空），用于记录网站的账号、密码提示、备注等信息 */
  note: string | null;
}

export interface NavCategory {
  id: number;
  name: string;
  groupId: number;
  orderIndex: number;
  items: NavItem[];
}

export interface NavGroup {
  id: number;
  name: string;
  orderIndex: number;
  isPublic: number; // 0/1
  ownerId: number | null;
  categories: NavCategory[];
}

// ===== 主题系统（对齐设计稿 token 命名） =====

/** 卡片圆角档位 */
export type CardRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';
/** 阴影模式 */
export type CardShadow = 'none' | 'sm' | 'md' | 'lg' | 'glow';

/**
 * 主题方案（对齐设计稿 Clean & Minimal 系统）
 * - primary: 主品牌色 → --color-primary
 * - background: 页面背景 → --bg-page
 * - surfaceColor: 表面/卡片背景 → --bg-surface
 * - accentColor: 兼容字段（旧版主色，现等同 primary）
 * - textColor: 主文字色 → --text-primary
 * - cardRadius / cardShadow: 卡片外观
 * - presetId: 当前所用预设 id；自定义时为 'custom'
 *
 * secondary/tertiary/border 等派生色由 themeStore 根据亮度自动计算
 */
export interface ThemePreset {
  id: string;
  name: string;
  background: string;
  surfaceColor: string;
  accentColor: string;
  textColor: string;
  cardRadius: CardRadius;
  cardShadow: CardShadow;
  presetId: string; // 等于 id 或 'custom'
}

/**
 * 内置主题预设
 * - clean（默认）：对齐设计稿的浅色 Clean & Minimal 风
 * - dark：对齐设计稿"暗夜黑"
 * - 其余为额外风格
 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'clean',
    name: '简约白',
    background: '#F8F9FC',
    surfaceColor: '#FFFFFF',
    accentColor: '#4F6EF7',
    textColor: '#161A26',
    cardRadius: 'lg',
    cardShadow: 'sm',
    presetId: 'clean',
  },
  {
    id: 'dark',
    name: '暗夜黑',
    background: '#1A1A2E',
    surfaceColor: '#252A3A',
    accentColor: '#3B82F6',
    textColor: '#F1F5F9',
    cardRadius: 'lg',
    cardShadow: 'md',
    presetId: 'dark',
  },
  {
    id: 'warm',
    name: '暖阳橙',
    background: '#FFF8F0',
    surfaceColor: '#FFFFFF',
    accentColor: '#F59E0B',
    textColor: '#1F2937',
    cardRadius: 'lg',
    cardShadow: 'sm',
    presetId: 'warm',
  },
  {
    id: 'forest',
    name: '森林绿',
    background: '#F0FDF4',
    surfaceColor: '#FFFFFF',
    accentColor: '#22C55E',
    textColor: '#161A26',
    cardRadius: 'md',
    cardShadow: 'sm',
    presetId: 'forest',
  },
  {
    id: 'aurora',
    name: '极光紫',
    background: '#0B1026',
    surfaceColor: 'rgba(168, 85, 247, 0.08)',
    accentColor: '#A855F7',
    textColor: '#EDE9FE',
    cardRadius: 'xl',
    cardShadow: 'glow',
    presetId: 'aurora',
  },
  {
    id: 'sunset',
    name: '日落橙',
    background: '#1A0F0A',
    surfaceColor: 'rgba(251, 146, 60, 0.08)',
    accentColor: '#F97316',
    textColor: '#FEF3C7',
    cardRadius: 'lg',
    cardShadow: 'md',
    presetId: 'sunset',
  },
];

/** 默认主题（未登录/未设置时使用）：浅色 Clean & Minimal */
export const DEFAULT_THEME: ThemePreset = THEME_PRESETS[0];
