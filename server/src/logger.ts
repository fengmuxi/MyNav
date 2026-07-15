/**
 * 系统日志核心模块
 * ------------------------------------------------------------------
 * 功能：
 * 1. 按天 + 按文件大小自动分割日志文件
 * 2. 自动清理超过保留天数的旧日志
 * 3. 提供 EventEmitter 实时推送日志（供 SSE 流式读取）
 * 4. 内存环形缓冲最近 500 条日志（供新连接客户端快速回看）
 *
 * 日志文件命名规则：
 * - 当天首个文件：app-YYYY-MM-DD.log
 * - 超过大小后轮转：app-YYYY-MM-DD-1.log, app-YYYY-MM-DD-2.log, ...
 *
 * 日志格式（单行 JSON）：
 * {"ts":"2026-07-15T10:30:00.000Z","level":"info","msg":"消息","meta":{...}}
 *
 * 配置存储：settings 表 key='log_config'，value=JSON
 */
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { settings as settingsTable } from './db/schema.js';

// 解析 server 根目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..');

// 日志目录（优先环境变量，默认 server/logs）
const LOGS_DIR = process.env.LOGS_PATH
  ? (process.env.LOGS_PATH.startsWith('/')
      ? process.env.LOGS_PATH
      : path.resolve(SERVER_ROOT, process.env.LOGS_PATH))
  : path.join(SERVER_ROOT, 'logs');

/** 日志级别 */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/** 日志条目 */
export interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  meta?: Record<string, unknown>;
}

/** 日志配置 */
export interface LogConfig {
  /** 单文件最大大小（字节），超过后自动轮转 */
  maxFileSize: number;
  /** 日志保留天数，超过自动清理 */
  retentionDays: number;
}

/** 默认日志配置：5MB 单文件，保留 30 天 */
export const DEFAULT_LOG_CONFIG: LogConfig = {
  maxFileSize: 5 * 1024 * 1024,
  retentionDays: 30,
};

const LOG_CONFIG_KEY = 'log_config';

/** 读取日志配置 */
export function readLogConfig(): LogConfig {
  try {
    const row = db
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, LOG_CONFIG_KEY))
      .get();
    if (!row) return { ...DEFAULT_LOG_CONFIG };
    const parsed = JSON.parse(row.value);
    return {
      maxFileSize: typeof parsed.maxFileSize === 'number' && parsed.maxFileSize > 0
        ? parsed.maxFileSize : DEFAULT_LOG_CONFIG.maxFileSize,
      retentionDays: typeof parsed.retentionDays === 'number' && parsed.retentionDays > 0
        ? parsed.retentionDays : DEFAULT_LOG_CONFIG.retentionDays,
    };
  } catch {
    return { ...DEFAULT_LOG_CONFIG };
  }
}

/** 写入日志配置 */
export function writeLogConfig(cfg: LogConfig): void {
  const json = JSON.stringify(cfg);
  const existing = db
    .select({ key: settingsTable.key })
    .from(settingsTable)
    .where(eq(settingsTable.key, LOG_CONFIG_KEY))
    .get();
  if (existing) {
    db.update(settingsTable)
      .set({ value: json })
      .where(eq(settingsTable.key, LOG_CONFIG_KEY))
      .run();
  } else {
    db.insert(settingsTable)
      .values({ key: LOG_CONFIG_KEY, value: json })
      .run();
  }
}

