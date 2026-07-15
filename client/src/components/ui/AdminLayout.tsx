import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../../store/settingsStore';

/**
 * 管理后台共享布局
 * - 左侧固定侧边栏 w-60（移动端抽屉式，由汉堡按钮触发）
 * - 顶部面包屑（管理后台 / 当前页）
 * - 内容区由 children 提供
 *
 * 与设计稿「后台 - 用户管理.html」一致：
 * - 侧边栏头部：MyNav Logo + "管理后台"
 * - 侧边栏菜单：用户管理 / 导航管理 / 系统设置（当前路由高亮主色背景）
 * - 侧边栏底部：返回前台
 */
interface AdminLayoutProps {
  /** 当前页面名称，用于面包屑 */
  pageName: string;
  /** 右上角自定义操作区（如导出按钮） */
  actions?: ReactNode;
  children: ReactNode;
}

/** 侧边栏菜单项 */
const NAV_ITEMS = [
  {
    key: 'users',
    label: '用户管理',
    to: '/admin/users',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    key: 'nav',
    label: '导航管理',
    to: '/admin/nav',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    key: 'system',
    label: '系统设置',
    to: '/admin/system',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    key: 'logs',
    label: '系统日志',
    to: '/admin/logs',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
] as const;

export function AdminLayout({ pageName, actions, children }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const settings = useSettingsStore((s) => s.settings);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 侧边栏内容（在桌面端固定、移动端抽屉中复用）
  const SidebarInner = (
    <>
      {/* 头部 Logo */}
      <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: 'var(--border-default)' }}>
        <img src="/logo.png" alt="Logo" className="w-9 h-9 object-contain" />
        <span className="font-semibold" style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>
          {settings?.siteName ?? '沐曦导航'} 管理后台
        </span>
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.to;
          const style: React.CSSProperties = active
            ? { background: 'var(--color-primary-50)', color: 'var(--color-primary)' }
            : { color: 'var(--text-secondary)' };
          return (
            <Link
              key={item.key}
              to={item.to}
              onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--bg-inset)]"
              style={style}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* 底部：返回前台 */}
      <div className="px-3 py-4 border-t" style={{ borderColor: 'var(--border-default)' }}>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors w-full"
          style={{ color: 'var(--text-tertiary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.background = 'var(--bg-inset)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-tertiary)';
            e.currentTarget.style.background = '';
          }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          返回前台
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-page)' }}>
      {/* ====== 桌面端固定侧边栏 ====== */}
      <aside
        className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-60 z-10 bg-white border-r"
        style={{ borderColor: 'var(--border-default)' }}
      >
        {SidebarInner}
      </aside>

      {/* ====== 移动端抽屉遮罩 ====== */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-[300] bg-black/40 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      {/* ====== 移动端抽屉 ====== */}
      <aside
        className={`fixed inset-y-0 left-0 w-60 z-[350] bg-white border-r flex flex-col transform transition-transform duration-200 lg:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ borderColor: 'var(--border-default)' }}
      >
        {SidebarInner}
      </aside>

      {/* ====== 右侧主区 ====== */}
      <main className="flex-1 lg:ml-60 min-w-0 flex flex-col">
        {/* 顶部面包屑：移动端纵向堆叠（标题 + 操作），桌面端单行 */}
        <div
          className="sticky top-0 z-[100] flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-3 sm:py-4 bg-white border-b"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {/* 移动端汉堡按钮 */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden flex-shrink-0 p-1.5 rounded-lg"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="打开菜单"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <nav className="text-sm min-w-0 truncate" style={{ color: 'var(--text-tertiary)' }}>
              <span>管理后台</span>
              <span className="mx-1.5">/</span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                {pageName}
              </span>
            </nav>
          </div>
          {actions && (
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:justify-end">
              {actions}
            </div>
          )}
        </div>

        {/* 内容区：移动端缩小内边距 */}
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 flex-1">{children}</div>
      </main>
    </div>
  );
}
