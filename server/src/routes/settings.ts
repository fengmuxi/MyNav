/**
 * 系统设置路由
 * ------------------------------------------------------------------
 * - 公开路由挂在 /api/settings：
 *     GET /api/settings/public   返回脱敏设置（无需登录）
 * - 管理员路由挂在 /api/admin：
 *     GET /api/admin/settings    管理员读取完整设置
 *     PUT /api/admin/settings    管理员更新设置
 *
 * 设置存储：settings 表 key='system'，value=JSON 字符串
 * 读取时若表内无记录则返回 DEFAULT_SETTINGS
 */
import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import {
  mergeSettings,
  readSettings,
  toPublicSettings,
  writeSettings,
} from '../settings.js';

/**
 * 公开设置路由器（挂在 /api/settings）
 * 仅提供脱敏的公开设置读取
 */
export const publicSettingsRouter = Router();

/**
 * GET /api/settings/public
 * 公开接口：返回脱敏设置（不包含 clientSecret，仅返回已启用的 oauthProviders）
 */
publicSettingsRouter.get('/public', (_req, res) => {
  const s = readSettings();
  res.json(toPublicSettings(s));
});

/**
 * 管理员设置路由器（挂在 /api/admin）
 * 提供完整设置读取与更新，需 Admin 鉴权
 */
export const adminSettingsRouter = Router();

/**
 * GET /api/admin/settings
 * 管理员读取完整设置（包含 clientSecret 等敏感字段）
 */
adminSettingsRouter.get('/settings', authMiddleware, roleMiddleware, (_req, res) => {
  res.json(readSettings());
});

/**
 * PUT /api/admin/settings
 * 管理员更新设置
 * body: SystemSettings（部分字段也可，会与默认值合并）
 */
adminSettingsRouter.put('/settings', authMiddleware, roleMiddleware, (req, res) => {
  const merged = mergeSettings(req.body);
  writeSettings(merged);
  res.json(merged);
});
