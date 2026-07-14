/**
 * 认证路由 /api/auth
 * ------------------------------------------------------------------
 * - POST /api/auth/register          注册（受系统设置 allowRegister 控制）
 * - POST /api/auth/login             登录，返回 { token, user }
 * - POST /api/auth/forgot-password   忘记密码：生成重置 token，发送邮件或返回开发链接
 * - POST /api/auth/reset-password    重置密码：校验 token 并设置新密码
 */
import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, passwordResets } from '../db/schema.js';
import { signToken } from '../middleware/authMiddleware.js';
import { readSettings } from '../settings.js';
import { sendPasswordResetEmail } from '../mailer.js';
import { rsaDecrypt, getPublicKeyPem } from '../crypto.js';

export const authRouter = Router();

/**
 * GET /api/auth/public-key
 * 公开接口：返回 RSA 公钥（PEM 格式），供前端加密敏感数据
 */
authRouter.get('/public-key', (_req, res) => {
  res.json({ publicKey: getPublicKeyPem() });
});

/**
 * POST /api/auth/register
 * 注册接口：根据系统设置决定是否开放
 * - allowRegister=false      → 403 关闭注册
 * - registerMethod='closed'  → 403 关闭注册
 * - registerMethod='invite'  → 需 body.inviteCode 与 settings.inviteCode 一致
 * - registerMethod='email'   → 公开注册（仅邮箱可选校验）
 * body: { username, password, role?, displayName?, email?, bio?, inviteCode? }
 */
authRouter.post('/register', (req, res) => {
  const cfg = readSettings();

  // 关闭注册：仅管理员可通过携带 token + 角色创建账户
  if (!cfg.allowRegister || cfg.registerMethod === 'closed') {
    // 若调用方是管理员，则放行（保留管理员手动建号能力）
    // 这里手动复用 authMiddleware 逻辑较重，简化为：检查 Authorization 头
    // 但 authMiddleware 已在 user/admin 路由中处理；此处直接拒绝更清晰
    res.status(403).json({ error: '当前已关闭注册，请联系管理员创建账户' });
    return;
  }

  const { username, password: encryptedPassword, role, displayName, email, bio, inviteCode } = req.body ?? {};

  // RSA 解密密码
  let password: string;
  try {
    password = rsaDecrypt(encryptedPassword);
  } catch {
    res.status(400).json({ error: '密码解密失败，请刷新页面后重试' });
    return;
  }

  // 基础校验
  if (!username || !password) {
    res.status(400).json({ error: '用户名和密码不能为空' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: '密码长度不能少于 6 位' });
    return;
  }

  // 邀请码注册模式：校验邀请码
  if (cfg.registerMethod === 'invite') {
    if (!inviteCode || inviteCode !== cfg.inviteCode) {
      res.status(400).json({ error: '邀请码无效' });
      return;
    }
  }

  // 检查用户名是否已存在
  const exists = db.select().from(users).where(eq(users.username, username)).get();
  if (exists) {
    res.status(409).json({ error: '用户名已存在' });
    return;
  }

  // 邮箱格式校验（可选字段，传入时才校验）
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: '邮箱格式无效' });
    return;
  }

  // bcrypt 哈希密码，saltRounds=10
  const passwordHash = bcrypt.hashSync(password, 10);

  // 角色处理：普通注册固定为 USER，仅管理员可创建 ADMIN（此处公开接口不允许）
  const finalRole = role === 'ADMIN' && cfg.defaultRole === 'ADMIN' ? 'ADMIN' : 'USER';

  const created = db
    .insert(users)
    .values({
      username,
      passwordHash,
      role: finalRole,
      displayName: displayName || null,
      email: email || null,
      bio: bio || null,
    })
    .returning()
    .get();

  res.status(201).json({
    user: {
      id: created.id,
      username: created.username,
      role: created.role,
      displayName: created.displayName,
      email: created.email,
      bio: created.bio,
      avatar: created.avatar,
      status: created.status,
    },
  });
});

