/**
 * JWT 鉴权中间件
 * ------------------------------------------------------------------
 * 关键说明（JWT 验证逻辑）：
 * 1. 从请求头 Authorization 中读取 "Bearer <token>" 格式的令牌。
 * 2. 校验格式：必须以 Bearer 开头且附带 token。
 * 3. 使用 jsonwebtoken.verify 校验签名与有效期，密钥来自环境变量 JWT_SECRET
 *    （未配置时使用开发兜底密钥，生产环境必须覆盖）。
 * 4. 查询数据库确认用户存在且 status === 'active'；
 *    这样禁用/删除账户后旧 token 立即失效（安全性优先）。
 * 5. 校验通过后将解码出的用户信息挂载到 req.user，供后续中间件/路由使用。
 * 6. 任一环节失败返回 401，统一错误结构 { error }。
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { readSettings } from '../settings.js';

// JWT 密钥：优先读环境变量，开发环境兜底（生产必须配置 JWT_SECRET）
const JWT_SECRET = process.env.JWT_SECRET || 'mynav_dev_secret_change_me';

/**
 * 生成 JWT（供登录/注册路由使用）
 * - payload 仅放入必要字段：id, username, role
 * - 有效期由系统设置 sessionHours 控制（默认 24 小时）
 */
export function signToken(payload: {
  id: number;
  username: string;
  role: string;
}): string {
  const cfg = readSettings();
  const hours = cfg.sessionHours > 0 ? cfg.sessionHours : 24;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${hours}h` });
}

/**
 * 鉴权中间件：校验 Bearer Token
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  // 1) 校验 Authorization 头是否存在且格式正确
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: '未提供有效的认证令牌' });
    return;
  }

  // 2) 提取 token（去掉 "Bearer " 前缀）
  const token = authHeader.slice('Bearer '.length).trim();

  try {
    // 3) 验证签名与有效期；若失败会抛出 TokenExpiredError / JsonWebTokenError
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: number;
      username: string;
      role: 'USER' | 'ADMIN';
    };

    // 4) 查库确认账户仍有效（被禁用或删除后旧 token 立即失效）
    const row = db
      .select({ id: users.id, username: users.username, role: users.role, status: users.status })
      .from(users)
      .where(eq(users.id, decoded.id))
      .get();

    if (!row) {
      res.status(401).json({ error: '账户不存在，请重新登录' });
      return;
    }
    if (row.status !== 'active') {
      res.status(403).json({ error: '账户已被禁用，请联系管理员' });
      return;
    }

    // 5) 挂载到 req.user，供后续中间件与路由使用（使用库中最新角色）
    req.user = {
      id: row.id,
      username: row.username,
      role: row.role as 'USER' | 'ADMIN',
    };
    next();
  } catch (err) {
    // 6) token 无效或过期
    res.status(401).json({ error: '令牌无效或已过期，请重新登录' });
  }
}
