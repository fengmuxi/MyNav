import { THEME_PRESETS, type ThemePreset, type CardRadius, type CardShadow } from '../../types';
import { useThemeStore } from '../../store/themeStore';
import { ColorPicker } from './ColorPicker';

/** 圆角档位选项 */
const RADIUS_OPTIONS: { value: CardRadius; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'sm', label: '小' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '大' },
  { value: 'xl', label: '特大' },
];

/** 阴影模式选项 */
const SHADOW_OPTIONS: { value: CardShadow; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'sm', label: '浅' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '深' },
  { value: 'glow', label: '辉光' },
];

const radioCls =
  'flex-1 px-3 py-2 text-xs rounded-lg border cursor-pointer transition text-center';

/**
 * 主题选择器
 * - 上方：6 套预设方案缩略卡片，点击即用
 * - 下方：自定义调节（背景色/表面色/强调色/文字色 + 圆角/阴影 Radio）
 * - 修改后自动保存到后端（如已登录）
 */
export function ThemePicker() {
  const { theme, usePreset, patch, reset, save } = useThemeStore();

  return (
    <div className="space-y-6">
      {/* ===== 预设方案 ===== */}
      <section>
        <h3 className="mb-3 text-sm text-slate-300">预设方案</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {THEME_PRESETS.map((p: ThemePreset) => {
            const active = theme.presetId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => usePreset(p)}
                className={`group relative overflow-hidden rounded-xl border p-3 text-left transition ${
                  active
                    ? 'border-accent ring-2 ring-offset-2 ring-offset-transparent'
                    : 'border-white/10 hover:border-white/30'
                }`}
                style={{ backgroundColor: p.background, color: p.textColor }}
              >
                {/* 缩略色块 */}
                <div className="mb-2 flex items-center gap-1.5">
                  <span
                    className="h-4 w-4 rounded-full border border-white/20"
                    style={{ backgroundColor: p.accentColor }}
                  />
                  <span
                    className="h-4 w-4 rounded border border-white/20"
                    style={{ backgroundColor: p.surfaceColor }}
                  />
                </div>
                <div className="text-sm font-medium">{p.name}</div>
                {active && (
                  <span
                    className="absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[10px]"
                    style={{ backgroundColor: p.accentColor, color: '#fff' }}
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* ===== 自定义调节 ===== */}
      <section className="space-y-4 border-t border-white/10 pt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm text-slate-300">自定义调节</h3>
          {theme.presetId === 'custom' && (
            <span className="text-[11px] px-2 py-0.5 rounded-full glass text-amber-300 border border-amber-400/30">
              自定义
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorPicker
            label="背景色"
            value={theme.background}
            onChange={(c) => patch({ background: c })}
          />
          <ColorPicker
            label="强调色"
            value={theme.accentColor}
            onChange={(c) => patch({ accentColor: c })}
          />
          <ColorPicker
            label="文字色"
            value={theme.textColor}
            onChange={(c) => patch({ textColor: c })}
          />
          {/* 表面色用文本输入（rgba 不好用 color 控件） */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-slate-300">表面色 (rgba)</label>
            <input
              type="text"
              value={theme.surfaceColor}
              onChange={(e) => patch({ surfaceColor: e.target.value })}
              placeholder="rgba(255,255,255,0.05)"
              className="glass rounded-xl px-3 py-2 text-xs font-mono text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
        </div>

        {/* 圆角 Radio */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-slate-300">卡片圆角</span>
          <div className="flex gap-2">
            {RADIUS_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`${radioCls} ${
                  theme.cardRadius === opt.value
                    ? 'border-accent bg-accent/20 text-accent'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                <input
                  type="radio"
                  name="radius"
                  className="hidden"
                  checked={theme.cardRadius === opt.value}
                  onChange={() => patch({ cardRadius: opt.value })}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* 阴影 Radio */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-slate-300">阴影模式</span>
          <div className="flex gap-2">
            {SHADOW_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`${radioCls} ${
                  theme.cardShadow === opt.value
                    ? 'border-accent bg-accent/20 text-accent'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                <input
                  type="radio"
                  name="shadow"
                  className="hidden"
                  checked={theme.cardShadow === opt.value}
                  onChange={() => patch({ cardShadow: opt.value })}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 操作按钮 ===== */}
      <div className="flex gap-2 border-t border-white/10 pt-4">
        <button
          onClick={() => void save()}
          className="flex-1 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          保存主题
        </button>
        <button
          onClick={reset}
          className="rounded-xl glass px-4 py-2 text-sm text-slate-300 hover:bg-white/10 transition"
        >
          恢复默认
        </button>
      </div>
    </div>
  );
}

export default ThemePicker;