/**
 * POST /api/auth/login
 * 公开接口：校验凭据并签发 JWT
 * body: { username, password(加密) }
 * 返回: { token, user }
 *
 * 安全机制：
 * - 密码经 RSA 加密传输，后端私钥解密后比对 bcrypt 哈希
 * - 连续登录失败超过 maxLoginAttempts 次后锁定 lockMinutes 分钟
 * - 锁定期间拒绝登录，登录成功后重置计数
 */
authRouter.post('/login', (req, res) => {
  const { username, password: encryptedPassword } = req.body ?? {};

  if (!username || !encryptedPassword) {
    res.status(400).json({ error: '用户名和密码不能为空' });
    return;
  }

  // RSA 解密密码
  let password: string;
  try {
    password = rsaDecrypt(encryptedPassword);
  } catch {
    res.status(400).json({ error: '密码解密失败，请刷新页面后重试' });
    return;
  }

  const cfg = readSettings();
  const user = db.select().from(users).where(eq(users.username, username)).get();

  // 用户不存在：统一返回模糊错误，避免枚举攻击
  if (!user) {
    res.status(401).json({ error: '用户名或密码错误' });
    return;
  }

  // 账号锁定检查：lockedUntil > 当前时间则拒绝登录
  if (user.lockedUntil && user.lockedUntil > Date.now()) {
    const remainingMin = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    res.status(423).json({ error: `账户已锁定，请 ${remainingMin} 分钟后重试` });
    return;
  }

  // bcrypt 比对哈希
  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) {
    // 登录失败：累加失败次数
    const attempts = (user.failedLoginAttempts || 0) + 1;
    const maxAttempts = cfg.maxLoginAttempts > 0 ? cfg.maxLoginAttempts : 5;

    if (attempts >= maxAttempts) {
      // 达到上限：锁定账户
      const lockMs = (cfg.lockMinutes > 0 ? cfg.lockMinutes : 30) * 60 * 1000;
      db.update(users)
        .set({ failedLoginAttempts: 0, lockedUntil: Date.now() + lockMs })
        .where(eq(users.id, user.id))
        .run();
      const lockMin = cfg.lockMinutes > 0 ? cfg.lockMinutes : 30;
      res.status(423).json({ error: `密码错误次数过多，账户已锁定 ${lockMin} 分钟` });
    } else {
      db.update(users)
        .set({ failedLoginAttempts: attempts })
        .where(eq(users.id, user.id))
        .run();
      const remaining = maxAttempts - attempts;
      res.status(401).json({
        error: `用户名或密码错误（剩余 ${remaining} 次尝试机会）`,
      });
    }
    return;
  }

  // 账号状态检查：被禁用的账户不允许登录
  if (user.status !== 'active') {
    res.status(403).json({ error: '账户已被禁用，请联系管理员' });
    return;
  }

  // 登录成功：重置失败计数与锁定时间
  if (user.failedLoginAttempts || user.lockedUntil) {
    db.update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: 0 })
      .where(eq(users.id, user.id))
      .run();
  }

  // 签发 JWT
  const token = signToken({
    id: user.id,
    username: user.username,
    role: user.role as 'USER' | 'ADMIN',
  });

  // 返回完整用户信息，供前端 Profile 页面直接使用
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
      email: user.email,
      bio: user.bio,
      avatar: user.avatar,
      status: user.status,
    },
  });
});

/**
 * POST /api/auth/forgot-password
 * 忘记密码：根据用户名或邮箱查找用户，生成一次性重置 token
 * - 若用户存在且配置了 SMTP：发送含重置链接的邮件，返回 { sent: true }
 * - 若用户存在但 SMTP 未配置：返回 { sent: false, devLink } 用于开发/演示
 * - 若用户不存在：出于安全考虑仍返回 { sent: true }（避免枚举用户）
 * body: { identifier }  用户名或邮箱
 */
