/**
 * HTML 邮件模板
 * ------------------------------------------------------------------
 * 对齐项目 Clean & Minimal 设计系统，所有样式内联（兼容主流邮件客户端）
 * - 主色：#4F6EF7（Indigo）
 * - 背景色阶：#F8F9FC / #FFFFFF / #EEF1FE
 * - 文字色阶：#161A26 / #4A5168 / #9AA3B8
 * - 边框：#E5E8F0
 *
 * 共 4 种邮件类型：
 * 1. register  注册邮箱验证码
 * 2. login     登录验证码
 * 3. reset     忘记密码（重置链接）
 * 4. test      SMTP 测试邮件
 */

/** 设计 token 常量（与 index.css 对齐） */
const C = {
  primary: '#4F6EF7',
  primary600: '#3D56E6',
  primary50: '#EEF1FE',
  page: '#F8F9FC',
  surface: '#FFFFFF',
  inset: '#F1F3F8',
  textPrimary: '#161A26',
  textSecondary: '#4A5168',
  textTertiary: '#9AA3B8',
  border: '#E5E8F0',
  borderStrong: '#CBD1DE',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
};

/** 邮件宽度 */
const MAIL_WIDTH = 560;

/**
 * 内联 SVG Logo（罗盘风格，与前端 Logo 一致）
 * 使用 viewBox 缩放，width/height 固定为 28px
 */
const LOGO_SVG = `
<svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;">
  <circle cx="16" cy="16" r="14" stroke="${C.primary}" stroke-width="2.5" fill="none"/>
  <path d="M16 6 L16 10 M16 22 L16 26 M6 16 L10 16 M22 16 L26 16 M9.5 9.5 L12.3 12.3 M19.7 19.7 L22.5 22.5 M9.5 22.5 L12.3 19.7 M19.7 12.3 L22.5 9.5" stroke="${C.primary}" stroke-width="2" stroke-linecap="round"/>
  <polygon points="16,11 18,15 22,15.8 19,18.6 19.8,22.5 16,20.5 12.2,22.5 13,18.6 10,15.8 14,15" fill="${C.primary}"/>
</svg>`.trim();

/**
 * 生成邮件外壳布局（header + body + footer）
 * - 使用 table 布局兼容旧邮件客户端
 * - 顶部品牌色渐变条
 * - header：Logo + 站点名称
 * - footer：版权信息 + 免责声明
 */
function layout(siteName: string, bodyContent: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${siteName}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.page};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans SC',sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <!-- 外层：模拟 var(--bg-page) -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${C.page};min-height:100vh;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <!-- 邮件容器 -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${MAIL_WIDTH}" style="width:${MAIL_WIDTH}px;max-width:100%;background-color:${C.surface};border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(22,26,38,0.08);border:1px solid ${C.border};">

          <!-- 顶部品牌色条 -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,${C.primary} 0%,${C.primary600} 100%);font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Header：Logo + 站点名称 -->
          <tr>
            <td style="padding:32px 40px 24px;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  <td style="vertical-align:middle;padding-right:8px;">${LOGO_SVG}</td>
                  <td style="vertical-align:middle;font-size:18px;font-weight:700;color:${C.textPrimary};letter-spacing:-0.02em;">${siteName}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body 内容区 -->
          <tr>
            <td style="padding:8px 40px 32px;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer 分割线 + 版权 -->
          <tr>
            <td style="padding:0 40px 28px;">
              <div style="border-top:1px solid ${C.border};padding-top:20px;text-align:center;">
                <p style="margin:0 0 4px;font-size:12px;color:${C.textTertiary};line-height:1.6;">
                  这是一封来自 ${siteName} 的自动邮件，请勿直接回复。
                </p>
                <p style="margin:0;font-size:12px;color:${C.textTertiary};line-height:1.6;">
                  &copy; ${year} ${siteName}. All rights reserved.
                </p>
              </div>
            </td>
          </tr>

        </table>
        <!-- 容器外底部留白提示 -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${MAIL_WIDTH}" style="width:${MAIL_WIDTH}px;max-width:100%;">
          <tr>
            <td style="padding:16px 0;text-align:center;font-size:11px;color:${C.textTertiary};">
              如果你认为此邮件有误，请忽略并删除。
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ================================================================
   通用内容片段
   ================================================================ */

/** 标题 */
function h2(text: string, color = C.textPrimary): string {
  return `<h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:${color};letter-spacing:-0.01em;line-height:1.3;">${text}</h2>`;
}

/** 正文段落 */
function p(text: string, color = C.textSecondary, fontSize = '14px'): string {
  return `<p style="margin:0 0 16px;font-size:${fontSize};line-height:1.7;color:${color};">${text}</p>`;
}

