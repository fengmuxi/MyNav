/**
 * 邮件发送模块
 * ------------------------------------------------------------------
 * 设计原则：
 * - nodemailer 作为可选依赖：通过动态 import 引用，未安装时自动回退到开发模式
 * - 未启用 SMTP 或未安装 nodemailer 时，邮件函数返回 { delivered: false, devLink?/error? }
 *   调用方据此决定是否将验证码/链接返回给前端（仅开发模式）
 * - 启用且 nodemailer 可用时，发送邮件并返回 { delivered: true }
 *
 * 共 4 种邮件：
 * 1. sendVerificationCodeEmail  注册邮箱验证码
 * 2. sendLoginCodeEmail         登录验证码
 * 3. sendPasswordResetEmail     密码重置链接
 * 4. sendTestEmail              SMTP 测试邮件
 *
 * 生产环境使用流程：
 *   1. cd server && npm install nodemailer
 *   2. 管理后台 → 系统设置 → SMTP 配置 → 启用并填写 SMTP 服务器信息
 *   3. 用户在忘记密码页输入用户名/邮箱，系统自动发送含 token 的重置链接到用户邮箱
 */
import type { SmtpConfig } from './settings.js';
import {
  registerCodeTemplate,
  loginCodeTemplate,
  passwordResetTemplate,
  testEmailTemplate,
} from './mailTemplates.js';
import { logger } from './logger.js';

export interface SendMailResult {
  delivered: boolean;
  /** 开发模式下返回验证码或重置链接，供前端展示（生产环境为 undefined） */
  devLink?: string;
  error?: string;
}

/** 错误原因（便于路由层和前端识别） */
export type MailErrorReason =
  | 'smtp_disabled' // SMTP 未启用或配置不完整
  | 'no_nodemailer' // 未安装 nodemailer
  | 'send_failed' // 发送过程异常
  | 'unknown'; // 其他未知错误

export interface SendMailResultWithReason extends SendMailResult {
  /** 失败原因（delivered=false 时才有值） */
  reason?: MailErrorReason;
}

/**
 * 动态加载 nodemailer（可选依赖）
 * @returns transporter 或 null（未安装时）
 */
async function createTransporter(smtp: SmtpConfig): Promise<any | null> {
  let nodemailer: any;
  try {
    // @ts-expect-error - nodemailer 为可选依赖，未安装时该 import 会抛错
    nodemailer = await import('nodemailer');
  } catch (err) {
    logger.warn(`[Mailer] nodemailer 未安装，无法创建 transporter: ${(err as Error).message}`);
    return null;
  }
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });
}

/** 检查 SMTP 是否可用（启用 + 必填项完整） */
function isSmtpReady(smtp: SmtpConfig): boolean {
  return !!(smtp.enabled && smtp.host && smtp.user && smtp.pass);
}

/**
 * 构造发件人地址
 * ------------------------------------------------------------------
 * SMTP 服务器（如阿里云、QQ、网易、Gmail 等）通常要求：
 *   发件人邮箱（From）必须等于或属于认证用户（user）的邮箱地址，
 *   否则会返回 553 错误：Mail from must equal authorized user
 *
 * 兼容策略：
 * 1. 若 fromEmail 与 user 完全一致 → 直接使用
 * 2. 若 fromEmail 与 user 同域（@ 之后相同）→ 使用 fromEmail（部分企业邮箱允许同域别名）
 * 3. 若 fromEmail 与 user 不一致且不同域 → 回退使用 user 邮箱（保证 SMTP 校验通过），
 *    并通过 logger.warn 告知用户检查配置
 */
function buildFrom(smtp: SmtpConfig, siteName: string): string {
  const displayName = smtp.fromName || siteName;
  const userEmail = smtp.user;
  const fromEmail = smtp.fromEmail || userEmail;

  if (fromEmail === userEmail) {
    return `"${displayName}" <${fromEmail}>`;
  }

  // 同域判断：@ 之后的域名相同
  const userDomain = userEmail.split('@')[1];
  const fromDomain = fromEmail.split('@')[1];
  if (userDomain && fromDomain && userDomain.toLowerCase() === fromDomain.toLowerCase()) {
    return `"${displayName}" <${fromEmail}>`;
  }

  // 不一致且不同域：回退使用 user 邮箱，避免 553 错误
  logger.warn(
    `[Mailer] 发件人邮箱(${fromEmail})与认证用户(${userEmail})不一致或不同域，` +
    `已回退使用 ${userEmail} 作为发件人。请在 SMTP 配置中将 fromEmail 设置为 ${userEmail} 或同域邮箱。`,
  );
  return `"${displayName}" <${userEmail}>`;
}

