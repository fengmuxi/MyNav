/**
 * 角色权限中间件
 * ------------------------------------------------------------------
 * 检查 req.user.role === 'ADMIN'。
 * 必须在 authMiddleware 之后使用（依赖 req.user 已被挂载）。
 * 非 ADMIN 返回 403。
 */
import type { Request, Response, NextFunction } from 'express';

export function roleMiddleware(req: Request, res: Response, next: NextFunction): void {
  // authMiddleware 已挂载 req.user；若不存在说明鉴权失败
  if (!req.user) {
    res.status(401).json({ error: '未认证' });
    return;
  }

  if (req.user.role !== 'ADMIN') {
    res.status(403).json({ error: '权限不足，需要管理员权限' });
    return;
  }

  next();
}
