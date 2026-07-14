/**
 * 用户个人数据路由 /api/user
 * ------------------------------------------------------------------
 * 需 JWT 鉴权。提供：
 * - 主题：GET/PUT /theme
 * - 个人资料：GET/PUT /profile（昵称、邮箱、简介）
 * - 修改密码：PUT /password（需验证旧密码）
 * - 头像上传：POST /avatar（接收 base64，写入文件，返回可访问 URL）
 *
 * 主题结构 (ThemePreset)：
 * { background, surfaceColor, accentColor, textColor, cardRadius, cardShadow, presetId }
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { db, sqlite } from '../db/index.js';
import { navGroups, navCategories, navItems, navItemClicks, users } from '../db/schema.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { rsaDecrypt, aesEncrypt, aesDecrypt, deriveUserBackupKey } from '../crypto.js';
import { createZip, readZipFile } from '../zip.js';
import { PATHS } from '../index.js';

export const userRouter = Router();

// 全部接口需要登录
userRouter.use(authMiddleware);

/**
 * 公共工具：从数据库行构造对外暴露的 user 对象（去除敏感字段）
 */
function toUserDTO(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    displayName: row.displayName,
    email: row.email,
    bio: row.bio,
    avatar: row.avatar,
    status: row.status,
  };
}

/* ============================== 主题相关 ============================== */

/**
 * GET /api/user/theme
 * 返回当前用户的主题方案；未设置时返回 { theme: null }
 */
userRouter.get('/theme', (req, res) => {
  const userId = req.user!.id;
  const row = db
    .select({ theme: users.theme })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!row) {
    res.status(404).json({ error: '用户不存在' });
    return;
  }

  // theme 字段存的是 JSON 字符串，解析后返回对象；为空则返回 null
  let theme: unknown = null;
  if (row.theme) {
    try {
      theme = JSON.parse(row.theme);
    } catch {
      // 损坏的 JSON 兜底为 null
      theme = null;
    }
  }
  res.json({ theme });
});

/**
 * PUT /api/user/theme
 * body: { theme: ThemePreset }
 * 将主题方案整体序列化为 JSON 存入 users.theme
 */
userRouter.put('/theme', (req, res) => {
  const userId = req.user!.id;
  const { theme } = req.body ?? {};

  // 基础校验：必须传入对象
  if (!theme || typeof theme !== 'object') {
    res.status(400).json({ error: '主题数据格式无效' });
    return;
  }

  // 校验必要字段存在，防止脏数据入库
  const required = ['background', 'surfaceColor', 'accentColor', 'textColor', 'cardRadius', 'cardShadow', 'presetId'];
  for (const key of required) {
    if (!(key in theme)) {
      res.status(400).json({ error: `主题缺少字段：${key}` });
      return;
    }
  }

  // 序列化存储
  const json = JSON.stringify(theme);
  db.update(users)
    .set({ theme: json })
    .where(eq(users.id, userId))
    .run();

  res.json({ ok: true, theme });
});

/* ============================== 个人资料 ============================== */

/**
 * GET /api/user/profile
 * 返回当前登录用户的完整个人资料（不含密码哈希）
 */
userRouter.get('/profile', (req, res) => {
  const userId = req.user!.id;
  const row = db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) {
    res.status(404).json({ error: '用户不存在' });
    return;
  }
  res.json({ user: toUserDTO(row) });
});

/**
 * PUT /api/user/profile
 * 更新自己的基础信息（昵称、邮箱、简介）
 * 不允许通过此接口修改 username/role/status/password，那些走专门接口
 * body: { displayName?, email?, bio? }
 */
