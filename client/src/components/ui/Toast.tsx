import { useToastStore, type ToastItem, type ToastType } from '../../store/toastStore';

/**
 * 全局提示组件 (Toast)
 * ------------------------------------------------------------------
 * - 固定在屏幕右上角，多条堆叠向下排列
 * - 从右侧滑入，自动消失或点击关闭
 * - 替代 alert / 内联 setError / setMsg 等提示方式
 * - 颜色与图标随 type 变化，复用 CSS 变量适配主题
 */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  // top 偏移避开顶部导航栏（Navbar 高度 h-14 = 56px + 16px 间距 = 72px）
  // z-index 保持高于导航栏，确保滑入时不被遮挡
  return (
    <div
      className="fixed right-4 z-[600] flex flex-col gap-2.5 pointer-events-none"
      style={{ top: '72px', maxWidth: 'calc(100vw - 32px)' }}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} item={t} onClose={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

/** 单条 Toast 卡片 */
function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const { type, message } = item;
  const palette = getPalette(type);

  return (
    <div
      role="alert"
      className="toast-slide-in pointer-events-auto relative flex items-start gap-3 pl-5 pr-4 py-3 rounded-lg border shadow-lg overflow-hidden"
      style={{
        minWidth: 280,
        maxWidth: 380,
        backgroundColor: 'var(--bg-surface)',
        borderColor: palette.border,
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {/* 状态图标 */}
      <span
        className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 mt-0.5"
        style={{ color: palette.fg }}
      >
        {palette.icon}
      </span>

      {/* 文案 */}
      <p
        className="flex-1 text-sm leading-5 break-words"
        style={{ color: 'var(--text-primary)' }}
      >
        {message}
      </p>

      {/* 关闭按钮 */}
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="flex-shrink-0 -mt-0.5 -mr-1 w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-inset"
        style={{ color: 'var(--text-tertiary)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* 左侧状态色条 */}
      <span
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
        style={{ backgroundColor: palette.fg }}
      />
    </div>
  );
}

/** 根据 type 返回颜色与图标 */
function getPalette(type: ToastType): {
  fg: string;
  border: string;
  icon: React.ReactNode;
} {
  switch (type) {
    case 'success':
      return {
        fg: 'var(--state-success)',
        border: 'var(--state-success)',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ),
      };
    case 'error':
      return {
        fg: 'var(--state-error)',
        border: 'var(--state-error)',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        ),
      };
    case 'warning':
      return {
        fg: 'var(--state-warning)',
        border: 'var(--state-warning)',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        ),
      };
    case 'info':
    default:
      return {
        fg: 'var(--state-info)',
        border: 'var(--state-info)',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        ),
      };
  }
}

export default ToastContainer;
