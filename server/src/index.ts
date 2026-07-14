/**
 * MyNav 后端服务器入口
 * ------------------------------------------------------------------
 * 启动流程：
 * 1. 加载环境变量
 * 2. 初始化数据库（建表 + 种子数据）
 * 3. 创建上传目录（server/uploads/avatars）
 * 4. 创建 Express 应用，挂载 CORS / JSON 中间件
 * 5. 挂载静态文件 /uploads（头像等用户上传资源）
 * 6. 挂载路由：/api/auth, /api/public, /api/private, /api/admin, /api/user
 * 7. 启动监听
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase } from './db/index.js';
import { authRouter } from './routes/auth.js';
import { navRouter } from './routes/nav.js';
import { adminRouter } from './routes/admin.js';
import { userRouter } from './routes/user.js';
import { publicSettingsRouter, adminSettingsRouter } from './routes/settings.js';

// 解析当前模块路径，定位上传目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// server/src -> server
const SERVER_ROOT = path.resolve(__dirname, '..');

// 上传目录路径（优先使用环境变量，支持绝对路径）
// Docker 环境下建议设置为 /app/uploads
const UPLOADS_ROOT = process.env.UPLOADS_PATH
  ? (process.env.UPLOADS_PATH.startsWith('/') 
      ? process.env.UPLOADS_PATH 
      : path.resolve(SERVER_ROOT, process.env.UPLOADS_PATH))
  : path.join(SERVER_ROOT, 'uploads');
const AVATARS_ROOT = path.join(UPLOADS_ROOT, 'avatars');
const ICONS_ROOT = path.join(UPLOADS_ROOT, 'icons');

// 1) 初始化数据库（首次启动会自动建表 + seed）
initDatabase();

// 2) 确保上传目录存在（recursive: true 会一并创建父目录）
fs.mkdirSync(AVATARS_ROOT, { recursive: true });
fs.mkdirSync(ICONS_ROOT, { recursive: true });

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// 3) 中间件
app.use(cors());                       // 跨域：开发环境允许所有来源
app.use(express.json({ limit: '5mb' }));  // 解析 JSON 请求体，放大限制以支持 base64 头像

// 4) 静态文件：暴露 /uploads/* 资源（头像图片等）
app.use('/uploads', express.static(UPLOADS_ROOT, {
  maxAge: '7d',
  fallthrough: true,
}));

// 5) 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 5.1) 工具接口：获取网页 title + favicon（无需鉴权）
/**
 * GET /api/util/meta?url=https://example.com
 * 后端 fetch 目标页面 HTML，提取 <title> 和 favicon 链接
 * 返回 { title, favicon }
 * - favicon 解析优先级：<link rel="icon"> > <link rel="shortcut icon"> > /favicon.ico
 * - 超时 5s，失败返回 200 + 空值（不报错，让前端 fallback）
 */
app.get('/api/util/meta', async (req, res) => {
  const url = (req.query.url as string)?.trim();
  if (!url) {
    res.json({ title: '', favicon: '' });
    return;
  }

  try {
    // 规范化 URL
    let targetUrl = url;
    if (!/^https?:\/\//.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(targetUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyNavBot/1.0)' },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      res.json({ title: '', favicon: '' });
      return;
    }

    const html = await resp.text();
    // 只取前 50KB 避免处理过大页面
    const head = html.slice(0, 50000);

    // 提取 <title>
    let title = '';
    const titleMatch = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    }

    // 提取 favicon
    let favicon = '';
    // 优先 <link rel="icon" href="...">
    const iconMatch = head.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)
      || head.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
    if (iconMatch) {
      let href = iconMatch[1];
      // 处理相对路径
      if (href.startsWith('//')) {
        href = 'https:' + href;
      } else if (href.startsWith('/')) {
        const origin = new URL(targetUrl).origin;
        href = origin + href;
      } else if (!href.startsWith('http')) {
        const base = new URL(targetUrl);
        href = base.origin + '/' + href;
      }
      favicon = href;
    }

    // 如果没找到 link 标签，用默认 /favicon.ico
    if (!favicon) {
      const origin = new URL(targetUrl).origin;
      favicon = origin + '/favicon.ico';
    }

    res.json({ title, favicon });
  } catch {
    // 网络错误、超时等：返回空值，前端 fallback 到首字母
    res.json({ title: '', favicon: '' });
  }
});

/**
 * GET /api/util/favicon?url=https://example.com
 * 后端代理 favicon 图片，避免前端直接请求被 GFW 拦截
 * 流程：先尝试 /favicon.ico，失败则尝试 DuckDuckGo 服务
 */
app.get('/api/util/favicon', async (req, res) => {
  const url = (req.query.url as string)?.trim();
  if (!url) {
    res.status(400).end();
    return;
  }

  try {
    let targetUrl = url;
    if (!/^https?:\/\//.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    }
    const domain = new URL(targetUrl).hostname;

    // 尝试网站自身的 favicon
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`https://${domain}/favicon.ico`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyNavBot/1.0)' },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const buf = Buffer.from(await resp.arrayBuffer());
      const ct = resp.headers.get('content-type') || 'image/x-icon';
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.end(buf);
      return;
    }
  } catch {
    // 忽略，走 fallback
  }

  // Fallback: 重定向到 DuckDuckGo favicon 服务
  try {
    const targetUrl = url.startsWith('http') ? url : 'https://' + url;
    const domain = new URL(targetUrl).hostname;
    res.redirect(302, `https://icons.duckduckgo.com/ip3/${domain}.ico`);
  } catch {
    res.status(404).end();
  }
});

// 6) 挂载业务路由
app.use('/api/auth', authRouter);
app.use('/api', navRouter);                  // 提供 /api/public/nav 与 /api/private/nav
app.use('/api/settings', publicSettingsRouter); // 提供 /api/settings/public
app.use('/api/admin', adminRouter);          // 提供 /api/admin/nav、/api/admin/users 等
app.use('/api/admin', adminSettingsRouter);  // 提供 /api/admin/settings（GET/PUT）
app.use('/api/user', userRouter); // 用户个人数据（主题、个人资料、头像等）

// 7) 前端静态资源托管（生产环境单镜像部署）
// - PUBLIC_DIR 由 Dockerfile 注入（指向 /app/public）
// - 所有未匹配 /api、/uploads 的请求 → 返回前端静态文件
// - SPA 路由回退：找不到对应静态文件时返回 index.html，让前端路由接管
const PUBLIC_DIR = process.env.PUBLIC_DIR
  ? (process.env.PUBLIC_DIR.startsWith('/')
      ? process.env.PUBLIC_DIR
      : path.resolve(SERVER_ROOT, process.env.PUBLIC_DIR))
  : null;

if (PUBLIC_DIR && fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR, {
    maxAge: '7d',
    fallthrough: true,
    index: 'index.html',
  }));
  // SPA 回退：非 API / 非上传资源的 GET 请求统一返回 index.html
  app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
  console.log(`[Server] 已启用前端静态托管：${PUBLIC_DIR}`);
}

// 8) 全局错误处理
app.use((err: unknown, _req: unknown, res: express.Response, _next: unknown) => {
  console.error('[Error]', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// 8) 启动监听
app.listen(PORT, () => {
  console.log(`[Server] MyNav 后端已启动：http://localhost:${PORT}`);
});

// 导出上传目录路径，供路由层写入头像文件使用
export const PATHS = {
  uploadsRoot: UPLOADS_ROOT,
  avatarsRoot: AVATARS_ROOT,
  iconsRoot: ICONS_ROOT,
};