userRouter.put('/profile', (req, res) => {
  const userId = req.user!.id;
  const { displayName, email, bio } = req.body ?? {};

  const patch: Record<string, unknown> = {};

  if (displayName !== undefined) {
    if (typeof displayName !== 'string' || displayName.length > 32) {
      res.status(400).json({ error: '昵称长度不能超过 32 字符' });
      return;
    }
    patch.displayName = displayName.trim() || null;
  }

  if (email !== undefined) {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: '邮箱格式无效' });
      return;
    }
    patch.email = (email || '').trim() || null;
  }

  if (bio !== undefined) {
    if (typeof bio !== 'string' || bio.length > 200) {
      res.status(400).json({ error: '个人简介长度不能超过 200 字符' });
      return;
    }
    patch.bio = bio.trim() || null;
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: '没有可更新的字段' });
    return;
  }

  db.update(users).set(patch).where(eq(users.id, userId)).run();
  const updated = db.select().from(users).where(eq(users.id, userId)).get();
  res.json({ user: toUserDTO(updated!) });
});

/* ============================== 修改密码 ============================== */

/**
 * PUT /api/user/password
 * 用户修改自己的密码，需提供旧密码验证
 * body: { oldPassword(加密), newPassword(加密) }
 */
userRouter.put('/password', (req, res) => {
  const userId = req.user!.id;
  const { oldPassword: encryptedOld, newPassword: encryptedNew } = req.body ?? {};

  if (!encryptedOld || !encryptedNew) {
    res.status(400).json({ error: '旧密码和新密码不能为空' });
    return;
  }

  // RSA 解密密码
  let oldPassword: string;
  let newPassword: string;
  try {
    oldPassword = rsaDecrypt(encryptedOld);
    newPassword = rsaDecrypt(encryptedNew);
  } catch {
    res.status(400).json({ error: '密码解密失败，请刷新页面后重试' });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: '新密码长度不能少于 6 位' });
    return;
  }
  if (oldPassword === newPassword) {
    res.status(400).json({ error: '新密码不能与旧密码相同' });
    return;
  }

  const row = db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!row) {
    res.status(404).json({ error: '用户不存在' });
    return;
  }

  // 验证旧密码
  if (!bcrypt.compareSync(oldPassword, row.passwordHash)) {
    res.status(401).json({ error: '旧密码错误' });
    return;
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.update(users)
    .set({ passwordHash: newHash })
    .where(eq(users.id, userId))
    .run();

  res.json({ ok: true });
});

/* ============================== 头像上传 ============================== */

// 允许的图片 MIME 类型与对应扩展名映射
const ALLOWED_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// 头像文件大小上限：解码后 2MB
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/**
 * POST /api/user/avatar
 * 接收 base64 头像（data URL 格式），写入 server/uploads/avatars/，
 * 返回 { avatar: '/uploads/avatars/<filename>' }
 *
 * body: { avatar: 'data:image/png;base64,xxxx...' }
 *
 * 实现说明：
 * - 前端用 FileReader.readAsDataURL 把图片转成 data URL
 * - 后端解析 MIME 与 base64 内容，校验类型与大小
 * - 文件名用 userId + 时间戳保证唯一，避免缓存命中旧头像
 * - 旧头像文件会被删除以节省空间
 */
userRouter.post('/avatar', (req, res) => {
  const userId = req.user!.id;
  const { avatar } = req.body ?? {};

  if (!avatar || typeof avatar !== 'string') {
    res.status(400).json({ error: '头像数据不能为空' });
    return;
  }

  // 解析 data URL：data:<mime>;base64,<data>
  const match = avatar.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: '头像数据格式无效，需为 data URL' });
    return;
  }

  const mime = match[1];
  const base64Data = match[2];
  const ext = ALLOWED_MIME[mime];
  if (!ext) {
    res.status(400).json({ error: `不支持的图片类型：${mime}` });
    return;
  }

  // 解码并校验大小
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > MAX_AVATAR_BYTES) {
    res.status(400).json({ error: '头像文件过大（最大 2MB）' });
    return;
  }

  // 查询旧头像路径，上传成功后删除旧文件
  const oldRow = db.select({ avatar: users.avatar }).from(users).where(eq(users.id, userId)).get();

  // 生成文件名：userId-timestamp.ext
  const filename = `${userId}-${Date.now()}.${ext}`;
  const filePath = path.join(PATHS.avatarsRoot, filename);
  const publicUrl = `/uploads/avatars/${filename}`;

  // 同步写入文件
  fs.writeFileSync(filePath, buffer);

  // 更新数据库
  db.update(users)
    .set({ avatar: publicUrl })
    .where(eq(users.id, userId))
    .run();

  // 删除旧头像文件（仅删除本服务管理的 avatars 目录内文件，避免路径遍历风险）
  if (oldRow?.avatar) {
    const oldFileName = path.basename(oldRow.avatar);
    const oldFilePath = path.join(PATHS.avatarsRoot, oldFileName);
    if (fs.existsSync(oldFilePath) && oldFilePath.startsWith(PATHS.avatarsRoot)) {
      try {
        fs.unlinkSync(oldFilePath);
      } catch {
        // 删除失败不影响主流程
      }
    }
  }

  res.json({ avatar: publicUrl });
});

