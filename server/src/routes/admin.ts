/**
 * 管理后台路由 /api/admin
 * ------------------------------------------------------------------
 * 全部需要 Admin 鉴权（authMiddleware + roleMiddleware）。
 *
 * 导航相关：
 * - GET  /api/admin/nav        查询所有公共导航数据
 * - POST /api/admin/group      创建分组
 * - POST /api/admin/item       创建卡片（接收 color/shape/size）
 * - PUT  /api/admin/item/:id   更新卡片
 * - POST /api/admin/category   创建分类（辅助接口）
 *
 * 用户管理相关：
 * - GET    /api/admin/users           用户列表
 * - POST   /api/admin/users           创建用户（含基础信息）
 * - PUT    /api/admin/users/:id       更新用户（角色/状态/昵称/邮箱/简介）
 * - PUT    /api/admin/users/:id/password  管理员重置用户密码
 * - DELETE /api/admin/users/:id       删除用户
 */
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db, sqlite } from '../db/index.js';
import {
  navGroups,
  navCategories,
  navItems,
  navItemClicks,
  passwordResets,
  users,
  settings as settingsTable,
} from '../db/schema.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { roleMiddleware } from '../middleware/roleMiddleware.js';
import {
  rsaDecrypt,
  regenerateKeyPair,
  getKeyPairInfo,
  aesEncrypt,
  aesDecrypt,
  deriveAdminBackupKey,
  generatePbkdf2Salt,
} from '../crypto.js';
import { createZip, readZipFile } from '../zip.js';

export const adminRouter = Router();

// 全部路由都先经过鉴权 + 角色校验
adminRouter.use(authMiddleware, roleMiddleware);

/**
 * PUT /api/admin/rsa/regenerate
 * 重新生成 RSA 密钥对（重生成后旧密钥加密的密码将无法解密，用户需刷新页面获取新公钥）
 */
adminRouter.put('/rsa/regenerate', (_req, res) => {
  const kp = regenerateKeyPair();
  res.json({
    ok: true,
    publicKey: kp.publicKeyPem,
    createdAt: kp.createdAt,
    message: 'RSA 密钥对已重新生成',
  });
});

/**
 * GET /api/admin/rsa/public-key
 * 管理员查看当前 RSA 公钥与创建时间
 */
adminRouter.get('/rsa/public-key', (_req, res) => {
  const info = getKeyPairInfo();
  res.json({ publicKey: info.publicKeyPem, createdAt: info.createdAt });
});

/**
 * GET /api/admin/nav
 * 管理视图：返回所有公共分组及其分类、卡片
 */
adminRouter.get('/nav', (_req, res) => {
  const groups = db.select().from(navGroups).where(eq(navGroups.isPublic, 1)).all();
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
    .filter((i) => i.categoryId !== null && catIds.includes(i.categoryId));

  const tree = groups
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    .map((g) => ({
      ...g,
      categories: categories
        .filter((c) => c.groupId === g.id)
        .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
        .map((c) => ({
          ...c,
          items: items
            .filter((i) => i.categoryId === c.id)
            .sort((a, b) => a.title.localeCompare(b.title, 'zh')),
        })),
    }));

  res.json(tree);
});

/**
 * POST /api/admin/group
 * 创建分组
 * body: { name, isPublic?, orderIndex?, ownerId? }
 */
adminRouter.post('/group', (req, res) => {
  const { name, isPublic = 1, orderIndex = 0, ownerId = null } = req.body ?? {};
  if (!name) {
    res.status(400).json({ error: '分组名称不能为空' });
    return;
  }

  const created = db
    .insert(navGroups)
    .values({ name, isPublic: isPublic ? 1 : 0, orderIndex, ownerId })
    .returning()
    .get();

  res.status(201).json(created);
});

/**
 * POST /api/admin/category
 * 创建分类
 * body: { name, groupId, orderIndex? }
 */
adminRouter.post('/category', (req, res) => {
  const { name, groupId, orderIndex = 0 } = req.body ?? {};
  if (!name || !groupId) {
    res.status(400).json({ error: '分类名称和所属分组不能为空' });
    return;
  }

  const created = db
    .insert(navCategories)
    .values({ name, groupId, orderIndex })
    .returning()
    .get();

  res.status(201).json(created);
});

/**
 * POST /api/admin/item
 * 创建卡片（接收 color/shape/size/note）
 * body: { title, url, icon?, groupId, categoryId?, orderIndex?, color?, shape?, size?, note? }
 */
