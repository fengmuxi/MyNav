/**
 * 系统设置路由
 * ------------------------------------------------------------------
 * - 公开路由挂在 /api/settings：
 *     GET /api/settings/public          返回脱敏设置（无需登录）
 *     GET /api/settings/version         返回本地打包版本信息
 *     GET /api/settings/version/check   对比 GitHub Release 最新版本
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
import { getVersionInfo, VERSION } from '../version.js';

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
 * GET /api/settings/version
 * 公开接口：返回本地打包版本信息（版本号、发布日期、变更摘要）
 */
publicSettingsRouter.get('/version', (_req, res) => {
  res.json(getVersionInfo());
});

/**
 * GET /api/settings/version/check
 * 公开接口：对比 GitHub Releases 最新版本与本地版本
 * ------------------------------------------------------------------
 * - 仅当系统设置 githubEnabled=true 且 githubUrl 非空时才请求 GitHub API
 * - GitHub API 限流：未授权 60 次/小时/IP，此处使用 5 分钟内存缓存降低调用频次
 * - 返回结构：
 *   {
 *     local:        本地版本信息,
 *     remote:       GitHub Release 信息 | null,
 *     isLatest:     本地是否为最新版本,
 *     hasUpdate:    是否有可用更新,
 *     message:      人类可读的状态描述,
 *     checkedAt:    检查时间戳
 *   }
 */
interface GitHubRelease {
  tag_name: string;
  name: string | null;
  published_at: string;
  html_url: string;
  body: string;
}

interface VersionCheckCache {
  data: unknown;
  expireAt: number;
}

let versionCheckCache: VersionCheckCache | null = null;
const VERSION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

/**
 * 将 GitHub 仓库 URL 解析为 API URL
 * - 支持 https://github.com/owner/repo
 * - 支持 https://github.com/owner/repo.git
 * - 支持 https://github.com/owner/repo/tree/branch 等子路径
 */
function resolveGitHubApiUrl(githubUrl: string): string | null {
  try {
    const u = new URL(githubUrl);
    if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null;
    // 提取 owner/repo
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, repoRaw] = parts;
    const repo = repoRaw.replace(/\.git$/, '');
    return `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  } catch {
    return null;
  }
}

/**
 * 语义化版本对比
 * - 输入支持 v1.0.0 / 1.0.0 / v1.0.0-beta 等格式
 * - 返回：1 = a 大于 b，-1 = a 小于 b，0 = 相等
 */
function compareSemver(a: string, b: string): number {
  const parse = (v: string) => {
    const clean = v.replace(/^v/i, '').split('-')[0].split('+')[0];
    const segs = clean.split('.').map((s) => parseInt(s, 10) || 0);
    return segs;
  };
  const sa = parse(a);
  const sb = parse(b);
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const na = sa[i] ?? 0;
    const nb = sb[i] ?? 0;
    if (na !== nb) return na > nb ? 1 : -1;
  }
  return 0;
}

publicSettingsRouter.get('/version/check', async (_req, res) => {
  const local = getVersionInfo();

  // 1. 命中缓存直接返回
  if (versionCheckCache && versionCheckCache.expireAt > Date.now()) {
    res.json(versionCheckCache.data);
    return;
  }

  const settings = readSettings();
  // 2. 未启用 GitHub 信息或未配置仓库地址 → 直接返回本地版本，标记为未检查
  if (!settings.githubEnabled || !settings.githubUrl) {
    const data = {
      local,
      remote: null,
      isLatest: true,
      hasUpdate: false,
      message: '未配置 GitHub 仓库，跳过远端检查',
      checkedAt: new Date().toISOString(),
    };
    versionCheckCache = { data, expireAt: Date.now() + VERSION_CACHE_TTL_MS };
    res.json(data);
    return;
  }

  const apiUrl = resolveGitHubApiUrl(settings.githubUrl);
  if (!apiUrl) {
    const data = {
      local,
      remote: null,
      isLatest: true,
      hasUpdate: false,
      message: 'GitHub 仓库地址格式无效',
      checkedAt: new Date().toISOString(),
    };
    versionCheckCache = { data, expireAt: Date.now() + VERSION_CACHE_TTL_MS };
    res.json(data);
    return;
  }

  // 3. 请求 GitHub API
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'MyNav-Version-Checker',
        'Accept': 'application/vnd.github+json',
      },
    });
    clearTimeout(timeout);

    if (resp.status === 404) {
      // 仓库无 Release
      const data = {
        local,
        remote: null,
        isLatest: true,
        hasUpdate: false,
        message: 'GitHub 仓库暂无 Release 发布',
        checkedAt: new Date().toISOString(),
      };
      versionCheckCache = { data, expireAt: Date.now() + VERSION_CACHE_TTL_MS };
      res.json(data);
      return;
    }

    if (!resp.ok) {
      const data = {
        local,
        remote: null,
        isLatest: true,
        hasUpdate: false,
        message: `GitHub API 请求失败：HTTP ${resp.status}`,
        checkedAt: new Date().toISOString(),
      };
      versionCheckCache = { data, expireAt: Date.now() + VERSION_CACHE_TTL_MS };
      res.json(data);
      return;
    }

    const release = (await resp.json()) as GitHubRelease;
    const cmp = compareSemver(VERSION, release.tag_name);
    const isLatest = cmp >= 0;
    const data = {
      local,
      remote: {
        version: release.tag_name,
        name: release.name ?? release.tag_name,
        publishedAt: release.published_at,
        htmlUrl: release.html_url,
        changelog: release.body ?? '',
      },
      isLatest,
      hasUpdate: !isLatest,
      message: isLatest
        ? `当前为最新版本（本地 ${VERSION} ≥ 远端 ${release.tag_name}）`
        : `发现新版本：${release.tag_name}（本地 ${VERSION}）`,
      checkedAt: new Date().toISOString(),
    };
    versionCheckCache = { data, expireAt: Date.now() + VERSION_CACHE_TTL_MS };
    res.json(data);
  } catch {
    // 网络/超时错误：不缓存，下次重试
    res.json({
      local,
      remote: null,
      isLatest: true,
      hasUpdate: false,
      message: 'GitHub API 请求失败（网络超时或被限流）',
      checkedAt: new Date().toISOString(),
    });
  }
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
  // 设置变更后失效版本检查缓存（githubUrl 可能被修改）
  versionCheckCache = null;
  res.json(merged);
});