/* ============================== 导航图标上传 ============================== */

/**
 * POST /api/user/nav/icon
 * 接收 base64 图片（data URL 格式），写入 server/uploads/icons/，
 * 返回 { icon: '/uploads/icons/<filename>' }
 *
 * body: { icon: 'data:image/png;base64,xxxx...' }
 *
 * 用于用户上传自定义导航卡片图标，与头像上传逻辑一致。
 */
userRouter.post('/nav/icon', (req, res) => {
  const userId = req.user!.id;
  const { icon } = req.body ?? {};

  if (!icon || typeof icon !== 'string') {
    res.status(400).json({ error: '图标数据不能为空' });
    return;
  }

  // 解析 data URL：data:<mime>;base64,<data>
  const match = icon.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: '图标数据格式无效，需为 data URL' });
    return;
  }

  const mime = match[1];
  const base64Data = match[2];
  const ext = ALLOWED_MIME[mime];
  if (!ext) {
    res.status(400).json({ error: `不支持的图片类型：${mime}` });
    return;
  }

  // 解码并校验大小（与头像一致，最大 2MB）
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > MAX_AVATAR_BYTES) {
    res.status(400).json({ error: '图标文件过大（最大 2MB）' });
    return;
  }

  // 生成文件名：userId-timestamp.ext
  const filename = `${userId}-${Date.now()}.${ext}`;
  const filePath = path.join(PATHS.iconsRoot, filename);
  const publicUrl = `/uploads/icons/${filename}`;

  // 同步写入文件
  fs.writeFileSync(filePath, buffer);

  res.json({ icon: publicUrl });
});

/* ============================== 用户私有导航 ============================== */

/**
 * 辅助：查询分组并校验归属当前用户（ownerId === userId 且 isPublic === 0）
 * 不存在或不归属时返回 null，由调用方决定如何响应
 */
function getOwnedGroup(groupId: number, userId: number) {
  const group = db.select().from(navGroups).where(eq(navGroups.id, groupId)).get();
  if (!group) return null;
  if (group.ownerId !== userId || group.isPublic !== 0) return null;
  return group;
}

/**
 * 辅助：查询分类并校验其所属分组归属当前用户
 * 不存在或分组不归属时返回 null
 */
function getOwnedCategory(categoryId: number, userId: number) {
  const category = db.select().from(navCategories).where(eq(navCategories.id, categoryId)).get();
  if (!category) return null;
  if (!getOwnedGroup(category.groupId, userId)) return null;
  return category;
}

/**
 * 构建当前用户的私有导航树（ownerId=userId 且 isPublic=0）
 * 返回嵌套结构 groups -> categories -> items
 * - items 按 title 字母顺序排序
 * - 无 categoryId 的卡片归入虚拟分类"未分类"
 */
