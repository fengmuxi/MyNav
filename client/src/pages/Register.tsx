import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { OAuthIcon } from '../components/ui/OAuthIcon';
import { useSettingsStore } from '../store/settingsStore';
import api from '../api/axios';
import { encryptPassword, isSecureContext, clearPublicKeyCache } from '../api/crypto';
import { computeSrpVerifier } from '../api/srp';
import { toast } from '../store/toastStore';
import type { OAuthProviderId } from '../types/settings';

/**
 * 注册页 - 对齐设计稿 Clean & Minimal
 * - Logo + 卡片表单（创建账户 + 副标题）
 * - 用户名 + 邮箱 + 密码（含强度条）+ 确认密码
 * - 邀请码（仅当系统设置 registerMethod === 'invite' 时显示）
 * - 协议复选框
 * - 注册按钮
 * - 分隔线 + 第三方注册（仅渲染管理员已启用的提供方，显示真实品牌图标）
 * - 底部登录链接
 *
 * 注册行为受系统设置控制：
 * - allowRegister=false / registerMethod='closed' → 注册按钮禁用并提示
 * - registerMethod='invite' → 必须填写正确邀请码
 * - 第三方注册入口仅展示已启用的 OAuthProvider，点击未配置完整 OAuth 的会给出提示
 */
function calcStrength(pwd: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (!pwd) return { score: 0, label: '' };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;
  if (score >= 3) return { score: 3, label: '强' };
  if (score === 2) return { score: 2, label: '中等' };
  if (score === 1) return { score: 1, label: '弱' };
  return { score: 0, label: '太短' };
}

