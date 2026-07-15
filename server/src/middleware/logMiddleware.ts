/**
 * 请求日志中间件
 * ------------------------------------------------------------------
 * 记录每个 HTTP 请求的方法、路径、状态码、响应时长、客户端 IP、用户信息。
 * - 跳过静态文件和健康检查，避免日志噪音
 * - 错误响应（4xx/5xx）使用 warn/error 级别
 * - 可通过 req.logDisabled 标记跳过特定路由
 */
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';

/** 需要跳过日志记录的路径前缀 */
const SKIP_PREFIXES = [
  '/uploads/',
  '/logo.png',
  '/favicon.ico',
];

/** 需要跳过日志记录的精确路径 */
const SKIP_EXACT = [
  '/api/health',
  '/api/settings/version',
  '/api/settings/version/check',
];

/** 获取客户端真实 IP（处理反向代理场景） */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') return realIp;
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * 请求日志中间件
 * - 记录请求开始时间，在响应结束时输出完整日志
 */
export function requestLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 跳过静态资源与健康检查
  const path = req.path;
  if (SKIP_EXACT.includes(path) || SKIP_PREFIXES.some((p) => path.startsWith(p))) {
    next();
    return;
  }

  const start = Date.now();
  const ip = getClientIp(req);

  // 在响应结束时记录
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const method = req.method;
    const user = req.user;

    const meta: Record<string, unknown> = {
      method,
      path,
      status,
      duration: `${duration}ms`,
      ip,
    };

    if (user) {
      meta.userId = user.id;
      meta.username = user.username;
      meta.role = user.role;
    }

    // 根据状态码选择日志级别
    if (status >= 500) {
      logger.error(`${method} ${path} → ${status} (${duration}ms)`, meta);
    } else if (status >= 400) {
      logger.warn(`${method} ${path} → ${status} (${duration}ms)`, meta);
    } else {
      logger.info(`${method} ${path} → ${status} (${duration}ms)`, meta);
    }
  });

  next();
}

/**
 * 全局错误日志中间件
 * - 捕获未被路由处理的异常
 * - 必须放在所有路由之后、app.listen 之前
 */
export function errorLogMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const errorObj = err instanceof Error ? err : new Error(String(err));

  logger.error(`未捕获异常: ${errorObj.message}`, {
    method: req.method,
    path: req.path,
    stack: errorObj.stack,
    userId: req.user?.id,
    username: req.user?.username,
  });

  res.status(500).json({ error: '服务器内部错误' });
}
