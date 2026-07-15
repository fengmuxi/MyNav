/**
 * 数据库版本化迁移系统
 * ------------------------------------------------------------------
 * 设计目标：
 * 1. 维护数据库 schema 版本号，便于追踪和管理数据库结构变更
 * 2. 项目启动时自动检查并执行未应用的迁移，确保旧版本数据库兼容升级
 * 3. 每个迁移都是原子事务，失败则整体回滚，不会留下半完成状态
 * 4. 新库通过 CREATE TABLE IF NOT EXISTS 直接创建最新结构，迁移做幂等校验
 *
 * 工作原理：
 * - schema_migrations 表记录已应用的迁移版本
 * - 启动时读取当前版本，依次执行所有未应用的迁移
 * - 对全新数据库：CREATE TABLE 已创建最新结构 → 迁移检查列存在跳过 → 记录版本
 * - 对旧版数据库：CREATE TABLE 跳过 → 迁移补充缺失列/表 → 记录版本
 * - 对已迁移数据库：读取版本号 → 无待执行迁移 → 直接就绪
 *
 * 如何添加新迁移：
 * 1. 在 migrations 数组末尾追加新迁移对象，version 递增
 * 2. up 函数中编写 DDL，使用 hasColumn 等辅助函数保证幂等
 * 3. 迁移必须可重复执行（幂等），以防异常中断后重试
 * 4. 同步更新 schema.ts 中的 Drizzle 定义和 index.ts 中的 CREATE TABLE
 */
import type Database from 'better-sqlite3';

/** 迁移接口定义 */
interface Migration {
  /** 版本号，从 1 开始递增 */
  version: number;
  /** 迁移描述，用于日志和 schema_migrations 记录 */
  description: string;
  /** 迁移执行函数，接收原生 better-sqlite3 实例 */
  up: (sqlite: Database.Database) => void;
}

// ─── 辅助函数 ──────────────────────────────────────────────────

/** 检查指定表中是否存在某列 */
function hasColumn(sqlite: Database.Database, table: string, column: string): boolean {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

/** 获取指定表的全部列信息 */
function getColumns(sqlite: Database.Database, table: string): { name: string; notnull: number }[] {
  return sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string; notnull: number }[];
}

/** 检查表是否存在 */
function hasTable(sqlite: Database.Database, table: string): boolean {
  const row = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
  return !!row;
}

// ─── 迁移定义 ──────────────────────────────────────────────────

/**
 * v1: 基线版本
 * 整合所有历史增量迁移，将旧版数据库升级到当前 schema 状态。
 * 对新库（CREATE TABLE 已包含全部列）完全幂等，不执行任何操作。
 * 对旧库则逐列检查并补充缺失字段。
 */
