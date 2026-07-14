interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  'aria-label'?: string;
}

/**
 * 开关组件（对齐设计稿 .toggle-track / .toggle-thumb）
 * - 44x24 轨道，20x20 圆点
 * - 开启时主色背景 + 圆点右移 20px
 */
export function Toggle({ checked, onChange, ...rest }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative flex-shrink-0 transition-colors"
      style={{
        width: 44,
        height: 24,
        borderRadius: 9999,
        background: checked ? 'var(--color-primary)' : 'var(--color-neutral-300, #CBD1DE)',
        cursor: 'pointer',
      }}
      {...rest}
    >
      <span
        className="absolute rounded-full bg-white transition-transform"
        style={{
          width: 20,
          height: 20,
          top: 2,
          left: 2,
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        }}
      />
    </button>
  );
}

export default Toggle;