function buildUserNavTree(userId: number) {
  const groups = db
    .select()
    .from(navGroups)
    .where(and(eq(navGroups.ownerId, userId), eq(navGroups.isPublic, 0)))
    .all();

  if (groups.length === 0) return [];

  const groupIds = groups.map((g) => g.id);
  const categories = db
    .select()
    .from(navCategories)
    .all()
    .filter((c) => groupIds.includes(c.groupId));

  // 查询属于这些分组的所有卡片（通过 groupId 或 categoryId 关联）
  const items = db
    .select()
    .from(navItems)
    .all()
    .filter((i) => {
      // 通过 groupId 直接关联，或通过 categoryId 间接关联
      if (i.groupId && groupIds.includes(i.groupId)) return true;
      if (i.categoryId && categories.some((c) => c.id === i.categoryId)) return true;
      return false;
    });

  return groups
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    .map((g) => {
      // 该分组下的分类
      const groupCats = categories
        .filter((c) => c.groupId === g.id)
        .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
        .map((c) => ({
          ...c,
          items: items
            .filter((i) => i.categoryId === c.id)
            .sort((a, b) => a.title.localeCompare(b.title, 'zh')),
        }));

      // 无分类的卡片归入"未分类"虚拟分类
      const uncategorized = items
        .filter((i) => (i.groupId === g.id || (i.categoryId && groupCats.some((c) => c.id === i.categoryId) === false)) && !i.categoryId)
        .sort((a, b) => a.title.localeCompare(b.title, 'zh'));
      if (uncategorized.length > 0) {
        groupCats.push({
          id: 0,
          name: '未分类',
          groupId: g.id,
          orderIndex: 9999,
          items: uncategorized,
        } as typeof groupCats[number]);
      }

      return { ...g, categories: groupCats };
    });
}

/**
 * GET /api/user/nav
 * 鉴权：需登录（authMiddleware 已全局注入）
 * 返回当前用户的私有导航树（ownerId=当前用户 且 isPublic=0）
 */
userRouter.get('/nav', (req, res) => {
  const tree = buildUserNavTree(req.user!.id);
  res.json(tree);
});

/**
 * POST /api/user/nav/group
 * 鉴权：需登录
 * body: { name, orderIndex? }
 * 创建私有分组，强制 isPublic=0、ownerId=当前用户
 * 安全约束：服务端固定 isPublic=0 与 ownerId，客户端无法伪造公共分组或冒充他人
 */
userRouter.post('/nav/group', (req, res) => {
  const userId = req.user!.id;
  const { name, orderIndex } = req.body ?? {};

  if (!name) {
    res.status(400).json({ error: '分组名称不能为空' });
    return;
  }

  const created = db
    .insert(navGroups)
    .values({
      name,
      isPublic: 0,
      orderIndex: orderIndex ?? 0,
      ownerId: userId,
    })
    .returning()
    .get();

  res.status(201).json(created);
});

/**
 * POST /api/user/nav/category
 * 鉴权：需登录
 * body: { name, groupId, orderIndex? }
 * 在指定分组下创建分类
 * 安全约束：目标分组必须归属当前用户且为私有（isPublic=0），否则 403
 */
userRouter.post('/nav/category', (req, res) => {
  const userId = req.user!.id;
  const { name, groupId, orderIndex } = req.body ?? {};

  if (!name || !groupId) {
    res.status(400).json({ error: '分类名称和所属分组不能为空' });
    return;
  }

  if (!getOwnedGroup(groupId, userId)) {
    res.status(403).json({ error: '无权操作该分组' });
    return;
  }

  const created = db
    .insert(navCategories)
    .values({ name, groupId, orderIndex: orderIndex ?? 0 })
    .returning()
    .get();

  res.status(201).json(created);
});

/**
 * POST /api/user/nav/item
 * 鉴权：需登录
 * body: { title, url, icon?, groupId, categoryId?, orderIndex?, color?, shape?, size?, note? }
 * 创建卡片，categoryId 可选（不选分类时直接挂在分组下）
 * 安全约束：groupId 必须归属当前用户且为私有；若传入 categoryId，需属于该分组
 */