export default function Register() {
  const navigate = useNavigate();
  const settings = useSettingsStore((s) => s.settings);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [codeCountdown, setCodeCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const codeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => calcStrength(password), [password]);

  // 组件卸载时清除倒计时定时器
  useEffect(() => {
    return () => {
      if (codeTimerRef.current) clearInterval(codeTimerRef.current);
    };
  }, []);

  // 发送邮箱验证码
  const onSendCode = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast.warning('请先填写邮箱地址');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.warning('邮箱格式不正确');
      return;
    }

    setSendingCode(true);
    try {
      const { data } = await api.post('/auth/email/send-code', { email: trimmedEmail });
      if (!data.sent && data.devCode) {
        // 开发模式：SMTP 未配置，验证码直接返回
        toast.info(`开发模式：验证码为 ${data.devCode}`);
        setEmailCode(data.devCode);
      } else {
        toast.success('验证码已发送至邮箱');
      }
      // 启动 60 秒倒计时
      setCodeCountdown(60);
      codeTimerRef.current = setInterval(() => {
        setCodeCountdown((prev) => {
          if (prev <= 1) {
            if (codeTimerRef.current) {
              clearInterval(codeTimerRef.current);
              codeTimerRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || '验证码发送失败';
      toast.error(msg);
    } finally {
      setSendingCode(false);
    }
  };

  // 动态设置页面标题
  useEffect(() => {
    if (settings?.siteName) {
      document.title = `注册 · ${settings.siteName}`;
    }
  }, [settings?.siteName]);

  const registerClosed =
    !!settings && (!settings.allowRegister || settings.registerMethod === 'closed');
  const needInviteCode = settings?.registerMethod === 'invite';
  const enabledProviders = settings?.oauthProviders ?? [];

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (registerClosed) {
      toast.warning('当前已关闭注册，请联系管理员创建账户');
      return;
    }
    if (!username.trim() || !password || !confirm) {
      toast.warning('请完整填写用户名和密码');
      return;
    }
    if (password.length < 6) {
      toast.warning('密码长度不能少于 6 位');
      return;
    }
    if (password !== confirm) {
      toast.warning('两次输入的密码不一致');
      return;
    }
    if (needInviteCode && !inviteCode.trim()) {
      toast.warning('请输入邀请码');
      return;
    }
    // 填写邮箱时必须输入验证码
    if (email.trim() && !emailCode.trim()) {
      toast.warning('请输入邮箱验证码');
      return;
    }
    if (!agree) {
      toast.warning('请阅读并同意用户协议和隐私政策');
      return;
    }

    setLoading(true);
    try {
      const trimmedUsername = username.trim();
      // 根据安全上下文选择注册流程：
      // - HTTPS：RSA 加密密码传输，后端同时计算 bcrypt + SRP verifier
      // - HTTP：SRP 流程，客户端计算 verifier 后提交（密码不传输）
      if (isSecureContext()) {
        let encryptedPassword = await encryptPassword(password);
        const registerPayload = {
          username: trimmedUsername,
          password: encryptedPassword,
          email: email.trim() || undefined,
          emailCode: email.trim() ? emailCode.trim() : undefined,
          role: 'USER',
          ...(needInviteCode ? { inviteCode: inviteCode.trim() } : {}),
        };
        try {
          await api.post('/auth/register', registerPayload);
        } catch (err: unknown) {
          const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
          // RSA 密钥可能已重新生成，旧公钥加密的数据无法被新私钥解密
          if (axiosErr.response?.status === 400 && axiosErr.response?.data?.error?.includes('解密失败')) {
            clearPublicKeyCache();
            encryptedPassword = await encryptPassword(password);
            await api.post('/auth/register', {
              ...registerPayload,
              password: encryptedPassword,
            });
          } else {
            throw err;
          }
        }
      } else {
        const { salt, verifier } = computeSrpVerifier(trimmedUsername, password);
        await api.post('/auth/srp/register', {
          username: trimmedUsername,
          salt,
          verifier,
          email: email.trim() || undefined,
          emailCode: email.trim() ? emailCode.trim() : undefined,
          ...(needInviteCode ? { inviteCode: inviteCode.trim() } : {}),
        });
      }
      // 注册成功后跳转登录页
      toast.success('注册成功，即将跳转登录');
      navigate('/login');
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || '注册失败，请联系管理员';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // 点击第三方注册：当前未接入完整 OAuth 流程，给出明确提示
  const onOAuthClick = (provider: { id: OAuthProviderId; name: string }) => {
    toast.warning(`${provider.name} 注册尚未接入 OAuth 回调，请联系管理员完成配置。`);
  };

  // 强度条颜色
  const strengthColor = (i: number) => {
    if (i >= strength.score) return 'var(--bg-inset)';
    if (strength.score === 1) return 'var(--state-error)';
    if (strength.score === 2) return 'var(--state-warning)';
    return 'var(--state-success)';
  };

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ backgroundColor: 'var(--bg-page)' }}
    >
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle
              cx="16"
              cy="16"
              r="14"
              stroke="var(--color-primary)"
              strokeWidth="2.5"
              fill="none"
            />
            <path
              d="M16 6 L16 10 M16 22 L16 26 M6 16 L10 16 M22 16 L26 16 M9.5 9.5 L12.3 12.3 M19.7 19.7 L22.5 22.5 M9.5 22.5 L12.3 19.7 M19.7 12.3 L22.5 9.5"
              stroke="var(--color-primary)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <polygon points="16,11 18,15 22,15.8 19,18.6 19.8,22.5 16,20.5 12.2,22.5 13,18.6 10,15.8 14,15" fill="var(--color-primary)"/>
          </svg>
          <span
            className="text-xl font-bold"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
          >
            {settings?.siteName ?? 'MyNav'}
          </span>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8 animate-fade-in"
          style={{
            backgroundColor: 'var(--bg-surface)',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border-default)',
          }}
        >
          <h1
            className="text-2xl font-semibold text-center mb-1"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}
          >
            创建账户
          </h1>
          <p
            className="text-sm text-center mb-7"
            style={{ color: 'var(--text-tertiary)' }}
          >
            注册你的 {settings?.siteName ?? 'MyNav'} 账户，开始使用
          </p>

          {/* 注册关闭提示 */}
          {registerClosed && (
            <div
              className="text-sm rounded-lg px-3 py-2 mb-4"
              style={{
                color: 'var(--state-warning)',
                backgroundColor: 'var(--state-warning-light)',
              }}
            >
              当前已关闭注册，如需账户请联系管理员。
            </div>
          )}

          <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
            {/* 用户名 */}
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                用户名
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                autoComplete="username"
                className="w-full h-11 px-3.5 text-sm rounded-lg border outline-none transition-all duration-150"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-focus)';
                  e.currentTarget.style.boxShadow =
                    '0 0 0 3px var(--color-primary-50)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-default)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* 邮箱 */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                邮箱地址
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="请输入邮箱地址（需验证）"
                autoComplete="email"
                className="w-full h-11 px-3.5 text-sm rounded-lg border outline-none transition-all duration-150"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-focus)';
                  e.currentTarget.style.boxShadow =
                    '0 0 0 3px var(--color-primary-50)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-default)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* 邮箱验证码（填写邮箱后显示） */}
            {email.trim() && (
              <div>
                <label
                  htmlFor="emailCode"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  邮箱验证码
                </label>
                <div className="flex gap-2">
                  <input
                    id="emailCode"
                    type="text"
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value)}
                    placeholder="请输入 6 位验证码"
                    maxLength={6}
                    className="flex-1 h-11 px-3.5 text-sm rounded-lg border outline-none transition-all duration-150"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-default)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.1em',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-focus)';
                      e.currentTarget.style.boxShadow =
                        '0 0 0 3px var(--color-primary-50)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-default)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  <button
                    type="button"
                    onClick={onSendCode}
                    disabled={sendingCode || codeCountdown > 0}
                    className="h-11 px-4 text-sm rounded-lg border whitespace-nowrap transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      borderColor: 'var(--border-default)',
                      backgroundColor: 'var(--bg-surface)',
                      color: codeCountdown > 0 ? 'var(--text-tertiary)' : 'var(--color-primary)',
                    }}
                  >
                    {codeCountdown > 0 ? `${codeCountdown}s` : sendingCode ? '发送中…' : '发送验证码'}
                  </button>
                </div>
              </div>
            )}

            {/* 邀请码（仅邀请码注册模式显示） */}
            {needInviteCode && (
              <div>
                <label
                  htmlFor="inviteCode"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  邀请码
                </label>
                <input
                  id="inviteCode"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="请输入邀请码"
                  className="w-full h-11 px-3.5 text-sm rounded-lg border outline-none transition-all duration-150"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-default)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.05em',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-focus)';
                    e.currentTarget.style.boxShadow =
                      '0 0 0 3px var(--color-primary-50)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            )}

            {/* 密码 + 强度条 */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                密码
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码（至少 6 位）"
                  autoComplete="new-password"
                  className="w-full h-11 px-3.5 pr-11 text-sm rounded-lg border outline-none transition-all duration-150"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-focus)';
                    e.currentTarget.style.boxShadow =
                      '0 0 0 3px var(--color-primary-50)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded transition-colors hover:bg-inset"
                  style={{ color: 'var(--text-tertiary)' }}
                  aria-label={showPwd ? '隐藏密码' : '显示密码'}
                >
                  {showPwd ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {/* 强度条 */}
              {password && (
                <div className="flex items-center gap-1.5 mt-2">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="flex-1 h-1 rounded-full transition-colors duration-200"
                      style={{ backgroundColor: strengthColor(i) }}
                    />
                  ))}
                  <span
                    className="text-xs ml-1"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {strength.label}
                  </span>
                </div>
              )}
            </div>

            {/* 确认密码 */}
            <div>
              <label
                htmlFor="confirm"
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                确认密码
              </label>
              <div className="relative">
                <input
                  id="confirm"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="请再次输入密码"
                  autoComplete="new-password"
                  className="w-full h-11 px-3.5 pr-11 text-sm rounded-lg border outline-none transition-all duration-150"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-focus)';
                    e.currentTarget.style.boxShadow =
                      '0 0 0 3px var(--color-primary-50)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded transition-colors hover:bg-inset"
                  style={{ color: 'var(--text-tertiary)' }}
                  aria-label={showConfirm ? '隐藏密码' : '显示密码'}
                >
                  {showConfirm ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* 协议 */}
            <label
              className="flex items-start gap-2 cursor-pointer text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="w-4 h-4 mt-0.5 cursor-pointer"
                style={{ accentColor: 'var(--color-primary)' }}
              />
              <span>
                我已阅读并同意
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  style={{ color: 'var(--color-primary)' }}
                >
                  《用户协议》
                </a>
                和
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  style={{ color: 'var(--color-primary)' }}
                >
                  《隐私政策》
                </a>
              </span>
            </label>

            {/* 注册按钮 */}
            <Button
              type="submit"
              size="lg"
              disabled={loading || registerClosed}
              className="w-full"
            >
              {loading ? '注册中…' : registerClosed ? '已关闭注册' : '注册'}
            </Button>

            {/* 仅当存在已启用的第三方注册时，才显示分隔线与社交入口 */}
            {enabledProviders.length > 0 && (
              <>
                {/* 分隔线 */}
                <div className="flex items-center gap-4 my-1">
                  <div
                    className="flex-1 h-px"
                    style={{ backgroundColor: 'var(--border-default)' }}
                  />
                  <span
                    className="text-xs whitespace-nowrap"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    其他注册方式
                  </span>
                  <div
                    className="flex-1 h-px"
                    style={{ backgroundColor: 'var(--border-default)' }}
                  />
                </div>

                {/* 第三方注册：仅渲染已启用的提供方，使用真实品牌图标 */}
                <div className="flex items-center justify-center gap-3">
                  {enabledProviders.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onOAuthClick(p)}
                      className="w-10 h-10 rounded-full border flex items-center justify-center transition-all duration-150"
                      style={{
                        borderColor: 'var(--border-default)',
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-secondary)',
                      }}
                      aria-label={`使用 ${p.name} 注册`}
                      title={`使用 ${p.name} 注册`}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-strong)';
                        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-default)';
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <OAuthIcon id={p.id} size={20} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </form>
        </div>

        {/* 登录链接 */}
        <p
          className="text-center mt-6 text-sm"
          style={{ color: 'var(--text-tertiary)' }}
        >
          已有账户？{' '}
          <Link
            to="/login"
            className="font-medium transition-colors"
            style={{ color: 'var(--color-primary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-primary-600)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-primary)';
            }}
          >
            立即登录
          </Link>
        </p>
      </div>
    </main>
  );
}