const v1: Migration = {
  version: 1,
  description: '基线版本：整合历史增量迁移（users 字段补全、nav_items 结构调整）',
  up: (sqlite) => {
    // ── users 表：补充历史新增列 ──
    // 这些列在新库的 CREATE TABLE 中已定义，此处仅对旧库补充
    const userCols = [
      ['theme', "ALTER TABLE users ADD COLUMN theme TEXT"],
      ['display_name', "ALTER TABLE users ADD COLUMN display_name TEXT"],
      ['email', "ALTER TABLE users ADD COLUMN email TEXT"],
      ['bio', "ALTER TABLE users ADD COLUMN bio TEXT"],
      ['avatar', "ALTER TABLE users ADD COLUMN avatar TEXT"],
      ['status', "ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"],
      ['failed_login_attempts', "ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0"],
      ['locked_until', "ALTER TABLE users ADD COLUMN locked_until INTEGER NOT NULL DEFAULT 0"],
      ['srp_salt', "ALTER TABLE users ADD COLUMN srp_salt TEXT"],
      ['srp_verifier', "ALTER TABLE users ADD COLUMN srp_verifier TEXT"],
    ] as const;

    for (const [col, ddl] of userCols) {
      if (!hasColumn(sqlite, 'users', col)) {
        sqlite.exec(ddl);
        console.log(`[DB] v1: 已为 users 表补充 ${col} 列`);
      }
    }

    // ── nav_items 表：category_id 从 NOT NULL 改为可空 + 新增 group_id ──
    if (hasTable(sqlite, 'nav_items')) {
      const itemCols = getColumns(sqlite, 'nav_items');
      const catCol = itemCols.find((c) => c.name === 'category_id');

      // 如果 category_id 仍为 NOT NULL，说明是早期版本，需要重建表
      if (catCol && catCol.notnull === 1) {
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
        console.log('[DB] v1: 已将 nav_items.category_id 改为可空并新增 group_id 列');
      } else {
        // 表已重建过或新库，但仍可能缺少 group_id 列
        if (!hasColumn(sqlite, 'nav_items', 'group_id')) {
          sqlite.exec("ALTER TABLE nav_items ADD COLUMN group_id INTEGER REFERENCES nav_groups(id) ON DELETE CASCADE");
          // 回填已有卡片的 group_id
          sqlite.exec(`
            UPDATE nav_items SET group_id = (
              SELECT c.group_id FROM nav_categories c WHERE c.id = nav_items.category_id
            )
          `);
          console.log('[DB] v1: 已为 nav_items 表补充 group_id 列');
        }
      }

      // ── nav_items 的备注字段迁移 ──
      // 旧版本字段名为 description，需重命名为 note（保留数据）
      const hasNote = hasColumn(sqlite, 'nav_items', 'note');
      const hasOldDescription = hasColumn(sqlite, 'nav_items', 'description');
      if (!hasNote && hasOldDescription) {
        sqlite.exec("ALTER TABLE nav_items RENAME COLUMN description TO note");
        console.log('[DB] v1: 已将 nav_items.description 列重命名为 note');
      } else if (!hasNote) {
        sqlite.exec("ALTER TABLE nav_items ADD COLUMN note TEXT");
        console.log('[DB] v1: 已为 nav_items 表补充 note 列');
      }
    }
  },
};

/**
 * 迁移注册表
 * 按版本号顺序排列，新增迁移时在末尾追加
 */
export const migrations: Migration[] = [v1];

/** 当前数据库 schema 的最新版本号 */
export const LATEST_DB_VERSION = migrations.length > 0
  ? migrations[migrations.length - 1].version
  : 0;

// ─── 迁移执行引擎 ──────────────────────────────────────────────

/**
 * 执行数据库迁移
 * 在项目启动时调用一次，自动检测并应用未执行的迁移。
 *
 * 流程：
 * 1. 创建 schema_migrations 表（如不存在）
 * 2. 读取当前已应用的最高版本号
 * 3. 依次执行所有 version > 当前版本 的迁移
 * 4. 每个迁移在独立事务中执行，失败则回滚并抛出错误
 * 5. 迁移成功后记录版本号到 schema_migrations
 *
 * @param sqlite - 原生 better-sqlite3 数据库实例
 */
export function runMigrations(sqlite: Database.Database): void {
  // 创建迁移记录表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at  INTEGER NOT NULL
    );
  `);

  // 读取当前版本
  const row = sqlite.prepare('SELECT MAX(version) as v FROM schema_migrations').get() as
    | { v: number | null }
    | undefined;
  const currentVersion = row?.v ?? 0;

  if (currentVersion >= LATEST_DB_VERSION) {
    console.log(`[DB] 数据库 schema 版本已是最新：v${currentVersion}`);
    return;
  }

  // 筛选待执行的迁移
  const pending = migrations.filter((m) => m.version > currentVersion);
  console.log(
    `[DB] 检测到 ${pending.length} 个待执行迁移（当前 v${currentVersion} → 目标 v${LATEST_DB_VERSION}）`,
  );

  for (const migration of pending) {
    const startMsg = `[DB] 正在执行迁移 v${migration.version}: ${migration.description}`;
    console.log(startMsg);

    // 每个迁移在独立事务中执行，保证原子性
    const migrate = sqlite.transaction(() => {
      migration.up(sqlite);
      sqlite.prepare(
        'INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)',
      ).run(migration.version, migration.description, Date.now());
    });
    migrate();

    console.log(`[DB] 迁移 v${migration.version} 完成`);
  }

  console.log(`[DB] 所有迁移执行完毕，数据库 schema 版本：v${LATEST_DB_VERSION}`);
}