userRouter.post('/nav/item', (req, res) => {
  const userId = req.user!.id;
  const { title, url, icon, groupId, categoryId, orderIndex, color, shape, size, note } = req.body ?? {};

  if (!title || !url || !groupId) {
    res.status(400).json({ error: '标题、链接和所属分组不能为空' });
    return;
  }

  // 校验枚举值（仅在传入时校验，未传则使用下方默认值）
  if (shape !== undefined && !['rounded', 'square'].includes(shape)) {
    res.status(400).json({ error: "shape 必须为 'rounded' 或 'square'" });
    return;
  }
  if (size !== undefined && !['sm', 'md', 'lg'].includes(size)) {
    res.status(400).json({ error: "size 必须为 'sm' | 'md' | 'lg'" });
    return;
  }

  // 校验分组归属当前用户
  if (!getOwnedGroup(groupId, userId)) {
    res.status(403).json({ error: '无权操作该分组' });
    return;
  }

  // 若传入 categoryId，校验归属（需属于该分组）
  if (categoryId !== undefined && categoryId !== null) {
    const cat = getOwnedCategory(categoryId, userId);
    if (!cat || cat.groupId !== groupId) {
      res.status(403).json({ error: '无权操作该分类或分类不属于该分组' });
      return;
    }
  }

  const created = db
    .insert(navItems)
    .values({
      title,
      url,
      icon: icon ?? null,
      categoryId: categoryId ?? null,
      groupId,
      orderIndex: orderIndex ?? 0,
      color: color ?? '#1f2937',
      shape: shape ?? 'rounded',
      size: size ?? 'sm',
      note: note ?? null,
    })
    .returning()
    .get();

  res.status(201).json(created);
});

/**
 * PUT /api/user/nav/item/:id
 * 鉴权：需登录
 * body: { title?, url?, icon?, categoryId?, orderIndex?, color?, shape?, size?, note? }
 * 更新自己的卡片
 * 安全约束：
 * - 卡片必须归属当前用户（通过 groupId->group 链路校验），否则 403
 * - 若传入新的 categoryId，新分类所属分组也必须归属当前用户，否则 403
 */
userRouter.put('/nav/item/:id', (req, res) => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: '无效的卡片 ID' });
    return;
  }

  const existing = db.select().from(navItems).where(eq(navItems.id, id)).get();
  if (!existing) {
    res.status(404).json({ error: '卡片不存在' });
    return;
  }

  // 校验卡片归属当前用户（通过 groupId 链路）
  if (!existing.groupId || !getOwnedGroup(existing.groupId, userId)) {
    res.status(403).json({ error: '无权操作该卡片' });
    return;
  }

  const { title, url, icon, categoryId, orderIndex, color, shape, size, note } = req.body ?? {};

  // 若更换分类，校验新分类归属当前用户
  if (categoryId !== undefined && categoryId !== existing.categoryId) {
    if (categoryId !== null && !getOwnedCategory(categoryId, userId)) {
      res.status(403).json({ error: '无权操作该分类' });
      return;
    }
  }

  // 仅更新传入的字段
  const patch: Record<string, unknown> = {};
  if (title !== undefined) patch.title = title;
  if (url !== undefined) patch.url = url;
  if (icon !== undefined) patch.icon = icon;
  if (categoryId !== undefined) patch.categoryId = categoryId;
  if (orderIndex !== undefined) patch.orderIndex = orderIndex;
  if (color !== undefined) patch.color = color;
  if (shape !== undefined) {
    if (!['rounded', 'square'].includes(shape)) {
      res.status(400).json({ error: "shape 必须为 'rounded' 或 'square'" });
      return;
    }
    patch.shape = shape;
  }
  if (size !== undefined) {
    if (!['sm', 'md', 'lg'].includes(size)) {
      res.status(400).json({ error: "size 必须为 'sm' | 'md' | 'lg'" });
      return;
    }
    patch.size = size;
  }
  if (note !== undefined) patch.note = note;

  const updated = db
    .update(navItems)
    .set(patch)
    .where(eq(navItems.id, id))
    .returning()
    .get();

  res.json(updated);
});

/**
 * DELETE /api/user/nav/item/:id
 * 鉴权：需登录
 * 删除自己的卡片
 * 安全约束：卡片必须归属当前用户（通过 category->group 链路校验），否则 403
 */
userRouter.delete('/nav/item/:id', (req, res) => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: '无效的卡片 ID' });
    return;
  }

  const existing = db.select().from(navItems).where(eq(navItems.id, id)).get();
  if (!existing) {
    res.status(404).json({ error: '卡片不存在' });
    return;
  }

  // 校验卡片归属当前用户（通过 groupId 链路）
  if (!existing.groupId || !getOwnedGroup(existing.groupId, userId)) {
    res.status(403).json({ error: '无权操作该卡片' });
    return;
  }

  db.delete(navItems).where(eq(navItems.id, id)).run();
  res.json({ ok: true });
});