/** 分割线 */
function divider(): string {
  return `<div style="border-top:1px solid ${C.border};margin:20px 0;"></div>`;
}

/** 验证码展示块 */
function codeBlock(code: string): string {
  return `
  <div style="text-align:center;margin:28px 0;">
    <span style="display:inline-block;font-family:'JetBrains Mono','Fira Code','SF Mono',monospace;font-size:36px;font-weight:700;letter-spacing:0.35em;color:${C.primary};padding:16px 40px;background:${C.primary50};border-radius:12px;border:1px solid ${C.primary50};text-indent:0.35em;">
      ${code}
    </span>
  </div>`;
}

/** 主按钮（链接） */
function button(href: string, text: string, bg = C.primary): string {
  return `
  <div style="text-align:center;margin:28px 0;">
    <a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:${bg};color:#FFFFFF;padding:13px 36px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:0.01em;box-shadow:0 4px 12px rgba(79,110,247,0.25);">
      ${text}
    </a>
  </div>`;
}

/** 链接提示（按钮无法点击时的备用链接） */
function linkFallback(url: string): string {
  return `
  <p style="margin:0 0 8px;font-size:13px;color:${C.textSecondary};line-height:1.6;">
    如果按钮无法点击，请复制以下链接到浏览器地址栏：
  </p>
  <p style="margin:0 0 24px;font-size:13px;color:${C.primary};word-break:break-all;line-height:1.6;">
    ${url}
  </p>`;
}

/** 底部提示框（浅灰背景） */
function tipBox(text: string): string {
  return `
  <div style="margin:24px 0 0;padding:14px 18px;background:${C.inset};border-radius:8px;">
    <p style="margin:0;font-size:12px;color:${C.textTertiary};line-height:1.6;">
      ${text}
    </p>
  </div>`;
}

/** 警告提示框（黄色背景，用于安全提醒） */
function warningBox(text: string): string {
  return `
  <div style="margin:20px 0 0;padding:14px 18px;background:#FFFBEB;border:1px solid #F59E0B;border-radius:8px;">
    <p style="margin:0;font-size:12px;color:#92400E;line-height:1.6;">
      ${text}
    </p>
  </div>`;
}

/** 顶部圆形图标块（居中显示） */
function iconCircle(svg: string, bgColor = C.primary50, color = C.primary): string {
  return `
  <div style="text-align:center;margin:0 0 24px;">
    <div style="display:inline-block;width:56px;height:56px;border-radius:50%;background:${bgColor};color:${color};line-height:56px;text-align:center;vertical-align:middle;">
      ${svg}
    </div>
  </div>`;
}

/** 钥匙 SVG 图标 */
const KEY_ICON = `
<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;">
  <path d="M21 2l-2 2m-7.618 7.618a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.778-7.778zm0 0L15.5 2.5 18 5l-2.5 2.5L18 10"/>
</svg>`.trim();

/**
 * 信息表格（左标签右值）
 * rows: [{ label, value }]
 */
function infoTable(rows: { label: string; value: string }[]): string {
  const rowsHtml = rows
    .map(
      (r) => `
      <tr>
        <td style="width:100px;color:${C.textTertiary};vertical-align:top;padding:6px 0;font-size:13px;">${r.label}</td>
        <td style="vertical-align:top;padding:6px 0;color:${C.textPrimary};font-size:13px;font-weight:500;">${r.value}</td>
      </tr>`,
    )
    .join('');
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0;">
    ${rowsHtml}
  </table>`;
}

/**
 * 步骤列表
 * steps: string[]
 */
function stepList(steps: string[]): string {
  const items = steps
    .map(
      (s, i) => `
      <tr>
        <td style="vertical-align:top;width:24px;padding:4px 0;">
          <span style="display:inline-block;width:20px;height:20px;line-height:20px;border-radius:50%;background:${C.primary50};color:${C.primary};text-align:center;font-size:11px;font-weight:700;">${i + 1}</span>
        </td>
        <td style="vertical-align:top;padding:4px 0 4px 8px;font-size:13px;color:${C.textSecondary};line-height:1.6;">${s}</td>
      </tr>`,
    )
    .join('');
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0;">
    ${items}
  </table>`;
}

/* ================================================================
   4 种邮件模板
   ================================================================ */

/**
 * 1. 注册验证码邮件
 */