adminRouter.post('/item', (req, res) => {
  const {
    title,
    url,
    icon = null,
    groupId,
    categoryId = null,
    orderIndex = 0,
    color = '#1f2937',
    shape = 'rounded',
    size = 'sm',
    note = null,
  } = req.body ?? {};

  if (!title || !url || !groupId) {
    res.status(400).json({ error: '标题、链接和所属分组不能为空' });
    return;
  }

  // 校验枚举值，防止非法数据入库
  if (!['rounded', 'square'].includes(shape)) {
    res.status(400).json({ error: "shape 必须为 'rounded' 或 'square'" });
    return;
  }
  if (!['sm', 'md', 'lg'].includes(size)) {
    res.status(400).json({ error: "size 必须为 'sm' | 'md' | 'lg'" });
    return;
  }

  const created = db
    .insert(navItems)
    .values({ title, url, icon, categoryId, groupId, orderIndex, color, shape, size, note })
    .returning()
    .get();

  res.status(201).json(created);
});

/**
 * PUT /api/admin/item/:id
 * 更新卡片
 * body: 任意可更新字段 { title?, url?, icon?, categoryId?, orderIndex?, color?, shape?, size?, note? }
 */
adminRouter.put('/item/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: '无效的卡片 ID' });
    return;
  }

  // 检查卡片是否存在
  const existing = db.select().from(navItems).where(eq(navItems.id, id)).get();
  if (!existing) {
    res.status(404).json({ error: '卡片不存在' });
    return;
  }

  const { title, url, icon, categoryId, orderIndex, color, shape, size, note } = req.body ?? {};

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
 * DELETE /api/admin/group/:id
 * 删除分组（cascade 级联删除其下所有分类和卡片）
 */
adminRouter.delete('/group/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: '无效的分组 ID' });
    return;
  }
  db.delete(navGroups).where(eq(navGroups.id, id)).run();
  res.json({ ok: true });
});

/**
 * DELETE /api/admin/category/:id
 * 删除分类（cascade 级联删除其下所有卡片）
 */
adminRouter.delete('/category/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: '无效的分类 ID' });
    return;
  }
  db.delete(navCategories).where(eq(navCategories.id, id)).run();
  res.json({ ok: true });
});

/**
 * DELETE /api/admin/item/:id
 * 删除单个卡片
 */
adminRouter.delete('/item/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: '无效的卡片 ID' });
    return;
  }
  db.delete(navItems).where(eq(navItems.id, id)).run();
  res.json({ ok: true });
});

/* ============================== 用户管理 ============================== */

/**
 * 工具：把 users 行转成对外 DTO，剔除 passwordHash / theme 等敏感字段
 */
function toAdminUserDTO(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    displayName: row.displayName,
    email: row.email,
    bio: row.bio,
    avatar: row.avatar,
    status: row.status,
    createdAt: row.createdAt,
  };
}

/**
 * GET /api/admin/users
 * 返回所有用户列表（按 id 升序），不含密码哈希
 */
adminRouter.get('/users', (_req, res) => {
  const rows = db.select().from(users).all();
  res.json({ users: rows.map(toAdminUserDTO) });
});

/**
 * POST /api/admin/users
 * 管理员创建新用户（与 /api/auth/register 等价，但放在 admin 命名空间便于权限理解）
 * body: { username, password, role?, displayName?, email?, bio? }
 */
adminRouter.post('/users', (req, res) => {
  const { username, password: encryptedPassword, role, displayName, email, bio } = req.body ?? {};

  // RSA 解密密码
  let password: string;
  try {
    password = rsaDecrypt(encryptedPassword);
  } catch {
    res.status(400).json({ error: '密码解密失败，请刷新页面后重试' });
    return;
  }

  if (!username || !password) {
    res.status(400).json({ error: '用户名和密码不能为空' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: '密码长度不能少于 6 位' });
    return;
  }

  const exists = db.select().from(users).where(eq(users.username, username)).get();
  if (exists) {
    res.status(409).json({ error: '用户名已存在' });
    return;
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: '邮箱格式无效' });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const created = db
    .insert(users)
    .values({
      username,
      passwordHash,
      role: role === 'ADMIN' ? 'ADMIN' : 'USER',
      displayName: displayName || null,
      email: email || null,
      bio: bio || null,
    })
    .returning()
    .get();

  res.status(201).json({ user: toAdminUserDTO(created) });
});

/**
 * PUT /api/admin/users/:id
 * 管理员更新指定用户：角色、状态、昵称、邮箱、简介
 * body: { role?, status?, displayName?, email?, bio? }
 *
 * 安全约束：
 * - 不可修改自己的角色与状态（防止误把自己降级/禁用）
 * - 不可把系统内最后一个 ADMIN 降级为 USER（防止失去管理员）
 */
