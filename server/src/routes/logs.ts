/**
 * 日志管理路由 /api/admin/logs
 * ------------------------------------------------------------------
 * 全部需要 Admin 鉴权（authMiddleware + roleMiddleware）。
 *
 * 接口列表：
 * - GET  /api/admin/logs/config          获取日志配置（文件大小、保留天数）
 * - PUT  /api/admin/logs/config          更新日志配置
 * - GET  /api/admin/logs/files           列出所有日志文件
 * - GET  /api/admin/logs/files/:filename 读取指定日志文件内容
 * - GET  /api/admin/logs/stream          SSE 实时日志流
 * - POST /api/admin/logs/cleanup         手动触发清理过期日志
 */
import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import {
  logger,
  readLogConfig,
  writeLogConfig,
  type LogConfig,
} from '../logger.js';

export const logsRouter = Router();

// 全部路由需要 Admin 鉴权
logsRouter.use(authMiddleware, roleMiddleware);

/**
 * GET /api/admin/logs/config
 * 获取当前日志配置
 */
logsRouter.get('/config', (_req, res) => {
  res.json(readLogConfig());
});

/**
 * PUT /api/admin/logs/config
 * 更新日志配置
 * body: { maxFileSize: number (MB), retentionDays: number }
 */
logsRouter.put('/config', (req, res) => {
  const { maxFileSize, retentionDays } = req.body ?? {};

  // maxFileSize 单位为 MB，转换为字节存储
  const sizeMB = Number(maxFileSize);
  const days = Number(retentionDays);

  if (isNaN(sizeMB) || sizeMB < 1 || sizeMB > 100) {
    res.status(400).json({ error: '文件大小需在 1-100 MB 之间' });
    return;
  }
  if (isNaN(days) || days < 1 || days > 365) {
    res.status(400).json({ error: '保留天数需在 1-365 天之间' });
    return;
  }

  const cfg: LogConfig = {
    maxFileSize: Math.floor(sizeMB * 1024 * 1024),
    retentionDays: Math.floor(days),
  };
  writeLogConfig(cfg);

  logger.info('日志配置已更新', {
    maxFileSizeMB: sizeMB,
    retentionDays: days,
    updatedBy: req.user?.username,
  });

  res.json({
    ...cfg,
    maxFileSizeMB: sizeMB,
  });
});

/**
 * GET /api/admin/logs/files
 * 列出所有日志文件
 */
logsRouter.get('/files', (_req, res) => {
  const files = logger.listLogFiles();
  res.json({ files });
});

/**
 * GET /api/admin/logs/files/:filename
 * 读取指定日志文件内容
 * query: ?lines=500 (读取最后 N 行，默认 500)
 */
logsRouter.get('/files/:filename', (req, res) => {
  const filename = req.params.filename;
  const lines = parseInt(req.query.lines as string, 10) || 500;

  try {
    const content = logger.readLogFile(filename, lines);
    res.json({ filename, lines: content.split('\n').filter(Boolean).length, content });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/admin/logs/stream
 * SSE 实时日志流
 * - 连接时先发送环形缓冲中的最近日志
 * - 之后实时推送新日志
 */
logsRouter.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Nginx 反向代理下禁用缓冲
  });

  // 发送最近的日志（环形缓冲）
  const recent = logger.getRecentLogs();
  for (const entry of recent) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  // 监听新日志
  const onLog = (entry: unknown) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  };
  logger.on('log', onLog);

  // 心跳：每 30 秒发送一次，防止连接超时
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  // 客户端断开时清理
  req.on('close', () => {
    logger.off('log', onLog);
    clearInterval(heartbeat);
  });
});

/**
 * POST /api/admin/logs/cleanup
 * 手动触发清理过期日志
 */
logsRouter.post('/cleanup', (req, res) => {
  const deleted = logger.cleanupOldLogs();
  logger.info('手动清理过期日志', {
    deleted,
    triggeredBy: req.user?.username,
  });
  res.json({ deleted });
});
