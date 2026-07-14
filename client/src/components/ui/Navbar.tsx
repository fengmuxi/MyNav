import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';

/**
 * 顶部导航栏 - 对齐设计稿 Clean & Minimal
 * - sticky top-0 + z-200 + bg-surface/80 + backdrop-blur-md
 * - 左：Logo（主色）
 * - 中：导航链接（首页 / 主题设置），当前路由高亮主色软背景
 * - 右：未登录显示「登录」按钮；已登录显示头像 + 下拉菜单
 *   下拉菜单：用户信息头 / 后台管理（仅 ADMIN）/ 主题设置 / 退出登录（红色）
 * - 移动端：点击触发下拉（非 hover），点击外部自动关闭
 */
export function Navbar() {
  const { user, token, logout } = useAuthStore();
  const settings = useSettingsStore((s) => s.settings);
  const navigate = useNavigate();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  // 路由切换时关闭菜单
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    navigate('/');
  };

  // 当前是否为首页
  const isHome = location.pathname === '/';
  const isSettings = location.pathname === '/settings';

  // 头像：有图片显示图片，否则首字母 fallback（主色背景）
  const renderAvatar = (size: 'sm' | 'md') => {
    const sizeCls = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm';
    if (user?.avatar) {
      return (
        <img
          src={user.avatar}
          alt={user.username}
          className={`${sizeCls} rounded-full object-cover`}
        />
      );
    }
    return (
      <span
        className={`inline-flex ${sizeCls} items-center justify-center rounded-full font-semibold text-white`}
        style={{ backgroundColor: 'var(--color-primary)' }}
      >
        {(user?.username ?? '?').slice(0, 1).toUpperCase()}
      </span>
    );
  };

  const showName = user?.displayName || user?.username || '';

  // 导航链接样式：当前页主色软背景，其余 hover 浅灰
  const navLinkCls = (active: boolean) =>
    `px-4 py-1.5 rounded-full text-sm font-medium transition-colors duration-150 ${
      active ? '' : 'hover:bg-inset'
    }`;

  return (
    <nav
      className="sticky top-0 z-[200] border-b backdrop-blur-md"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-surface) 80%, transparent)',
        borderColor: 'var(--border-default)',
      }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* 左：Logo */}
        <Link
          to="/"
          className="flex items-center gap-2 text-lg font-semibold transition-opacity hover:opacity-90"
          style={{ color: 'var(--color-primary)', letterSpacing: '-0.02em' }}
        >
          <img
            src="/logo.png"
            alt="Logo"
            className="w-9 h-9 object-contain"
          />
          {settings?.siteName ?? '沐曦导航'}
        </Link>

        {/* 中：导航链接（首页 + 主题设置，登录/非登录均可访问主题设置） */}
        <div className="hidden md:flex items-center gap-1">
          <Link
            to="/"
            className={navLinkCls(isHome)}
            style={
              isHome
                ? {
                    backgroundColor: 'var(--color-primary-50)',
                    color: 'var(--color-primary)',
                  }
                : { color: 'var(--text-secondary)' }
            }
          >
            首页
          </Link>
          <Link
            to="/settings"
            className={navLinkCls(isSettings)}
            style={
              isSettings
                ? {
                    backgroundColor: 'var(--color-primary-50)',
                    color: 'var(--color-primary)',
                  }
                : { color: 'var(--text-secondary)' }
            }
          >
            主题设置
          </Link>
        </div>

        {/* 右：用户区 */}
        {token && user ? (
          <div className="relative" ref={menuRef}>
            {/* 触发器 */}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2.5 cursor-pointer select-none pl-3 pr-2 py-1.5 rounded-full transition-colors duration-150"
              style={{
                border: '1px solid',
                borderColor: menuOpen
                  ? 'var(--border-strong)'
                  : 'var(--border-default)',
                backgroundColor: menuOpen ? 'var(--bg-inset)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!menuOpen) {
                  e.currentTarget.style.borderColor = 'var(--border-strong)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-inset)';
                }
              }}
              onMouseLeave={(e) => {
                if (!menuOpen) {
                  e.currentTarget.style.borderColor = 'var(--border-default)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {renderAvatar('sm')}
              <span
                className="text-sm font-medium max-w-[100px] truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {showName}
              </span>
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`}
                style={{ color: 'var(--text-tertiary)' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth="2.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* 下拉面板 */}
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border py-2 animate-fade-in origin-top-right"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-default)',
                  boxShadow:
                    '0 12px 32px rgba(22, 26, 38, 0.1), 0 2px 6px rgba(22, 26, 38, 0.04)',
                  zIndex: 'var(--z-dropdown)',
                }}
                role="menu"
              >
                {/* 用户信息头 */}
                <div
                  className="flex items-center gap-3 px-3.5 py-2.5 mb-1"
                  style={{ borderBottom: '1px solid var(--border-default)' }}
                >
                  {renderAvatar('md')}
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-sm font-medium truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {showName}
                    </div>
                    <div
                      className="text-xs truncate"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {user.email || `@${user.username}`}
                    </div>
                  </div>
                </div>

                {/* 菜单项 */}
                <div className="py-1">
                  {user.role === 'ADMIN' && (
                    <Link
                      to="/admin/nav"
                      className="flex items-center gap-3 px-3.5 py-2 rounded-lg mx-1 text-sm transition-all duration-150"
                      style={{ color: 'var(--text-secondary)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor =
                          'var(--color-primary-50)';
                        e.currentTarget.style.color = 'var(--color-primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                      }}
                    >
                      <svg
                        className="w-4 h-4 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth="1.8"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      <span>后台管理</span>
                      <svg
                        className="w-3.5 h-3.5 ml-auto opacity-40"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </Link>
                  )}
                  <Link
                    to="/my/nav"
                    className="flex items-center gap-3 px-3.5 py-2 rounded-lg mx-1 text-sm transition-all duration-150"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        'var(--color-primary-50)';
                      e.currentTarget.style.color = 'var(--color-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                  >
                    <svg
                      className="w-4 h-4 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth="1.8"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
                      />
                    </svg>
                    <span>我的导航</span>
                  </Link>
                  <Link
                    to="/settings"
                    className="flex items-center gap-3 px-3.5 py-2 rounded-lg mx-1 text-sm transition-all duration-150"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        'var(--color-primary-50)';
                      e.currentTarget.style.color = 'var(--color-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                  >
                    <svg
                      className="w-4 h-4 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth="1.8"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                      />
                    </svg>
                    <span>主题设置</span>
                  </Link>
                  <Link
                    to="/profile"
                    className="flex items-center gap-3 px-3.5 py-2 rounded-lg mx-1 text-sm transition-all duration-150"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        'var(--color-primary-50)';
                      e.currentTarget.style.color = 'var(--color-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                  >
                    <svg
                      className="w-4 h-4 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth="1.8"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    <span>个人信息</span>
                  </Link>
                </div>

                {/* 退出登录 */}
                <div
                  style={{
                    borderTop: '1px solid var(--border-default)',
                    marginTop: 4,
                    paddingTop: 4,
                  }}
                >
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3.5 py-2 rounded-lg mx-1 text-sm transition-all duration-150"
                    style={{ color: 'var(--state-error)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        'var(--state-error-light)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <svg
                      className="w-4 h-4 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth="1.8"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    <span>退出登录</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {/* 移动端主题设置入口 */}
            <Link
              to="/settings"
              className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-inset"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="主题设置"
            >
              <svg
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                />
              </svg>
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              登录
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
