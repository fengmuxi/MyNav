import { ReactNode, useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

// 模态框：对齐设计稿 Clean & Minimal
// - 遮罩层：半透明黑 + 模糊
// - 卡片：白底 + 圆角 + 大阴影
export function Modal({ open, onClose, title, children }: ModalProps) {
  // ESC 关闭 + 锁定滚动
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      style={{ backgroundColor: 'var(--bg-overlay)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-xl sm:rounded-xl max-h-[90vh] overflow-y-auto animate-fade-in"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-xl)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 移动端底部抽屉 grab handle */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-default)' }} />
        </div>
        <div className="p-4 sm:p-6">
          {title && (
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3
                className="text-base sm:text-lg font-semibold min-w-0 truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {title}
              </h3>
              <button
                onClick={onClose}
                className="transition text-xl leading-none w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center hover:bg-inset flex-shrink-0"
                style={{ color: 'var(--text-tertiary)' }}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

export default Modal;