/**
 * DELETE /api/user/nav/category/:id
 * 鉴权：需登录
 * 删除自己的分类（schema 已配置 onDelete cascade，会级联删除其下卡片）
 * 安全约束：分类所属分组必须归属当前用户，否则 403
 */
userRouter.delete('/nav/category/:id', (req, res) => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: '无效的分类 ID' });
    return;
  }

  if (!getOwnedCategory(id, userId)) {
    res.status(403).json({ error: '无权操作该分类' });
    return;
  }

  db.delete(navCategories).where(eq(navCategories.id, id)).run();
  res.json({ ok: true });
});

/**
 * DELETE /api/user/nav/group/:id
 * 鉴权：需登录
 * 删除自己的分组（schema cascade 会级联删除分类与卡片）
 * 安全约束：分组必须归属当前用户且为私有（isPublic=0），否则 403
 */
userRouter.delete('/nav/group/:id', (req, res) => {
  const userId = req.user!.id;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: '无效的分组 ID' });
    return;
  }

  if (!getOwnedGroup(id, userId)) {
    res.status(403).json({ error: '无权操作该分组' });
    return;
  }

  db.delete(navGroups).where(eq(navGroups.id, id)).run();
  res.json({ ok: true });
});

/* ============================== 用户数据备份 ============================== */

/**
 * 用户数据备份 / 恢复
 * ------------------------------------------------------------------
 * - 备份范围：用户的私有导航数据（groups/categories/items）+ 个人资料（不含密码）
 *             + 该用户的点击记录
 * - 加密方式：AES-256-GCM，密钥由用户 ID 派生（详见 crypto.ts 的 deriveUserBackupKey）
 * - 文件格式：ZIP 文件，内含 backup.json（加密载荷）
 * - 恢复策略：清空当前用户私有导航数据后插入备份数据，全程在事务中执行
 *
 * ZIP 内文件结构：
 *   backup.json —— { version, type, createdAt, userId, username, iv, tag, data }
 */
const USER_BACKUP_VERSION = 1;
const USER_BACKUP_ENTRY = 'backup.json';

/**
 * GET /api/user/backup/export
 * 导出当前用户的所有数据（加密后打包为 ZIP 返回）
 * 客户端可直接将响应体保存为 .zip 文件
 */
