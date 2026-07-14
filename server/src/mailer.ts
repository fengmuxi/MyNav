/**
 * 邮件发送模块
 * ------------------------------------------------------------------
 * 设计原则：
 * - nodemailer 作为可选依赖：通过动态 import 引用，未安装时自动回退到开发模式
 * - 未启用 SMTP 或未安装 nodemailer 时，sendMail 返回 { delivered: false, devLink? }
 *   调用方（forgot-password 路由）据此决定是否将重置链接返回给前端（仅开发模式）
 * - 启用且 nodemailer 可用时，发送邮件并返回 { delivered: true }
 *
 * 生产环境使用流程：
 *   1. cd server && npm install nodemailer
 *   2. 管理后台 → 系统设置 → SMTP 配置 → 启用并填写 SMTP 服务器信息
 *   3. 用户在忘记密码页输入用户名/邮箱，系统自动发送含 token 的重置链接到用户邮箱
 */
import type { SmtpConfig } from './settings.js';

export interface SendMailResult {
  delivered: boolean;
  /** 开发模式下返回重置链接，供前端展示（生产环境为 undefined） */
  devLink?: string;
  error?: string;
}

/**
 * 发送密码重置邮件
 * @param smtp    SMTP 配置
 * @param to      收件人邮箱
 * @param resetUrl 重置链接（含 token 的完整 URL）
 * @param siteName 站点名称（用于邮件标题与正文）
 */
export async function sendPasswordResetEmail(
  smtp: SmtpConfig,
  to: string,
  resetUrl: string,
  siteName: string,
): Promise<SendMailResult> {
  // 未启用 SMTP：返回开发模式链接
  if (!smtp.enabled || !smtp.host || !smtp.user) {
    return {
      delivered: false,
      devLink: resetUrl,
      error: 'SMTP 未配置，已返回开发模式重置链接',
    };
  }

  // 动态加载 nodemailer（可选依赖）
  let nodemailer: any;
  try {
    // @ts-expect-error - nodemailer 为可选依赖，未安装时该 import 会抛错
    nodemailer = await import('nodemailer');
  } catch {
    return {
      delivered: false,
      devLink: resetUrl,
      error: '未安装 nodemailer 依赖，已返回开发模式重置链接',
    };
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  const mailOptions = {
    from: `"${smtp.fromName || siteName}" <${smtp.fromEmail || smtp.user}>`,
    to,
    subject: `【${siteName}】密码重置`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #161A26; margin: 0 0 16px;">密码重置</h2>
        <p style="color: #4B5563; line-height: 1.6; margin: 0 0 16px;">
          你好，我们收到了你在 ${siteName} 上的密码重置请求。请点击下方按钮重置密码：
        </p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="display: inline-block; background: #4F6EF7; color: #fff; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
            重置密码
          </a>
        </p>
        <p style="color: #6B7280; font-size: 13px; line-height: 1.6; margin: 0 0 8px;">
          如果按钮无法点击，请复制以下链接到浏览器：
        </p>
        <p style="color: #4F6EF7; font-size: 13px; word-break: break-all; margin: 0 0 24px;">
          ${resetUrl}
        </p>
        <p style="color: #9CA3AF; font-size: 12px; line-height: 1.6; margin: 0; padding-top: 16px; border-top: 1px solid #E5E7EB;">
          此链接 30 分钟内有效。如果你没有发起密码重置请求，请忽略此邮件，你的密码不会变更。
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { delivered: true };
  } catch (e) {
    return {
      delivered: false,
      error: (e as Error).message || '邮件发送失败',
    };
  }
}