/** 当前日期字符串（YYYY-MM-DD，本地时区） */
function getDateString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 格式化日志行 */
function formatLine(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * 日志管理器（单例）
 */
class Logger extends EventEmitter {
  private ringBuffer: LogEntry[] = [];
  private readonly ringMax = 500;

  constructor() {
    super();
    this.setMaxListeners(50); // 允许多个 SSE 连接
  }

  /**
   * 写入一条日志
   */
  log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      msg,
      meta,
    };

    const line = formatLine(entry);

    // 同步写入文件（better-sqlite3 也是同步，保持一致）
    try {
      this.writeToFile(line);
    } catch (err) {
      // 写文件失败时仅输出到控制台，避免循环错误
      console.error('[Logger] 写入日志文件失败:', err);
    }

    // 同时输出到控制台（开发环境友好）
    const consoleMsg = `[${entry.ts}] [${level.toUpperCase()}] ${msg}`;
    if (meta) {
      console.log(consoleMsg, meta);
    } else {
      console.log(consoleMsg);
    }

    // 存入环形缓冲
    this.ringBuffer.push(entry);
    if (this.ringBuffer.length > this.ringMax) {
      this.ringBuffer.shift();
    }

    // 推送给 SSE 监听者
    this.emit('log', entry);
  }

  /** 便捷方法 */
  info(msg: string, meta?: Record<string, unknown>): void {
    this.log('info', msg, meta);
  }
  warn(msg: string, meta?: Record<string, unknown>): void {
    this.log('warn', msg, meta);
  }
  error(msg: string, meta?: Record<string, unknown>): void {
    this.log('error', msg, meta);
  }
  debug(msg: string, meta?: Record<string, unknown>): void {
    this.log('debug', msg, meta);
  }

  /** 获取环形缓冲中的最近日志 */
  getRecentLogs(): LogEntry[] {
    return [...this.ringBuffer];
  }

  /**
   * 写入文件：自动检查大小并轮转
   */
  private writeToFile(line: string): void {
    // 确保日志目录存在
    fs.mkdirSync(LOGS_DIR, { recursive: true });

    const dateStr = getDateString();
    const cfg = readLogConfig();

    // 查找当天当前可写入的文件（最后一个未超过大小的）
    const currentFile = this.findWritableFile(dateStr, cfg.maxFileSize);
    const lineWithNewline = line + '\n';

    fs.appendFileSync(currentFile, lineWithNewline, 'utf8');
  }

  /**
   * 查找当天可写入的文件
   * - 从 app-YYYY-MM-DD.log 开始，若超过大小则尝试 -1, -2, ...
   * - 返回第一个未超过 maxFileSize 的文件路径
   */
  private findWritableFile(dateStr: string, maxSize: number): string {
    const baseName = `app-${dateStr}.log`;
    const basePath = path.join(LOGS_DIR, baseName);

    // 检查基础文件
    if (!fs.existsSync(basePath)) {
      return basePath;
    }
    const stat = fs.statSync(basePath);
    if (stat.size < maxSize) {
      return basePath;
    }

    // 基础文件已满，查找递增编号的文件
    let index = 1;
    while (true) {
      const name = `app-${dateStr}-${index}.log`;
      const fp = path.join(LOGS_DIR, name);
      if (!fs.existsSync(fp)) {
        return fp;
      }
      const s = fs.statSync(fp);
      if (s.size < maxSize) {
        return fp;
      }
      index++;
      // 安全上限，避免异常情况死循环
      if (index > 999) return fp;
    }
  }

  /**
   * 清理过期日志文件
   * - 按文件名中的日期判断，删除超过 retentionDays 天的日志
   */
  cleanupOldLogs(): number {
    const cfg = readLogConfig();
    const cutoff = Date.now() - cfg.retentionDays * 24 * 60 * 60 * 1000;
    let deleted = 0;

    try {
      if (!fs.existsSync(LOGS_DIR)) return 0;
      const files = fs.readdirSync(LOGS_DIR);
      for (const file of files) {
        if (!file.startsWith('app-') || !file.endsWith('.log')) continue;
        // 从文件名提取日期：app-YYYY-MM-DD.log 或 app-YYYY-MM-DD-N.log
        const match = file.match(/^app-(\d{4}-\d{2}-\d{2})(?:-\d+)?\.log$/);
        if (!match) continue;
        const fileDate = new Date(match[1] + 'T00:00:00').getTime();
        if (isNaN(fileDate)) continue;
        if (fileDate < cutoff) {
          try {
            fs.unlinkSync(path.join(LOGS_DIR, file));
            deleted++;
          } catch {
            // 忽略单个文件删除失败
          }
        }
      }
    } catch (err) {
      console.error('[Logger] 清理旧日志失败:', err);
    }

    return deleted;
  }

  /**
   * 列出所有日志文件及其元信息
   */
  listLogFiles(): Array<{
    filename: string;
    size: number;
    createdAt: string;
    modifiedAt: string;
  }> {
    const result: Array<{
      filename: string;
      size: number;
      createdAt: string;
      modifiedAt: string;
    }> = [];

    try {
      if (!fs.existsSync(LOGS_DIR)) return result;
      const files = fs.readdirSync(LOGS_DIR)
        .filter((f) => f.startsWith('app-') && f.endsWith('.log'))
        .sort()
        .reverse(); // 最新的在前

      for (const file of files) {
        const fp = path.join(LOGS_DIR, file);
        const stat = fs.statSync(fp);
        result.push({
          filename: file,
          size: stat.size,
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    } catch (err) {
      console.error('[Logger] 列出日志文件失败:', err);
    }

    return result;
  }

  /**
   * 读取指定日志文件内容
   * - tail: 仅读取最后 N 行（默认 500），避免大文件撑爆内存
   */
  readLogFile(filename: string, tail = 500): string {
    // 安全检查：防止路径穿越
    if (!/^app-\d{4}-\d{2}-\d{2}(?:-\d+)?\.log$/.test(filename)) {
      throw new Error('无效的日志文件名');
    }

    const fp = path.join(LOGS_DIR, filename);
    if (!fs.existsSync(fp)) {
      throw new Error('日志文件不存在');
    }

    const content = fs.readFileSync(fp, 'utf8');
    if (!tail || tail <= 0) return content;

    // 仅返回最后 tail 行
    const lines = content.split('\n').filter(Boolean);
    return lines.slice(-tail).join('\n');
  }

  /** 获取日志目录路径 */
  getLogsDir(): string {
    return LOGS_DIR;
  }
}

/** 日志单例 */
export const logger = new Logger();

/** 启动时初始化日志目录 + 清理旧日志 */
export function initLogger(): void {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const deleted = logger.cleanupOldLogs();
  if (deleted > 0) {
    console.log(`[Logger] 已清理 ${deleted} 个过期日志文件`);
  }
  logger.info('日志系统已启动', { logsDir: LOGS_DIR });
}
