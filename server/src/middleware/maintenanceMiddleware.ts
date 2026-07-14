/**
 * 维护模式中间件
 * ------------------------------------------------------------------
 * 当系统设置 maintenanceMode=true 时：
 * - 拦截非管理员对受保护公开接口的访问，返回 503 + 维护公告
 * - 管理员（携带有效 Bearer Token 且 role=ADMIN）正常放行，便于后台预览
 *
 * 用法：挂在需要受维护模式影响的公开路由前，如 /api/public/nav
 *      注意：不要挂载在 /api/settings/public、/api/auth/login 等必须可访问的接口上
 *
 * 设计要点：
 * - 不强制要求 token：未携带 token 视为访客，命中维护模式则 503
 * - token 校验失败（过期/无效）也视为访客，避免维护期间泄露账户状态
 * - 仅信任库中实时角色，不信任 token payload 中的 role
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { readSettings } from '../settings.js';

const JWT_SECRET = process.env.JWT_SECRET || 'mynav_dev_secret_change_me';

/**
 * 判定请求方是否为活跃管理员
 * - 无 token / token 无效 / 用户不存在 / 被禁用 / 非 ADMIN → false
 * - 否则 → true
 */
function isAdminRequest(req: Request): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number };
    const row = db
      .select({ id: users.id, role: users.role, status: users.status })
      .from(users)
      .where(eq(users.id, decoded.id))
      .get();
    if (!row || row.status !== 'active') return false;
    return row.role === 'ADMIN';
  } catch {
    return false;
  }
}

/**
 * 维护模式中间件
 * - 维护模式关闭：直接 next()
 * - 维护模式开启 + 管理员：next()
 * - 维护模式开启 + 非管理员：503 { error, maintenance: true, notice }
 */
export function maintenanceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const cfg = readSettings();
  if (!cfg.maintenanceMode) {
    next();
    return;
  }
  if (isAdminRequest(req)) {
    // 管理员在维护期间仍可预览
    next();
    return;
  }
  res.status(503).json({
    error: cfg.maintenanceNotice || '站点维护中，请稍后再试',
    maintenance: true,
    notice: cfg.maintenanceNotice || '站点维护中，请稍后再试',
  });
}