userRouter.get('/backup/export', (req, res) => {
  const userId = req.user!.id;
  const userRow = db.select().from(users).where(eq(users.id, userId)).get();
  if (!userRow) {
    res.status(404).json({ error: '用户不存在' });
    return;
  }

  // 收集用户的私有导航数据
  const groups = db
    .select()
    .from(navGroups)
    .where(and(eq(navGroups.ownerId, userId), eq(navGroups.isPublic, 0)))
    .all();
  const groupIds = groups.map((g) => g.id);

  const categories = db
    .select()
    .from(navCategories)
    .all()
    .filter((c) => groupIds.includes(c.groupId));
  const catIds = categories.map((c) => c.id);

  const items = db
    .select()
    .from(navItems)
    .all()
    .filter((i) => {
      // 卡片归属判断：通过 groupId 或 categoryId 链路
      if (i.groupId && groupIds.includes(i.groupId)) return true;
      if (i.categoryId && catIds.includes(i.categoryId)) return true;
      return false;
    });

  // 该用户的点击记录
  const clicks = db
    .select()
    .from(navItemClicks)
    .where(eq(navItemClicks.userId, userId))
    .all();

  // 备份 payload（不含 passwordHash / role / status 等敏感或系统字段）
  const payload = {
    user: {
      displayName: userRow.displayName,
      email: userRow.email,
      bio: userRow.bio,
      avatar: userRow.avatar,
      theme: userRow.theme,
    },
    navGroups: groups,
    navCategories: categories,
    navItems: items,
    navItemClicks: clicks,
  };

  // 加密
  const key = deriveUserBackupKey(userId);
  const encrypted = aesEncrypt(Buffer.from(JSON.stringify(payload), 'utf8'), key);

  const backup = {
    version: USER_BACKUP_VERSION,
    type: 'mynav-user-backup',
    createdAt: new Date().toISOString(),
    userId,
    username: userRow.username,
    ...encrypted,
  };

  // 打包为 ZIP
  const zipBuffer = createZip([
    {
      name: USER_BACKUP_ENTRY,
      data: Buffer.from(JSON.stringify(backup, null, 2), 'utf8'),
    },
  ]);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="mynav-user-${userRow.username}-${Date.now()}.zip"`,
  );
  res.end(zipBuffer);
});

/**
 * POST /api/user/backup/import
 * body: { zip: base64 } —— ZIP 文件的 base64 编码
 * 解压后取 backup.json，解密并导入：替换当前用户的所有私有导航数据
 *
 * 安全约束：
 * - 必须使用当前登录用户的 ID 派生密钥解密，确保备份文件属于此账号
 *   （从其他账号导出的文件无法解密，AES-GCM 认证会失败）
 * - 全程在 SQLite 事务中执行，失败自动回滚
 */
userRouter.post('/backup/import', (req, res) => {
  const userId = req.user!.id;
  const { zip: zipBase64 } = req.body ?? {};

  if (!zipBase64 || typeof zipBase64 !== 'string') {
    res.status(400).json({ error: '缺少 zip 字段（base64 编码的 ZIP 文件）' });
    return;
  }

  // 解码 base64 → 解压 ZIP → 读取 backup.json
  let backupObj: {
    version?: number;
    type?: string;
    iv?: string;
    tag?: string;
    data?: string;
  };
  try {
    const zipBuf = Buffer.from(zipBase64, 'base64');
    const jsonBuf = readZipFile(zipBuf, USER_BACKUP_ENTRY);
    backupObj = JSON.parse(jsonBuf.toString('utf8'));
  } catch {
    res.status(400).json({ error: 'ZIP 文件解析失败：格式无效或缺少 backup.json' });
    return;
  }

  if (backupObj.type !== 'mynav-user-backup') {
    res.status(400).json({ error: '备份文件类型不正确，请选择用户数据备份文件' });
    return;
  }
  if (!backupObj.iv || !backupObj.tag || !backupObj.data) {
    res.status(400).json({ error: '备份数据不完整（缺少 iv/tag/data）' });
    return;
  }

  // 用当前用户 ID 派生密钥并解密
  const key = deriveUserBackupKey(userId);
  let payloadBuffer: Buffer;
  try {
    payloadBuffer = aesDecrypt(
      { iv: backupObj.iv, tag: backupObj.tag, data: backupObj.data },
      key,
    );
  } catch {
    res.status(400).json({ error: '解密失败：备份数据可能不属于此账号或已损坏' });
    return;
  }

  // 解析 payload
  let payload: {
    user?: {
      displayName?: string | null;
      email?: string | null;
      bio?: string | null;
      avatar?: string | null;
      theme?: string | null;
    };
    navGroups?: Array<{
      id: number;
      name: string;
      orderIndex?: number;
      isPublic?: number;
      ownerId?: number | null;
    }>;
    navCategories?: Array<{
      id: number;
      name: string;
      groupId: number;
      orderIndex?: number;
    }>;
    navItems?: Array<{
      id: number;
      title: string;
      url: string;
      icon?: string | null;
      categoryId?: number | null;
      groupId?: number | null;
      orderIndex?: number;
      color?: string;
      shape?: 'rounded' | 'square';
      size?: 'sm' | 'md' | 'lg';
      note?: string | null;
    }>;
    navItemClicks?: Array<{
      id: number;
      itemId: number;
      userId?: number | null;
      clickCount?: number;
      lastClickedAt?: Date | number;
    }>;
  };
  try {
    payload = JSON.parse(payloadBuffer.toString('utf8'));
  } catch {
    res.status(400).json({ error: '备份数据格式无效' });
    return;
  }

  // 在事务中执行：先清空当前数据，再插入备份数据
  const importResult = sqlite.transaction(() => {
    // 1. 删除用户当前所有私有导航数据（CASCADE 会级联删除分类与卡片）
    const currentGroups = db
      .select({ id: navGroups.id })
      .from(navGroups)
      .where(and(eq(navGroups.ownerId, userId), eq(navGroups.isPublic, 0)))
      .all();
    for (const g of currentGroups) {
      db.delete(navGroups).where(eq(navGroups.id, g.id)).run();
    }
    // 删除该用户的所有点击记录（itemId 已失效，将根据备份重建）
    db.delete(navItemClicks).where(eq(navItemClicks.userId, userId)).run();

    // 2. 恢复用户基础信息（不恢复 passwordHash/role/status 等系统字段）
    const userPatch: Record<string, unknown> = {};
    const u = payload.user;
    if (u) {
      if (u.displayName !== undefined) userPatch.displayName = u.displayName;
      if (u.email !== undefined) userPatch.email = u.email;
      if (u.bio !== undefined) userPatch.bio = u.bio;
      if (u.avatar !== undefined) userPatch.avatar = u.avatar;
      if (u.theme !== undefined) userPatch.theme = u.theme;
    }
    if (Object.keys(userPatch).length > 0) {
      db.update(users).set(userPatch).where(eq(users.id, userId)).run();
    }

    // 3. 重建导航数据（外键关系需保持，ID 重新分配）
    // ID 映射：旧 ID -> 新 ID
    const groupIdMap = new Map<number, number>();
    const categoryIdMap = new Map<number, number>();
    const itemIdMap = new Map<number, number>(); // 用于恢复点击记录

    for (const g of payload.navGroups ?? []) {
      const created = db
        .insert(navGroups)
        .values({
          name: g.name,
          orderIndex: g.orderIndex ?? 0,
          isPublic: 0, // 强制私有，避免备份恢复后变成公共分组
          ownerId: userId,
        })
        .returning()
        .get();
      groupIdMap.set(g.id, created.id);
    }

    for (const c of payload.navCategories ?? []) {
      const newGroupId = groupIdMap.get(c.groupId);
      if (!newGroupId) continue; // 跳过孤儿分类
      const created = db
        .insert(navCategories)
        .values({
          name: c.name,
          groupId: newGroupId,
          orderIndex: c.orderIndex ?? 0,
        })
        .returning()
        .get();
      categoryIdMap.set(c.id, created.id);
    }

    for (const i of payload.navItems ?? []) {
      const newGroupId = i.groupId ? groupIdMap.get(i.groupId) ?? null : null;
      const newCatId = i.categoryId ? categoryIdMap.get(i.categoryId) ?? null : null;
      // 卡片必须归属某个分组或分类，否则跳过
      if (!newGroupId && !newCatId) continue;

      const created = db
        .insert(navItems)
        .values({
          title: i.title,
          url: i.url,
          icon: i.icon ?? null,
          categoryId: newCatId,
          groupId: newGroupId,
          orderIndex: i.orderIndex ?? 0,
          color: i.color ?? '#1f2937',
          shape: i.shape === 'square' ? 'square' : 'rounded',
          size: ['sm', 'md', 'lg'].includes(i.size ?? '') ? i.size! : 'sm',
          note: i.note ?? null,
        })
        .returning()
        .get();
      itemIdMap.set(i.id, created.id);
    }

    // 4. 恢复点击记录（重新映射 itemId）
    for (const c of payload.navItemClicks ?? []) {
      const newItemId = itemIdMap.get(c.itemId);
      if (!newItemId) continue; // 卡片已被跳过，对应点击记录也跳过
      db.insert(navItemClicks)
        .values({
          itemId: newItemId,
          userId, // 强制归属当前用户
          clickCount: c.clickCount ?? 1,
          lastClickedAt: c.lastClickedAt
            ? new Date(c.lastClickedAt as unknown as string | number)
            : new Date(),
        })
        .run();
    }

    return {
      groups: groupIdMap.size,
      categories: categoryIdMap.size,
      items: itemIdMap.size,
      clicks: payload.navItemClicks?.length ?? 0,
    };
  })();

  res.json({
    ok: true,
    message: '数据已恢复',
    stats: importResult,
  });
});
