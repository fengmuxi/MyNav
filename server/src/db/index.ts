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
 * 自动建表
 * - 使用 CREATE TABLE IF NOT EXISTS，幂等且安全
 * - 字段定义与 schema.ts 保持一致
 * - 这样无需依赖 drizzle-kit 迁移文件即可首次启动自动建表
 */
export function initSchema(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'USER',
      theme         TEXT,
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

  // 增量迁移：对已存在的旧 users 表补充缺失列
  // PRAGMA table_info 返回列信息；逐列检查，缺失则 ALTER TABLE 添加
  const userCols = sqlite.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (userCols.length > 0) {
    const has = (name: string) => userCols.some((c) => c.name === name);
    if (!has('theme')) {
      sqlite.exec("ALTER TABLE users ADD COLUMN theme TEXT");
      console.log('[DB] 已为 users 表补充 theme 列');
    }
    if (!has('display_name')) {
      sqlite.exec("ALTER TABLE users ADD COLUMN display_name TEXT");
      console.log('[DB] 已为 users 表补充 display_name 列');
    }
    if (!has('email')) {
      sqlite.exec("ALTER TABLE users ADD COLUMN email TEXT");
      console.log('[DB] 已为 users 表补充 email 列');
    }
    if (!has('bio')) {
      sqlite.exec("ALTER TABLE users ADD COLUMN bio TEXT");
      console.log('[DB] 已为 users 表补充 bio 列');
    }
    if (!has('avatar')) {
      sqlite.exec("ALTER TABLE users ADD COLUMN avatar TEXT");
      console.log('[DB] 已为 users 表补充 avatar 列');
    }
    if (!has('status')) {
      // 已存在的旧用户默认置为 active
      sqlite.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
      console.log('[DB] 已为 users 表补充 status 列');
    }
    if (!has('failed_login_attempts')) {
      sqlite.exec("ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0");
      console.log('[DB] 已为 users 表补充 failed_login_attempts 列');
    }
    if (!has('locked_until')) {
      sqlite.exec("ALTER TABLE users ADD COLUMN locked_until INTEGER NOT NULL DEFAULT 0");
      console.log('[DB] 已为 users 表补充 locked_until 列');
    }
  }

  // 增量迁移：nav_items.category_id 从 NOT NULL 改为可空，并新增 group_id 列
  const itemCols = sqlite.prepare("PRAGMA table_info(nav_items)").all() as { name: string; notnull: number }[];
  if (itemCols.length > 0) {
    const catCol = itemCols.find((c) => c.name === 'category_id');
    if (catCol && catCol.notnull === 1) {
      // 重建 nav_items 表，去掉 category_id 的 NOT NULL 约束，新增 group_id 列
      sqlite.exec(`
        CREATE TABLE nav_items_new (
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
        INSERT INTO nav_items_new (id, title, url, icon, category_id, group_id, order_index, color, shape, size)
        SELECT i.id, i.title, i.url, i.icon, i.category_id, c.group_id, i.order_index, i.color, i.shape, i.size
        FROM nav_items i
        LEFT JOIN nav_categories c ON i.category_id = c.id;
        DROP TABLE nav_items;
        ALTER TABLE nav_items_new RENAME TO nav_items;
      `);
      console.log('[DB] 已将 nav_items.category_id 改为可空并新增 group_id 列');
    } else {
      // 表已重建过或新库，但仍可能缺少 group_id 列（如果跳过了上面的重建）
      const hasGroupId = itemCols.some((c) => c.name === 'group_id');
      if (!hasGroupId) {
        sqlite.exec("ALTER TABLE nav_items ADD COLUMN group_id INTEGER REFERENCES nav_groups(id) ON DELETE CASCADE");
        // 回填已有卡片的 group_id
        sqlite.exec(`
          UPDATE nav_items SET group_id = (
            SELECT c.group_id FROM nav_categories c WHERE c.id = nav_items.category_id
          )
        `);
        console.log('[DB] 已为 nav_items 表补充 group_id 列');
      }
    }

    // 增量迁移：nav_items 的备注字段
    // - 旧版本字段名为 description，需重命名为 note（保留数据）
    // - 新库或已迁移过的库直接检查 note 列是否存在
    const hasNote = itemCols.some((c) => c.name === 'note');
    const hasOldDescription = itemCols.some((c) => c.name === 'description');
    if (!hasNote && hasOldDescription) {
      // 旧库已有 description 列，重命名为 note（SQLite 3.25+ 支持）
      sqlite.exec("ALTER TABLE nav_items RENAME COLUMN description TO note");
      console.log('[DB] 已将 nav_items.description 列重命名为 note');
    } else if (!hasNote) {
      // 新库或未添加过备注列的旧库，直接新增 note 列
      sqlite.exec("ALTER TABLE nav_items ADD COLUMN note TEXT");
      console.log('[DB] 已为 nav_items 表补充 note 列');
    }
  }
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
