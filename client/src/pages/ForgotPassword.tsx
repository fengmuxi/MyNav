import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { useSettingsStore } from '../store/settingsStore';
import api from '../api/axios';
import { toast } from '../store/toastStore';

/**
 * 忘记密码页 - 对齐设计稿 Clean & Minimal
 * - Logo + 卡片表单（找回密码 + 副标题）
 * - 用户名或邮箱输入框
 * - 提交后调用 /api/auth/forgot-password
 *   - sent=true        → 提示"重置链接已发送至邮箱"
 *   - sent=false + devLink → 开发模式：展示重置链接（可复制/跳转）
 *   - 失败             → 显示错误信息
 * - 返回登录链接
 */
export default function ForgotPassword() {
  const settings = useSettingsStore((s) => s.settings);
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [devLink, setDevLink] = useState('');
  // done：标记已成功提交，进入完成态（隐藏表单、显示重新申请按钮）
  const [done, setDone] = useState(false);

  // 动态设置页面标题
  useEffect(() => {
    if (settings?.siteName) {
      document.title = `忘记密码 · ${settings.siteName}`;
    }
  }, [settings?.siteName]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setDevLink('');

    if (!identifier.trim()) {
      toast.warning('请输入用户名或邮箱');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post<{
        sent: boolean;
        message?: string;
        devLink?: string;
      }>('/auth/forgot-password', { identifier: identifier.trim() });

      if (data.sent) {
        toast.success(data.message || '重置链接已发送至邮箱');
      } else {
        // 开发模式：显示返回的重置链接
        toast.success(data.message || '已生成重置链接');
        if (data.devLink) setDevLink(data.devLink);
      }
      setDone(true);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || '请求失败，请稍后重试';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!devLink) return;
    try {
      await navigator.clipboard.writeText(devLink);
      toast.success('重置链接已复制到剪贴板');
    } catch {
      toast.error('复制失败，请手动选择链接复制');
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
          {/* 标题图标 */}
          <div className="flex justify-center mb-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary)' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12l2 2 4-4" />
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          </div>

          <h1
            className="text-2xl font-semibold text-center mb-1"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}
          >
            找回密码
          </h1>
          <p
            className="text-sm text-center mb-7"
            style={{ color: 'var(--text-tertiary)' }}
          >
            输入用户名或邮箱，我们将发送密码重置链接
          </p>

          {/* 开发模式：显示重置链接 */}
          {devLink && (
            <div
              className="rounded-lg p-3 mb-4"
              style={{
                backgroundColor: 'var(--state-warning-light)',
                border: '1px solid var(--state-warning)',
              }}
            >
              <div
                className="text-sm font-medium mb-2 flex items-center gap-1.5"
                style={{ color: 'var(--state-warning)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                开发模式：SMTP 未配置
              </div>
              <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                下方为本次生成的重置链接，请复制并打开：
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={devLink}
                  className="flex-1 h-8 px-2 text-xs rounded border font-mono"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button type="button" size="sm" onClick={copyLink}>
                  复制
                </Button>
              </div>
              <a
                href={devLink}
                className="text-xs mt-2 inline-block"
                style={{ color: 'var(--color-primary)' }}
              >
                或点击此处直接打开重置页 →
              </a>
            </div>
          )}

          {/* 表单：仅在未成功提交时显示 */}
          {!done && (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div>
                <label
                  htmlFor="identifier"
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  用户名或邮箱
                </label>
                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="请输入用户名或邮箱"
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

              <Button
                type="submit"
                size="lg"
                disabled={loading}
                className="w-full"
              >
                {loading ? '发送中…' : '发送重置链接'}
              </Button>
            </form>
          )}

          {/* 成功后提供再次发送按钮 */}
          {done && (
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setDone(false);
                  setDevLink('');
                  setIdentifier('');
                }}
              >
                重新申请
              </Button>
            </div>
          )}
        </div>

        {/* 返回登录 */}
        <p
          className="text-center mt-6 text-sm"
          style={{ color: 'var(--text-tertiary)' }}
        >
          想起密码了？{' '}
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
      </div>
    </main>
  );
}
