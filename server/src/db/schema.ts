/**
 * 数据库 Schema 定义 (Drizzle ORM)
 * ------------------------------------------------------------------
 * 使用 drizzle-orm/sqlite-core 定义所有表结构。
 * SQLite 无原生 boolean 类型，统一用 integer (0/1) 表示布尔值。
 * 主键统一为自增 integer id。
 */
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

/**
 * users 用户表
 * - role: 角色枚举，'USER' 普通用户 / 'ADMIN' 管理员，默认 'USER'
 * - passwordHash: bcrypt 哈希后的密码（不存储明文），用于 RSA(HTTPS) 登录
 * - srpSalt: SRP-6a 盐（hex），用于 HTTP 环境下的安全登录（可空，老用户首次 HTTPS 登录后自动生成）
 * - srpVerifier: SRP-6a 验证器 v=g^x mod N（hex），与 srpSalt 配对（可空）
 *               verifier 非密码等价物，攻击者获取它无法直接登录
 * - theme: 用户自定义主题方案，存为 JSON 字符串（可空，空则用前端默认预设）
 *           结构：{ background, surfaceColor, accentColor, textColor, cardRadius, cardShadow, presetId }
 * - displayName: 昵称（可空），用于界面显示更友好的名称
 * - email: 邮箱（可空）
 * - bio: 个人简介（可空）
 * - avatar: 头像访问 URL（可空，形如 /uploads/avatars/1_xxx.png）
 * - status: 账号状态，'active' 启用 / 'disabled' 禁用，默认 'active'
 *           禁用后无法登录、token 失效
 */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  // SRP-6a 字段（HTTP 环境安全登录）：老用户为 NULL，HTTPS 首次登录后自动填充
  srpSalt: text('srp_salt'),
  srpVerifier: text('srp_verifier'),
  role: text('role').notNull().default('USER'),
  theme: text('theme'),
  displayName: text('display_name'),
  email: text('email'),
  bio: text('bio'),
  avatar: text('avatar'),
  status: text('status').notNull().default('active'),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: integer('locked_until').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * navGroups 导航分组表
 * - isPublic: 0=私有, 1=公共 (integer 表示布尔)
 * - ownerId: 所属用户，公共分组可为 NULL
 */
export const navGroups = sqliteTable('nav_groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  isPublic: integer('is_public').notNull().default(0),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'set null' }),
});

/**
 * navCategories 导航分类表
 * - 归属于某个分组 (groupId 外键)
 */
export const navCategories = sqliteTable('nav_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  groupId: integer('group_id')
    .notNull()
    .references(() => navGroups.id, { onDelete: 'cascade' }),
  orderIndex: integer('order_index').notNull().default(0),
});

/**
 * navItems 导航卡片表
 * - shape: 'rounded' | 'square' (圆角/直角)
 * - size: 'sm' | 'md' | 'lg' (决定前端 col-span)
 * - color: 任意 CSS 颜色字符串 (如 #3b82f6)
 * - note: 卡片备注（可空），用于记录网站的账号、密码提示、备注等信息
 */
export const navItems = sqliteTable('nav_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  url: text('url').notNull(),
  icon: text('icon'),
  categoryId: integer('category_id')
    .references(() => navCategories.id, { onDelete: 'cascade' }),
  groupId: integer('group_id')
    .references(() => navGroups.id, { onDelete: 'cascade' }),
  orderIndex: integer('order_index').notNull().default(0),
  color: text('color').default('#1f2937'),
  shape: text('shape', { enum: ['rounded', 'square'] }).notNull().default('rounded'),
  size: text('size', { enum: ['sm', 'md', 'lg'] }).notNull().default('sm'),
  note: text('note'),
});

/**
 * settings 系统设置表
 * - key: 设置项唯一键（如 'system'），PRIMARY KEY
 * - value: JSON 字符串，存储该设置项的完整对象
 *
 * 设计说明：采用 key-value 结构而非多列，便于扩展，避免后续增字段时反复 ALTER TABLE。
 * 当前仅使用 'system' 一个键存储 SystemSettings 对象。
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/**
 * password_resets 密码重置令牌表
 * - userId: 关联用户，外键 ON DELETE CASCADE（用户删除则令牌失效）
 * - token: 重置令牌（crypto.randomBytes 生成的 hex 字符串，唯一索引）
 * - expiresAt: 过期时间戳（毫秒），过期后令牌不可用
 * - used: 是否已使用，0=未使用 / 1=已使用（一次性令牌）
 * - createdAt: 创建时间戳
 *
 * 设计：一次性令牌，使用后立即标记 used=1；查询时同时校验未过期且未使用。
 */
export const passwordResets = sqliteTable('password_resets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at').notNull(),
  used: integer('used').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * navItemClicks 导航卡片点击记录表
 * - itemId: 关联 navItems，外键 ON DELETE CASCADE（卡片删除则记录级联清除）
 * - userId: 关联 users，可空（null 表示匿名访客点击）
 * - clickCount: 该用户对该卡片的累计点击次数（同一 userId + itemId 唯一）
 * - lastClickedAt: 最近一次点击时间
 *
 * 用途：根据点击频率组织"常用导航" Top N 展示
 * - 已登录用户：按 userId 过滤，返回该用户最常用的卡片
 * - 匿名访客：聚合所有记录（含匿名 + 已登录），返回全局最热门卡片
 */
export const navItemClicks = sqliteTable('nav_item_clicks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id')
    .notNull()
    .references(() => navItems.id, { onDelete: 'cascade' }),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' }),
  clickCount: integer('click_count').notNull().default(1),
  lastClickedAt: integer('last_clicked_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

// 导出类型，供路由层类型安全使用
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type NavGroup = typeof navGroups.$inferSelect;
export type NavCategory = typeof navCategories.$inferSelect;
export type NavItem = typeof navItems.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type PasswordReset = typeof passwordResets.$inferSelect;
export type NavItemClick = typeof navItemClicks.$inferSelect;