export function registerCodeTemplate(code: string, siteName: string): string {
  const body = `
    ${h2('欢迎注册')}
    ${p(`你好，你正在 <strong style="color:${C.textPrimary};">${siteName}</strong> 注册账户，请使用以下验证码完成邮箱验证：`)}
    ${codeBlock(code)}
    ${tipBox('此验证码 <strong style="color:' + C.warning + ';">5 分钟</strong>内有效。如果你没有发起注册请求，请忽略此邮件，无需任何操作。')}
  `;
  return layout(siteName, body);
}

/**
 * 2. 登录验证码邮件
 */
export function loginCodeTemplate(code: string, siteName: string): string {
  const body = `
    ${h2('登录验证码')}
    ${p(`你正在登录 <strong style="color:${C.textPrimary};">${siteName}</strong> 账户，请使用以下验证码完成登录：`)}
    ${codeBlock(code)}
    ${tipBox('此验证码 <strong style="color:' + C.warning + ';">5 分钟</strong>内有效。如果不是你本人操作，请忽略此邮件，你的账户安全不受影响。')}
  `;
  return layout(siteName, body);
}

/**
 * 3. 忘记密码（密码重置）邮件
 * @param resetUrl  重置链接
 * @param siteName  站点名称
 * @param username  用户名（可选，用于问候语与信息表）
 */
export function passwordResetTemplate(resetUrl: string, siteName: string, username?: string): string {
  const now = new Date();
  const requestTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const expireTime = new Date(now.getTime() + 30 * 60 * 1000).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
  });

  const greeting = username
    ? `你好 <strong style="color:${C.textPrimary};">${username}</strong>，`
    : '你好，';

  const body = `
    ${iconCircle(KEY_ICON)}
    ${h2('密码重置请求')}
    ${p(`${greeting}我们收到了你在 <strong style="color:${C.textPrimary};">${siteName}</strong> 上的密码重置请求。请按照下方步骤完成密码重置：`)}
    ${divider()}
    ${infoTable([
      { label: '账户', value: username ? `<strong style="color:${C.primary};">@${username}</strong>` : '当前账户' },
      { label: '请求时间', value: `<span style="font-family:'JetBrains Mono',monospace;font-size:12px;">${requestTime}</span>` },
      { label: '过期时间', value: `<span style="font-family:'JetBrains Mono',monospace;font-size:12px;color:${C.warning};">${expireTime}</span>` },
      { label: '有效期', value: '<strong style="color:' + C.warning + ';">30 分钟</strong>' },
    ])}
    ${divider()}
    ${stepList([
      '点击下方「重置密码」按钮，进入密码重置页面',
      '输入并确认你的新密码（建议至少 8 位，包含字母与数字）',
      '提交后即可使用新密码登录账户',
    ])}
    ${button(resetUrl, '重置密码')}
    ${linkFallback(resetUrl)}
    ${warningBox('<strong>安全提醒：</strong>此重置链接仅限你本人使用，请勿转发或分享给他人。链接将在 30 分钟后失效。')}
    ${tipBox('如果你没有发起密码重置请求，请忽略此邮件，你的密码不会变更。若担心账户安全，请及时登录并修改密码。如有疑问，请联系站点管理员。')}
  `;
  return layout(siteName, body);
}

/**
 * 4. SMTP 测试邮件
 */
export function testEmailTemplate(siteName: string): string {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const body = `
    ${h2('测试邮件', C.success)}
    ${p(`这是一封来自 <strong style="color:${C.textPrimary};">${siteName}</strong> 的 SMTP 配置测试邮件。`)}
    ${p(`如果你收到了这封邮件，说明 SMTP 服务器配置正确，邮件发送功能工作正常。`)}
    ${divider()}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:13px;color:${C.textSecondary};line-height:1.8;">
      <tr>
        <td style="width:90px;color:${C.textTertiary};vertical-align:top;padding-bottom:6px;">站点名称</td>
        <td style="vertical-align:top;padding-bottom:6px;color:${C.textPrimary};font-weight:500;">${siteName}</td>
      </tr>
      <tr>
        <td style="width:90px;color:${C.textTertiary};vertical-align:top;padding-bottom:6px;">发送时间</td>
        <td style="vertical-align:top;padding-bottom:6px;color:${C.textPrimary};font-family:'JetBrains Mono',monospace;font-size:12px;">${now}</td>
      </tr>
      <tr>
        <td style="width:90px;color:${C.textTertiary};vertical-align:top;">邮件类型</td>
        <td style="vertical-align:top;">
          <span style="display:inline-block;padding:2px 10px;background:${C.primary50};color:${C.primary};border-radius:4px;font-size:12px;font-weight:600;">SMTP Test</span>
        </td>
      </tr>
    </table>
    ${tipBox('此邮件仅用于验证 SMTP 配置，无需任何操作。你可以安全地删除此邮件。')}
  `;
  return layout(siteName, body);
}
