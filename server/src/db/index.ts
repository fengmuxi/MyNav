/**
 * SQLite 数据库连接与初始化
 * ------------------------------------------------------------------
 * 关键说明（SQLite 连接部分）：
 * 1. 使用 better-sqlite3 创建同步连接（better-sqlite3 是同步 API，性能优秀且无需 Promise 包装）。
 * 2. 数据库文件路径默认解析到 server/ 目录下的 database.db。
 * 3. 首次启动若文件不存在，better-sqlite3 会自动创建空文件；
 *    随后通过 initSchema() 用 CREATE TABLE IF NOT EXISTS 自动建表。
 * 4. 启用 WAL 模式以提升并发读性能。
 * 5. 通过 drizzle() 包装得到类型安全的查询对象 db。
 */
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';
import { seedDatabase } from './seed.js';
import { runMigrations } from './migrations.js';

// 解析当前模块路径，定位到服务器根目录（server/）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// server/src/db -> server/src -> server
const SERVER_ROOT = path.resolve(__dirname, '..', '..');

// 数据库文件路径（优先使用环境变量，支持绝对路径）
// 默认放在 server/ 目录下；Docker 环境下通过环境变量指向 /app/data/database.db
const DB_PATH = process.env.DATABASE_PATH
  ? (process.env.DATABASE_PATH.startsWith('/') 
      ? process.env.DATABASE_PATH 
      : path.resolve(SERVER_ROOT, process.env.DATABASE_PATH))
  : path.join(SERVER_ROOT, 'database.db');

/**
 * 创建 better-sqlite3 数据库连接实例
 * - Database 构造函数若发现文件不存在会自动创建
 * - { fileMustExist: false } 显式声明：文件不存在时创建而非报错
 */
const sqlite = new Database(DB_PATH, { fileMustExist: false });

// 启用 WAL 模式：写入性能更好，读不阻塞写
sqlite.pragma('journal_mode = WAL');
// 外键约束开启（SQLite 默认关闭，需手动开启以让 ON DELETE 生效）
sqlite.pragma('foreign_keys = ON');

/**
 * 用 drizzle-orm 包装原生连接，获得类型安全的链式查询 API
 * - 第二个参数传入 schema，使 db.query.<table> 具备关系查询能力
 */
export const db: BetterSQLite3Database<typeof schema> = drizzle(sqlite, { schema });

/**
 * 自动建表 + 版本化迁移
 * ------------------------------------------------------------------
 * 1. CREATE TABLE IF NOT EXISTS：新库直接创建最新结构（幂等，已存在的表跳过）
 * 2. runMigrations()：版本化迁移引擎，检测旧库缺失列/结构并自动补充
 *    - 维护 schema_migrations 表追踪数据库版本号
 *    - 每个迁移在事务中执行，保证原子性
 *    - 详见 migrations.ts
 */
export function initSchema(): void {
  // ── 1. 建表（新库直接创建最新结构，旧库跳过）──
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      srp_salt      TEXT,
      srp_verifier  TEXT,
      role          TEXT NOT NULL DEFAULT 'USER',
      theme         TEXT,
      display_name  TEXT,
      email         TEXT,
      bio           TEXT,
      avatar        TEXT,
      status        TEXT NOT NULL DEFAULT 'active',
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until  INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nav_groups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      is_public   INTEGER NOT NULL DEFAULT 0,
      owner_id    INTEGER REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS nav_categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      group_id    INTEGER NOT NULL REFERENCES nav_groups(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS nav_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      url         TEXT NOT NULL,
      icon        TEXT,
      category_id INTEGER REFERENCES nav_categories(id) ON DELETE CASCADE,
      group_id    INTEGER REFERENCES nav_groups(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL DEFAULT 0,
      color       TEXT DEFAULT '#1f2937',
      shape       TEXT NOT NULL DEFAULT 'rounded',
      size        TEXT NOT NULL DEFAULT 'sm',
      note        TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token       TEXT NOT NULL UNIQUE,
      expires_at  INTEGER NOT NULL,
      used        INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nav_item_clicks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id         INTEGER NOT NULL REFERENCES nav_items(id) ON DELETE CASCADE,
      user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
      click_count     INTEGER NOT NULL DEFAULT 1,
      last_clicked_at INTEGER NOT NULL
    );

    -- 唯一索引：(user_id, item_id) 唯一，便于 upsert 累加点击次数
    -- 注意 SQLite 中 NULL 视为不相等，匿名用户多次点击同一 item 会产生多行；
    -- 通过应用层 upsert（先 SELECT 再 INSERT/UPDATE）规避此限制。
    CREATE UNIQUE INDEX IF NOT EXISTS idx_nav_clicks_user_item ON nav_item_clicks(user_id, item_id);
  `);

  // ── 2. 版本化迁移：检测并补充旧库缺失的列/结构 ──
  runMigrations(sqlite);
}

/**
 * 初始化数据库：建表 + 种子数据
 * 在服务器启动时调用一次
 */
export function initDatabase(): void {
  initSchema();
  seedDatabase(db);
  console.log(`[DB] SQLite 已就绪：${DB_PATH}`);
}

// 导出原生连接（少数需要原生 API 的场景使用）
export { sqlite };
