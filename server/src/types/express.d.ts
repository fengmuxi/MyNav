/**
 * Express 类型扩展
 * ------------------------------------------------------------------
 * 为 Express 的 Request 对象增加 user 字段，
 * 使 authMiddleware 挂载的用户信息在路由中具备类型提示。
 */
import type { User } from '../db/schema.js';

// 扩展 Express 的 Request，挂载当前登录用户
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        role: 'USER' | 'ADMIN';
      };
    }
  }
}

// 仅用于类型导出，避免该文件被视为孤立模块
export type { User };
