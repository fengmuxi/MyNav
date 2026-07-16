import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { Button } from '../components/ui/Button';
import { OAuthIcon } from '../components/ui/OAuthIcon';
import { toast } from '../store/toastStore';
import api from '../api/axios';
import type { OAuthProviderId } from '../types/settings';

/**
 * 登录页 - 对齐设计稿 Clean & Minimal
 * - Logo + 卡片表单（欢迎回来 + 副标题）
 * - 两种登录模式：密码登录 / 邮箱验证码登录（Tab 切换）
 * - 记住我 + 忘记密码占位
 * - 登录按钮
 * - 分隔线 + 第三方登录（仅渲染管理员已启用的提供方，显示真实品牌图标）
 * - 底部注册链接
 */
export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const loginByEmailCode = useAuthStore((s) => s.loginByEmailCode);
  const settings = useSettingsStore((s) => s.settings);

  const [loginMode, setLoginMode] = useState<'password' | 'email'>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  // 邮箱验证码登录相关状态
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [codeCountdown, setCodeCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const codeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 动态设置页面标题
  useEffect(() => {
    if (settings?.siteName) {
      document.title = `登录 · ${settings.siteName}`;
    }
  }, [settings?.siteName]);

  const enabledProviders = settings?.oauthProviders ?? [];

  // 组件卸载时清除倒计时定时器
  useEffect(() => {
    return () => {
      if (codeTimerRef.current) clearInterval(codeTimerRef.current);
    };
  }, []);

  // 发送邮箱登录验证码
  const onSendLoginCode = async () => {
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
      const { data } = await api.post('/auth/email/login/send-code', { email: trimmedEmail });
      if (!data.sent && data.devCode) {
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

  // 点击第三方登录：当前未接入完整 OAuth 流程，给出明确提示
  const onOAuthClick = (provider: { id: OAuthProviderId; name: string }) => {
    toast.warning(`${provider.name} 登录尚未接入 OAuth 回调，请联系管理员完成配置。`);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (loginMode === 'email') {
        // 邮箱验证码登录
        const trimmedEmail = email.trim();
        if (!trimmedEmail) {
          toast.warning('请输入邮箱地址');
          return;
        }
        if (!emailCode.trim()) {
          toast.warning('请输入验证码');
          return;
        }
        await loginByEmailCode(trimmedEmail, emailCode.trim());
      } else {
        // 密码登录
        console.log('[Login] 开始登录，用户名:', username.trim());
        await login(username.trim(), password);
      }
      console.log('[Login] 登录成功');
      toast.success('登录成功，欢迎回来');
      navigate('/');
    } catch (err) {
      console.error('[Login] 登录失败:', err);
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error ||
        (err as Error)?.message ||
        '登录失败，请重试';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ backgroundColor: 'var(--bg-page)' }}
    >
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <svg
            width="32"
            height="32"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
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
            欢迎回来
          </h1>
          <p
            className="text-sm text-center mb-7"
            style={{ color: 'var(--text-tertiary)' }}
          >
            登录你的 {settings?.siteName ?? 'MyNav'} 账户
          </p>

          {/* 登录模式切换 Tab */}
          <div className="flex mb-6 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-default)' }}>
            <button
              type="button"
              onClick={() => setLoginMode('password')}
              className="flex-1 h-10 text-sm font-medium transition-all duration-150"
              style={{
                backgroundColor: loginMode === 'password' ? 'var(--color-primary)' : 'var(--bg-surface)',
                color: loginMode === 'password' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              密码登录
            </button>
            <button
              type="button"
              onClick={() => setLoginMode('email')}
              className="flex-1 h-10 text-sm font-medium transition-all duration-150"
              style={{
                backgroundColor: loginMode === 'email' ? 'var(--color-primary)' : 'var(--bg-surface)',
                color: loginMode === 'email' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              邮箱验证码登录
            </button>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
            {loginMode === 'password' ? (
              <>
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

            {/* 密码 */}
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
                  placeholder="请输入密码"
                  autoComplete="current-password"
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
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* 记住我 / 忘记密码 */}
            <div className="flex items-center justify-between">
              <label
                className="flex items-center gap-2 cursor-pointer text-sm"
                style={{ color: 'var(--text-secondary)' }}
              >
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 cursor-pointer"
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <span>记住我</span>
              </label>
              <Link
                to="/forgot-password"
                className="text-sm font-medium transition-colors"
                style={{ color: 'var(--text-link)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--color-primary-600)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-link)';
                }}
              >
                忘记密码?
              </Link>
            </div>
              </>
            ) : (
              <>
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
                    placeholder="请输入已绑定的邮箱"
                    autoComplete="email"
                    className="w-full h-11 px-3.5 text-sm rounded-lg border outline-none transition-all duration-150"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-default)',
                      color: 'var(--text-primary)',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-focus)';
                      e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-50)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-default)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                </div>

                {/* 验证码 */}
                <div>
                  <label
                    htmlFor="emailCode"
                    className="block text-sm font-medium mb-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    验证码
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
                        e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-50)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border-default)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    />
                    <button
                      type="button"
                      onClick={onSendLoginCode}
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
              </>
            )}

            {/* 登录按钮 */}
            <Button
              type="submit"
              size="lg"
              disabled={loading}
              className="w-full"
            >
              {loading ? '登录中…' : '登录'}
            </Button>

            {/* 仅当存在已启用的第三方登录时，才显示分隔线与社交入口 */}
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
                    其他登录方式
                  </span>
                  <div
                    className="flex-1 h-px"
                    style={{ backgroundColor: 'var(--border-default)' }}
                  />
                </div>

                {/* 第三方登录：仅渲染已启用的提供方，使用真实品牌图标 */}
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
                      aria-label={`使用 ${p.name} 登录`}
                      title={`使用 ${p.name} 登录`}
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

        {/* 注册链接 */}
        <p
          className="text-center mt-6 text-sm"
          style={{ color: 'var(--text-tertiary)' }}
        >
          还没有账户？{' '}
          <Link
            to="/register"
            className="font-medium transition-colors"
            style={{ color: 'var(--color-primary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-primary-600)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-primary)';
            }}
          >
            立即注册
          </Link>
        </p>
      </div>
    </main>
  );
}
