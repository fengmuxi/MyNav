import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

// 通用输入框：对齐设计稿 Clean & Minimal
// - 白底 + 默认边框
// - focus 时边框变主色 + 3px 主色软光环
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, className = '', id, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={id}
          className="text-sm font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={`h-11 px-3.5 text-sm rounded-lg border bg-surface outline-none transition-all duration-150 placeholder:text-tertiary focus:border-focus focus:ring-2 ${className}`}
        style={{
          borderColor: 'var(--border-default)',
          color: 'var(--text-primary)',
          // focus 时的软光环通过 boxShadow 实现
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ['--tw-ring-color' as any]: 'var(--color-primary-50)',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-focus)';
          e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-50)';
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-default)';
          e.currentTarget.style.boxShadow = 'none';
          props.onBlur?.(e);
        }}
        {...props}
      />
    </div>
  ),
);
Input.displayName = 'Input';

export default Input;
