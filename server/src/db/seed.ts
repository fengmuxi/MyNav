/**
 * 种子数据初始化
 * ------------------------------------------------------------------
 * 首次启动时执行：
 * 1. 创建默认管理员账户 admin / 123456（请及时修改！）
 * 2. 创建「搜索引擎」「开发工具」两个公共分组及示例链接
 * 全部操作使用事务，保证幂等（已存在则跳过）。
 */
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export function seedDatabase(db: BetterSQLite3Database<typeof schema>): void {
  // 使用事务保证种子数据的原子性
  sqliteTransaction(db, () => {
    seedAdmin(db);
    seedPublicNav(db);
  });
}

/**
 * 简单的事务封装：better-sqlite3 是同步的，drizzle 暴露 .transaction
 * 这里直接用 db 的底层事务能力
 */
function sqliteTransaction(
  db: BetterSQLite3Database<typeof schema>,
  fn: () => void,
): void {
  // drizzle-orm 的 transaction 对于 better-sqlite3 是同步执行的
  db.transaction(fn);
}

/**
 * 种子管理员账户
 * - 若 admin 已存在则跳过
 * - 密码使用 bcrypt 哈希（saltRounds=10）
 */
function seedAdmin(db: BetterSQLite3Database<typeof schema>): void {
  const existing = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, 'admin'))
    .get();

  if (existing) return;

  const passwordHash = bcrypt.hashSync('123456', 10);
  db.insert(schema.users)
    .values({
      username: 'admin',
      passwordHash,
      role: 'ADMIN',
    })
    .run();

  console.log('[Seed] 已创建管理员账户：admin / 123456（请尽快修改密码）');
}

/**
 * 种子公共导航数据
 * 结构：分组 -> 分类 -> 卡片
 */
function seedPublicNav(db: BetterSQLite3Database<typeof schema>): void {
  // 已有公共分组则认为已 seed 过，跳过
  const hasPublic = db
    .select()
    .from(schema.navGroups)
    .where(eq(schema.navGroups.isPublic, 1))
    .get();
  if (hasPublic) return;

  // ---- 分组 1：搜索引擎 ----
  const searchGroup = db
    .insert(schema.navGroups)
    .values({ name: '搜索引擎', orderIndex: 0, isPublic: 1, ownerId: null })
    .returning()
    .get();

  const searchCat = db
    .insert(schema.navCategories)
    .values({ name: '常用搜索', groupId: searchGroup.id, orderIndex: 0 })
    .returning()
    .get();

  db.insert(schema.navItems)
    .values([
      { title: 'Google', url: 'https://www.google.com', icon: '🔍', categoryId: searchCat.id, orderIndex: 0, color: '#4285F4', shape: 'rounded', size: 'sm' },
      { title: 'Bing', url: 'https://www.bing.com', icon: '🅱️', categoryId: searchCat.id, orderIndex: 1, color: '#008373', shape: 'rounded', size: 'sm' },
      { title: '百度', url: 'https://www.baidu.com', icon: '🐻', categoryId: searchCat.id, orderIndex: 2, color: '#2932E1', shape: 'rounded', size: 'sm' },
    ])
    .run();

  // ---- 分组 2：开发工具 ----
  const devGroup = db
    .insert(schema.navGroups)
    .values({ name: '开发工具', orderIndex: 1, isPublic: 1, ownerId: null })
    .returning()
    .get();

  const devCat = db
    .insert(schema.navCategories)
    .values({ name: '代码托管', groupId: devGroup.id, orderIndex: 0 })
    .returning()
    .get();

  db.insert(schema.navItems)
    .values([
      { title: 'GitHub', url: 'https://github.com', icon: '🐙', categoryId: devCat.id, orderIndex: 0, color: '#24292e', shape: 'rounded', size: 'md' },
      { title: 'GitLab', url: 'https://gitlab.com', icon: '🦊', categoryId: devCat.id, orderIndex: 1, color: '#FC6D26', shape: 'rounded', size: 'sm' },
      { title: 'Gitee', url: 'https://gitee.com', icon: 'G', categoryId: devCat.id, orderIndex: 2, color: '#C71D23', shape: 'square', size: 'sm' },
      { title: 'Stack Overflow', url: 'https://stackoverflow.com', icon: '📚', categoryId: devCat.id, orderIndex: 3, color: '#F48024', shape: 'rounded', size: 'md' },
    ])
    .run();

  console.log('[Seed] 已创建公共导航种子数据');
}