/**
 * 将 nodemailer 抛出的 SMTP 错误转换为友好的中文提示
 * 常见错误码：
 * - 553  Mail from must equal authorized user（发件邮箱与认证用户不一致）
 * - 535  Authentication failed（认证失败：用户名/密码/授权码错误）
 * - 550  Mailbox not found / Access denied（收件人拒绝或被反垃圾）
 * - 421  Service not available（服务暂时不可用）
 * - 554  Message rejected（邮件被拒绝，通常是内容触发反垃圾规则）
 */
export function translateSmtpError(err: Error): string {
  const raw = err.message || '';
  if (/^\s*553\b/.test(raw) || /Mail from must equal authorized user/i.test(raw)) {
    return 'SMTP 拒绝发送：发件人邮箱与认证用户不一致（553）。请在管理后台 → 系统设置 → SMTP 配置中，将「发件人邮箱」设置为与「用户名」相同，或联系邮件服务商配置发件别名。';
  }
  if (/^\s*535\b/.test(raw) || /Authentication failed/i.test(raw)) {
    return 'SMTP 认证失败（535）。请检查用户名和密码/授权码是否正确（部分邮箱需使用授权码而非登录密码）。';
  }
  if (/^\s*550\b/.test(raw)) {
    return 'SMTP 拒绝发送（550）。可能是收件人被拒或被反垃圾拦截，请检查收件地址或邮件内容。';
  }
  if (/^\s*421\b/.test(raw)) {
    return 'SMTP 服务暂时不可用（421），请稍后重试。';
  }
  if (/^\s*554\b/.test(raw)) {
    return '邮件被拒绝（554），内容可能触发了反垃圾规则，请调整邮件内容后重试。';
  }
  if (/^\s*ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(raw)) {
    return '无法连接 SMTP 服务器，请检查服务器地址、端口和防火墙设置。';
  }
  // 默认返回原始错误信息
  return raw || '邮件发送失败';
}

/* ================================================================
   1. 注册验证码邮件
   ================================================================ */
export async function sendVerificationCodeEmail(
  smtp: SmtpConfig,
  to: string,
  code: string,
  siteName: string,
): Promise<SendMailResultWithReason> {
  if (!isSmtpReady(smtp)) {
    logger.info(`[Mailer] SMTP 未配置，注册验证码(${to}) 返回开发模式`);
    return {
      delivered: false,
      devLink: code,
      reason: 'smtp_disabled',
      error: 'SMTP 未配置，已返回开发模式验证码',
    };
  }

  const transporter = await createTransporter(smtp);
  if (!transporter) {
    logger.warn(`[Mailer] nodemailer 未安装，注册验证码(${to}) 返回开发模式`);
    return {
      delivered: false,
      devLink: code,
      reason: 'no_nodemailer',
      error: '未安装 nodemailer 依赖，已返回开发模式验证码',
    };
  }

  try {
    await transporter.sendMail({
      from: buildFrom(smtp, siteName),
      to,
      subject: `【${siteName}】邮箱验证码 - 注册`,
      html: registerCodeTemplate(code, siteName),
    });
    logger.info(`[Mailer] 注册验证码邮件已发送至 ${to}`);
    return { delivered: true };
  } catch (e) {
    const err = e as Error;
    const friendly = translateSmtpError(err);
    logger.error(`[Mailer] 注册验证码邮件发送失败 (${to}): ${err.message}`);
    return {
      delivered: false,
      reason: 'send_failed',
      error: friendly,
    };
  }
}

/* ================================================================
   2. 登录验证码邮件
   ================================================================ */