adminRouter.put('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: '无效的用户 ID' });
    return;
  }

  const existing = db.select().from(users).where(eq(users.id, id)).get();
  if (!existing) {
    res.status(404).json({ error: '用户不存在' });
    return;
  }

  const { role, status, displayName, email, bio } = req.body ?? {};
  const currentUserId = req.user!.id;
  const isSelf = id === currentUserId;

  const patch: Record<string, unknown> = {};

  // 角色变更
  if (role !== undefined) {
    if (!['USER', 'ADMIN'].includes(role)) {
      res.status(400).json({ error: "role 必须为 'USER' 或 'ADMIN'" });
      return;
    }
    if (isSelf && existing.role === 'ADMIN' && role !== 'ADMIN') {
      res.status(400).json({ error: '不能取消自己的管理员角色' });
      return;
    }
    // 降级最后一个 ADMIN 检查
    if (existing.role === 'ADMIN' && role === 'USER') {
      const adminCount = db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'ADMIN'))
        .all().length;
      if (adminCount <= 1) {
        res.status(400).json({ error: '系统至少需要保留一个管理员' });
        return;
      }
    }
    patch.role = role;
  }

  // 状态变更
  if (status !== undefined) {
    if (!['active', 'disabled'].includes(status)) {
      res.status(400).json({ error: "status 必须为 'active' 或 'disabled'" });
      return;
    }
    if (isSelf && status !== 'active') {
      res.status(400).json({ error: '不能禁用自己的账户' });
      return;
    }
    patch.status = status;
  }

  // 昵称
  if (displayName !== undefined) {
    if (typeof displayName !== 'string' || displayName.length > 32) {
      res.status(400).json({ error: '昵称长度不能超过 32 字符' });
      return;
    }
    patch.displayName = displayName.trim() || null;
  }

  // 邮箱
  if (email !== undefined) {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: '邮箱格式无效' });
      return;
    }
    patch.email = (email || '').trim() || null;
  }

  // 简介
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

  db.update(users).set(patch).where(eq(users.id, id)).run();
  const updated = db.select().from(users).where(eq(users.id, id)).get();
  res.json({ user: toAdminUserDTO(updated!) });
});

/**
 * PUT /api/admin/users/:id/password
 * 管理员重置用户密码（无需旧密码）
 * body: { newPassword(加密) }
 */
adminRouter.put('/users/:id/password', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: '无效的用户 ID' });
    return;
  }

  const { newPassword: encryptedNewPassword } = req.body ?? {};
  if (!encryptedNewPassword) {
    res.status(400).json({ error: '新密码不能为空' });
    return;
  }

  // RSA 解密新密码
  let newPassword: string;
  try {
    newPassword = rsaDecrypt(encryptedNewPassword);
  } catch {
    res.status(400).json({ error: '密码解密失败，请刷新页面后重试' });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: '新密码长度不能少于 6 位' });
    return;
  }

  const existing = db.select({ id: users.id }).from(users).where(eq(users.id, id)).get();
  if (!existing) {
    res.status(404).json({ error: '用户不存在' });
    return;
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.update(users)
    .set({ passwordHash: newHash })
    .where(eq(users.id, id))
    .run();

  res.json({ ok: true });
});

/**
 * DELETE /api/admin/users/:id
 * 删除用户
 * 安全约束：
 * - 不可删除自己
 * - 不可删除最后一个 ADMIN（同降级保护）
 */
adminRouter.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: '无效的用户 ID' });
    return;
  }

  const currentUserId = req.user!.id;
  if (id === currentUserId) {
    res.status(400).json({ error: '不能删除自己的账户' });
    return;
  }

  const existing = db.select().from(users).where(eq(users.id, id)).get();
  if (!existing) {
    res.status(404).json({ error: '用户不存在' });
    return;
  }

  if (existing.role === 'ADMIN') {
    const adminCount = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'ADMIN'))
      .all().length;
    if (adminCount <= 1) {
      res.status(400).json({ error: '系统至少需要保留一个管理员' });
      return;
    }
  }

  db.delete(users).where(eq(users.id, id)).run();
  res.json({ ok: true });
});

/* ============================== 服务器数据备份 ============================== */