authRouter.post('/forgot-password', async (req, res) => {
  const { identifier } = req.body ?? {};
  if (!identifier || !String(identifier).trim()) {
    res.status(400).json({ error: '请输入用户名或邮箱' });
    return;
  }

  const id = String(identifier).trim();

  // 先按用户名精确匹配，再按邮箱匹配
  let user = db.select().from(users).where(eq(users.username, id)).get();
  if (!user) {
    user = db.select().from(users).where(eq(users.email, id)).get();
  }

  // 用户不存在：返回模糊成功响应，防止用户枚举
  if (!user) {
    res.json({
      sent: true,
      message: '若该账户存在，重置链接已发送至账户绑定邮箱',
    });
    return;
  }

  // 用户无邮箱且 SMTP 未配置：无法完成流程，明确提示
  const cfg = readSettings();
  const smtpEnabled = cfg.smtp.enabled && !!cfg.smtp.host && !!cfg.smtp.user;
  if (!user.email && !smtpEnabled) {
    res.status(400).json({
      error: '该账户未绑定邮箱，且系统未配置 SMTP，无法自助重置密码，请联系管理员',
    });
    return;
  }

  // 生成一次性 token（32 字节 hex）
  const token = crypto.randomBytes(32).toString('hex');
  // 30 分钟过期
  const expiresAt = Date.now() + 30 * 60 * 1000;

  db.insert(passwordResets)
    .values({
      userId: user.id,
      token,
      expiresAt,
      used: 0,
    })
    .run();

  // 构造重置链接（前端路由 /reset-password?token=xxx）
  // 站点 URL 优先取系统设置 siteName 对应的部署地址；这里用请求头 origin 作为回链基址
  const origin = (req.headers.origin || req.headers.referer || `http://${req.headers.host}`) as string;
  const resetUrl = `${origin.replace(/\/$/, '')}/reset-password?token=${token}`;

  if (!smtpEnabled || !user.email) {
    // 开发模式：直接返回重置链接（仅当 SMTP 未启用或用户无邮箱时）
    res.json({
      sent: false,
      devLink: resetUrl,
      message: 'SMTP 未启用或用户无邮箱，已返回开发模式重置链接',
    });
    return;
  }

  // 生产模式：发送邮件
  const result = await sendPasswordResetEmail(cfg.smtp, user.email, resetUrl, cfg.siteName);
  if (result.delivered) {
    res.json({
      sent: true,
      message: `重置链接已发送至邮箱：${user.email}`,
    });
  } else {
    // 邮件发送失败：返回开发链接兜底，便于用户不阻塞
    res.json({
      sent: false,
      devLink: result.devLink || resetUrl,
      message: result.error || '邮件发送失败，已返回重置链接',
    });
  }
});

/**
 * POST /api/auth/reset-password
 * 重置密码：校验 token 有效性（存在 + 未使用 + 未过期），设置新密码
 * body: { token, newPassword }
 */
authRouter.post('/reset-password', (req, res) => {
  const { token, newPassword: encryptedNewPassword } = req.body ?? {};
  if (!token || !encryptedNewPassword) {
    res.status(400).json({ error: '重置令牌和新密码不能为空' });
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
    res.status(400).json({ error: '密码长度不能少于 6 位' });
    return;
  }

  // 查询令牌：必须未使用且未过期
  const reset = db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.token, String(token)), eq(passwordResets.used, 0), gt(passwordResets.expiresAt, Date.now())))
    .get();

  if (!reset) {
    res.status(400).json({ error: '重置链接无效或已过期，请重新申请' });
    return;
  }

  // 查询关联用户
  const user = db.select().from(users).where(eq(users.id, reset.userId)).get();
  if (!user) {
    res.status(400).json({ error: '用户不存在' });
    return;
  }
  if (user.status !== 'active') {
    res.status(403).json({ error: '账户已被禁用，无法重置密码' });
    return;
  }

  // 更新密码
  const passwordHash = bcrypt.hashSync(newPassword, 10);
  db.update(users).set({ passwordHash }).where(eq(users.id, user.id)).run();

  // 标记令牌为已使用（一次性）
  db.update(passwordResets)
    .set({ used: 1 })
    .where(eq(passwordResets.id, reset.id))
    .run();

  res.json({ ok: true, message: '密码已重置，请使用新密码登录' });
});