export async function sendLoginCodeEmail(
  smtp: SmtpConfig,
  to: string,
  code: string,
  siteName: string,
): Promise<SendMailResultWithReason> {
  if (!isSmtpReady(smtp)) {
    logger.info(`[Mailer] SMTP 未配置，登录验证码(${to}) 返回开发模式`);
    return {
      delivered: false,
      devLink: code,
      reason: 'smtp_disabled',
      error: 'SMTP 未配置，已返回开发模式验证码',
    };
  }

  const transporter = await createTransporter(smtp);
  if (!transporter) {
    logger.warn(`[Mailer] nodemailer 未安装，登录验证码(${to}) 返回开发模式`);
    return {
      delivered: false,
      devLink: code,
      reason: 'no_nodemailer',
      error: '未安装 nodemailer 依赖，已返回开发模式验证码',
    };
  }

  try {
    await transporter.sendMail({
      from: buildFrom(smtp, siteName),
      to,
      subject: `【${siteName}】登录验证码`,
      html: loginCodeTemplate(code, siteName),
    });
    logger.info(`[Mailer] 登录验证码邮件已发送至 ${to}`);
    return { delivered: true };
  } catch (e) {
    const err = e as Error;
    const friendly = translateSmtpError(err);
    logger.error(`[Mailer] 登录验证码邮件发送失败 (${to}): ${err.message}`);
    return {
      delivered: false,
      reason: 'send_failed',
      error: friendly,
    };
  }
}

/* ================================================================
   3. 密码重置邮件
   ================================================================ */
export async function sendPasswordResetEmail(
  smtp: SmtpConfig,
  to: string,
  resetUrl: string,
  siteName: string,
  username?: string,
): Promise<SendMailResultWithReason> {
  if (!isSmtpReady(smtp)) {
    logger.info(`[Mailer] SMTP 未配置，密码重置(${to}) 返回开发模式`);
    return {
      delivered: false,
      devLink: resetUrl,
      reason: 'smtp_disabled',
      error: 'SMTP 未配置，已返回开发模式重置链接',
    };
  }

  const transporter = await createTransporter(smtp);
  if (!transporter) {
    logger.warn(`[Mailer] nodemailer 未安装，密码重置(${to}) 返回开发模式`);
    return {
      delivered: false,
      devLink: resetUrl,
      reason: 'no_nodemailer',
      error: '未安装 nodemailer 依赖，已返回开发模式重置链接',
    };
  }

  try {
    await transporter.sendMail({
      from: buildFrom(smtp, siteName),
      to,
      subject: `【${siteName}】密码重置`,
      html: passwordResetTemplate(resetUrl, siteName, username),
    });
    logger.info(`[Mailer] 密码重置邮件已发送至 ${to}`);
    return { delivered: true };
  } catch (e) {
    const err = e as Error;
    const friendly = translateSmtpError(err);
    logger.error(`[Mailer] 密码重置邮件发送失败 (${to}): ${err.message}`);
    return {
      delivered: false,
      reason: 'send_failed',
      error: friendly,
    };
  }
}

/* ================================================================
   4. SMTP 测试邮件
   ================================================================ */
export async function sendTestEmail(
  smtp: SmtpConfig,
  to: string,
  siteName: string,
): Promise<SendMailResultWithReason> {
  // 测试邮件必须严格使用真实 SMTP（不需要 devLink 兜底）
  if (!smtp.host || !smtp.user || !smtp.pass) {
    return {
      delivered: false,
      reason: 'smtp_disabled',
      error: 'SMTP 配置不完整，请先填写服务器、用户名和密码/授权码',
    };
  }

  const transporter = await createTransporter(smtp);
  if (!transporter) {
    logger.warn(`[Mailer] nodemailer 未安装，测试邮件发送失败 (目标: ${to})`);
    return {
      delivered: false,
      reason: 'no_nodemailer',
      error: '未安装 nodemailer 依赖，请在 server 目录执行 `npm install nodemailer`',
    };
  }

  try {
    await transporter.sendMail({
      from: buildFrom(smtp, siteName),
      to,
      subject: `【${siteName}】SMTP 测试邮件`,
      html: testEmailTemplate(siteName),
    });
    logger.info(`[Mailer] 测试邮件已发送至 ${to}`);
    return { delivered: true };
  } catch (e) {
    const err = e as Error;
    const friendly = translateSmtpError(err);
    logger.error(`[Mailer] 测试邮件发送失败 (${to}): ${err.message}`);
    return {
      delivered: false,
      reason: 'send_failed',
      error: friendly,
    };
  }
}
