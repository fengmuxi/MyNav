// Drizzle Kit 配置文件
// 用于生成/迁移 SQLite 数据库 schema
// 详见：https://orm.drizzle.team/docs-kit/overview
import type { Config } from 'drizzle-kit';

const config: Config = {
  // 使用 SQLite 方言（better-sqlite3）
  dialect: 'sqlite',
  // schema 定义文件路径
  schema: './src/db/schema.ts',
  // 生成的迁移文件输出目录
  out: './drizzle',
  // SQLite 数据文件路径（与运行时保持一致，位于 server/ 目录下）
  dbCredentials: {
    url: './database.db',
  },
  // 打印 SQL 语句，便于调试
  verbose: true,
  // 交互式确认，避免误操作
  strict: true,
};

export default config;
