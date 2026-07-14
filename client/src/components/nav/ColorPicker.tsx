interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}

// 预设调色板，便于快速选择
const PRESETS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444',
  '#f59e0b', '#10b981', '#06b6d4', '#6366f1',
  '#0f172a', '#24292e', '#fc6d26', '#4285f4',
  '#ffffff', '#f1f5f9', '#e2e8f0', '#cbd5e1',
];

/**
 * 计算颜色的亮度（YIQ 公式），用于判断颜色是否偏亮
 * 返回 0-255，> 200 视为亮色（接近白）
 */
function getLuminance(hex: string): number {
  const c = hex.replace('#', '');
  if (c.length !== 3 && c.length !== 6) return 0;
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // YIQ 亮度公式
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * 浅色色块统一使用深色描边，避免在白底上"消失"
 * 阈值 200：覆盖纯白及接近白的浅灰
 */
function borderForColor(hex: string): string {
  return getLuminance(hex) > 200
    ? 'border-slate-900/70'
    : 'border-white/15';
}

/**
 * 颜色选择器
 * - 原生 input[type=color] 用于自定义取色
 * - 预设色块快速选择
 * - 浅色色块自动加深描边，确保可见性
 */
export function ColorPicker({ value, onChange, label = '颜色' }: ColorPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-slate-300">{label}</span>
      <div className="flex items-center gap-3">
        {/* 自定义取色器 */}
        <label
          className={`relative inline-flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-xl border ${borderForColor(value)}`}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <span
            className="h-full w-full"
            style={{ backgroundColor: value }}
          />
        </label>
        {/* 当前值 */}
        <span className="text-xs font-mono text-slate-400 uppercase">{value}</span>
      </div>
      {/* 预设色块 */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`h-6 w-6 rounded-md border transition ${
              value.toLowerCase() === c.toLowerCase()
                ? 'ring-2 ring-white/60'
                : 'hover:scale-110'
            } ${borderForColor(c)}`}
            style={{ backgroundColor: c }}
            aria-label={`选择颜色 ${c}`}
          />
        ))}
      </div>
    </div>
  );
}

export default ColorPicker;