/**
 * 服务器全量数据备份 / 恢复（管理员专用）
 * ------------------------------------------------------------------
 * - 备份范围：所有表的全量数据（users 含 passwordHash，settings 排除 rsa_keys）
 * - 加密方式：AES-256-GCM，密钥由管理员自定义密码 + 随机盐 PBKDF2 派生（100k 迭代）
 * - 文件格式：ZIP 文件，内含 backup.json（加密载荷）
 * - 恢复策略：清空所有业务表后按备份恢复，全程在事务中执行
 *
 * 安全提示：
 * - 自定义密码不会保存在服务器，丢失密码将无法解密备份文件
 * - 备份文件包含所有用户密码哈希与系统设置，请妥善保管
 * - 恢复后 RSA 密钥对保持当前服务器不变（不导入/导出 rsa_keys）
 *   因此用户登录密码（bcrypt hash）保持有效，但旧 RSA 公钥加密的注册/改密请求需刷新页面
 *
 * ZIP 内文件结构：
 *   backup.json —— { version, type, createdAt, salt, iv, tag, data }
 */
const SERVER_BACKUP_VERSION = 1;
const SERVER_BACKUP_ENTRY = 'backup.json';

/**
 * POST /api/admin/backup/export
 * body: { password }
 * 导出整个服务器的数据（加密后打包为 ZIP 返回）
 */
