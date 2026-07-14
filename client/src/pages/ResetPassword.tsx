import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { useSettingsStore } from '../store/settingsStore';
import api from '../api/axios';
import { encryptPassword } from '../api/crypto';
import { toast } from '../store/toastStore';

/**
 * 重置密码页 - 对齐设计稿 Clean & Minimal
 * - 通过 URL ?token=xxx 进入；无 token 显示错误
 * - 新密码 + 确认密码 + 强度条
 * - 提交调用 /api/auth/reset-password，成功后跳转登录页
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

export default function ResetPassword() {
  const navigate = useNavigate();
  const settings = useSettingsStore((s) => s.settings);
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const strength = useMemo(() => calcStrength(password), [password]);

  // 动态设置页面标题
  useEffect(() => {
    if (settings?.siteName) {
      document.title = `重置密码 · ${settings.siteName}`;
    }
  }, [settings?.siteName]);

  // 无 token 直接提示
  useEffect(() => {
    if (!token) {
      toast.error('重置链接缺少必要参数，请通过邮件中的链接进入');
    }
  }, [token]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast.error('重置链接无效，请重新申请');
      return;
    }
    if (!password || !confirm) {
      toast.warning('请输入并确认新密码');
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

    setLoading(true);
    try {
      const encryptedPassword = await encryptPassword(password);
      await api.post('/auth/reset-password', { token, newPassword: encryptedPassword });
      setDone(true);
      toast.success('密码重置成功，即将跳转登录');
      // 3 秒后跳转登录页
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || '重置失败，请重新申请';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

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
          {/* 成功页 */}
          {done ? (
            <div className="text-center py-4">
              <div
                className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ backgroundColor: 'var(--state-success-light)', color: 'var(--state-success)' }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h1
                className="text-xl font-semibold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                密码重置成功
              </h1>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                即将跳转到登录页，请使用新密码登录…
              </p>
              <div className="mt-6">
                <Link
                  to="/login"
                  className="text-sm font-medium"
                  style={{ color: 'var(--color-primary)' }}
                >
                  立即前往登录 →
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* 标题图标 */}
              <div className="flex justify-center mb-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary)' }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
              </div>

              <h1
                className="text-2xl font-semibold text-center mb-1"
                style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}
              >
                重置密码
              </h1>
              <p
                className="text-sm text-center mb-7"
                style={{ color: 'var(--text-tertiary)' }}
              >
                为你的账户设置新密码
              </p>

              <form onSubmit={onSubmit} className="flex flex-col gap-[18px]">
                {/* 新密码 */}
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium mb-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    新密码
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="请输入新密码（至少 6 位）"
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

                {/* 确认新密码 */}
                <div>
                  <label
                    htmlFor="confirm"
                    className="block text-sm font-medium mb-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    确认新密码
                  </label>
                  <div className="relative">
                    <input
                      id="confirm"
                      type={showConfirm ? 'text' : 'password'}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="请再次输入新密码"
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

                <Button
                  type="submit"
                  size="lg"
                  disabled={loading || !token}
                  className="w-full"
                >
                  {loading ? '重置中…' : '重置密码'}
                </Button>
              </form>
            </>
          )}
        </div>

        {/* 返回登录 */}
        {!done && (
          <p
            className="text-center mt-6 text-sm"
            style={{ color: 'var(--text-tertiary)' }}
          >
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
              返回登录
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
