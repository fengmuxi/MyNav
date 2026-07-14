import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

// 按钮样式：对齐设计稿 Clean & Minimal
// - primary: 主色填充 + hover 加深 + 轻微阴影
// - outline: 白底 + 边框
// - ghost: 透明 + hover 浅灰
// - danger: 红色填充
const variants: Record<Variant, string> = {
  primary:
    'text-white border border-transparent hover:shadow-md active:translate-y-px',
  outline:
    'bg-surface text-secondary border border-default hover:bg-inset hover:border-strong',
  ghost:
    'bg-transparent text-secondary border border-transparent hover:bg-inset',
  danger:
    'text-white border border-transparent hover:shadow-md active:translate-y-px',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
};

// 通用按钮：使用 token 变量驱动颜色，平滑过渡
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', style, ...props }, ref) => {
    // primary/danger 通过内联 style 设置背景色（消费 --color-primary / --state-error）
    const isPrimary = variant === 'primary';
    const isDanger = variant === 'danger';
    const bgStyle: React.CSSProperties = isPrimary
      ? { backgroundColor: 'var(--color-primary)' }
      : isDanger
        ? { backgroundColor: 'var(--state-error)' }
        : {};
    return (
      <button
        ref={ref}
        style={{ ...bgStyle, ...style }}
        className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export default Button;