adminRouter.post('/backup/export', (req, res) => {
  const { password } = req.body ?? {};
  if (!password || typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: '备份密码不能为空且至少 6 位' });
    return;
  }

  // 收集所有表的全量数据
  const allUsers = db.select().from(users).all();
  const allGroups = db.select().from(navGroups).all();
  const allCategories = db.select().from(navCategories).all();
  const allItems = db.select().from(navItems).all();
  const allClicks = db.select().from(navItemClicks).all();
  // 排除 rsa_keys（不导出私钥，避免泄露）
  const allSettings = db
    .select()
    .from(settingsTable)
    .all()
    .filter((s) => s.key !== 'rsa_keys');
  // 不导出 password_resets（一次性令牌，恢复无意义）

  const payload = {
    users: allUsers,
    navGroups: allGroups,
    navCategories: allCategories,
    navItems: allItems,
    navItemClicks: allClicks,
    settings: allSettings,
  };

  // 派生密钥（每次导出生成新盐）
  const salt = generatePbkdf2Salt();
  const key = deriveAdminBackupKey(password, salt);
  const encrypted = aesEncrypt(Buffer.from(JSON.stringify(payload), 'utf8'), key);

  const backup = {
    version: SERVER_BACKUP_VERSION,
    type: 'mynav-server-backup',
    createdAt: new Date().toISOString(),
    salt: salt.toString('base64'),
    ...encrypted,
  };

  // 打包为 ZIP
  const zipBuffer = createZip([
    {
      name: SERVER_BACKUP_ENTRY,
      data: Buffer.from(JSON.stringify(backup, null, 2), 'utf8'),
    },
  ]);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="mynav-server-${new Date().toISOString().slice(0, 10)}.zip"`,
  );
  res.end(zipBuffer);
});

/**
 * POST /api/admin/backup/import
 * body: { password, zip }  —— zip 为 base64 编码的 ZIP 文件
 * 解压后取 backup.json，使用 password 解密并全量恢复服务器数据
 *
 * 注意：恢复后当前管理员账号将被替换为备份中的账号，需重新登录
 */
adminRouter.post('/backup/import', (req, res) => {
  const { password, zip: zipBase64 } = req.body ?? {};

  if (!password || !zipBase64) {
    res.status(400).json({ error: '缺少 password 或 zip 字段' });
    return;
  }

  // 解码 base64 → 解压 ZIP → 读取 backup.json
  let backupObj: {
    version?: number;
    type?: string;
    salt?: string;
    iv?: string;
    tag?: string;
    data?: string;
  };
  try {
    const zipBuf = Buffer.from(zipBase64, 'base64');
    const jsonBuf = readZipFile(zipBuf, SERVER_BACKUP_ENTRY);
    backupObj = JSON.parse(jsonBuf.toString('utf8'));
  } catch {
    res.status(400).json({ error: 'ZIP 文件解析失败：格式无效或缺少 backup.json' });
    return;
  }

  if (backupObj.type !== 'mynav-server-backup') {
    res.status(400).json({ error: '备份文件类型不正确，请选择服务器数据备份文件' });
    return;
  }
  if (!backupObj.salt || !backupObj.iv || !backupObj.tag || !backupObj.data) {
    res.status(400).json({ error: '备份数据不完整（缺少 salt/iv/tag/data）' });
    return;
  }

  // 派生密钥并解密
  const saltBuf = Buffer.from(backupObj.salt, 'base64');
  const key = deriveAdminBackupKey(password, saltBuf);
  let payloadBuffer: Buffer;
  try {
    payloadBuffer = aesDecrypt(
      { iv: backupObj.iv, tag: backupObj.tag, data: backupObj.data },
      key,
    );
  } catch {
    res.status(400).json({ error: '解密失败：密码错误或备份数据已损坏' });
    return;
  }

  // 解析 payload
  let payload: {
    users?: Array<typeof users.$inferSelect>;
    navGroups?: Array<typeof navGroups.$inferSelect>;
    navCategories?: Array<typeof navCategories.$inferSelect>;
    navItems?: Array<typeof navItems.$inferSelect>;
    navItemClicks?: Array<typeof navItemClicks.$inferSelect>;
    settings?: Array<typeof settingsTable.$inferSelect>;
  };
  try {
    payload = JSON.parse(payloadBuffer.toString('utf8'));
  } catch {
    res.status(400).json({ error: '备份数据格式无效' });
    return;
  }

  if (!payload.users || payload.users.length === 0) {
    res.status(400).json({ error: '备份数据无效：未包含任何用户' });
    return;
  }

  // 在事务中全量恢复
  const stats = sqlite.transaction(() => {
    // 1. 备份当前 RSA 密钥对（恢复后保留，避免登录失效）
    const rsaRow = db
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, 'rsa_keys'))
      .get();

    // 2. 清空所有业务表（按依赖逆序删除）
    db.delete(navItemClicks).run();
    db.delete(navItems).run();
    db.delete(navCategories).run();
    db.delete(navGroups).run();
    db.delete(passwordResets).run();
    db.delete(users).run();
    db.delete(settingsTable).run();

    // 3. 恢复 users（含 passwordHash，保证登录密码可用）
    for (const u of payload.users ?? []) {
      db.insert(users)
        .values({
          id: u.id,
          username: u.username,
          passwordHash: u.passwordHash,
          role: u.role,
          theme: u.theme,
          displayName: u.displayName,
          email: u.email,
          bio: u.bio,
          avatar: u.avatar,
          status: u.status,
          failedLoginAttempts: u.failedLoginAttempts,
          lockedUntil: u.lockedUntil,
          createdAt: u.createdAt,
        })
        .run();
    }

    // 4. 恢复 settings（备份中已排除 rsa_keys）
    for (const s of payload.settings ?? []) {
      db.insert(settingsTable)
        .values({ key: s.key, value: s.value })
        .run();
    }

    // 重新写入当前服务器的 RSA 密钥对（保留登录加密能力）
    if (rsaRow) {
      db.insert(settingsTable)
        .values({ key: 'rsa_keys', value: rsaRow.value })
        .run();
    }

    // 5. 恢复 navGroups（按原 ID 顺序插入）
    for (const g of payload.navGroups ?? []) {
      db.insert(navGroups)
        .values({
          id: g.id,
          name: g.name,
          orderIndex: g.orderIndex,
          isPublic: g.isPublic,
          ownerId: g.ownerId,
        })
        .run();
    }

    // 6. 恢复 navCategories
    for (const c of payload.navCategories ?? []) {
      db.insert(navCategories)
        .values({
          id: c.id,
          name: c.name,
          groupId: c.groupId,
          orderIndex: c.orderIndex,
        })
        .run();
    }

    // 7. 恢复 navItems
    for (const i of payload.navItems ?? []) {
      db.insert(navItems)
        .values({
          id: i.id,
          title: i.title,
          url: i.url,
          icon: i.icon,
          categoryId: i.categoryId,
          groupId: i.groupId,
          orderIndex: i.orderIndex,
          color: i.color,
          shape: i.shape,
          size: i.size,
          note: i.note,
        })
        .run();
    }

    // 8. 恢复 navItemClicks
    for (const c of payload.navItemClicks ?? []) {
      db.insert(navItemClicks)
        .values({
          id: c.id,
          itemId: c.itemId,
          userId: c.userId,
          clickCount: c.clickCount,
          lastClickedAt: c.lastClickedAt,
        })
        .run();
    }

    return {
      users: payload.users?.length ?? 0,
      navGroups: payload.navGroups?.length ?? 0,
      navCategories: payload.navCategories?.length ?? 0,
      navItems: payload.navItems?.length ?? 0,
      navItemClicks: payload.navItemClicks?.length ?? 0,
      settings: payload.settings?.length ?? 0,
    };
  })();

  res.json({
    ok: true,
    message: '服务器数据已恢复，请使用备份文件中的账号重新登录',
    stats,
  });
});
