import { Link } from 'react-router-dom';
import { Navbar } from '../components/ui/Navbar';
import { Button } from '../components/ui/Button';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';
import { THEME_PRESETS, type CardRadius, type CardShadow } from '../types';

/**
 * 设置页 - 对齐设计稿主题设置页
 * - 左 60%：设置表单（主题名称 + 预设方案 + 主色调 + 卡片样式 + 操作按钮）
 * - 右 40%：实时预览（模拟浏览器框架 + 卡片网格）
 * - 修改实时反映到全局 DOM token 变量
 * - 「保存主题」同步到后端（已登录）；「重置默认」恢复 DEFAULT_THEME
 */

const RADIUS_OPTIONS: { value: CardRadius; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'sm', label: '小' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '大' },
  { value: 'xl', label: '特大' },
];

const SHADOW_OPTIONS: { value: CardShadow; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'sm', label: '浅' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '深' },
  { value: 'glow', label: '辉光' },
];

// 主色调候选（设计稿）
const ACCENT_COLORS = [
  '#4F6EF7', '#3B82F6', '#14B8A6', '#22C55E',
  '#F59E0B', '#F97316', '#F43F5E', '#A855F7',
];

export default function Settings() {
  const { theme, usePreset, patch, reset, save } = useThemeStore();
  const { user, token } = useAuthStore();

  // 保存主题：
  // - 已登录：save 内部 PUT /user/theme 同步到账户
  // - 未登录：save 内部直接跳过，主题已由 persist 写入 localStorage
  const onSave = async () => {
    try {
      await save();
      toast.success(token ? '主题已保存' : '主题已保存到本地浏览器');
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '主题保存失败',
      );
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 mx-auto max-w-6xl w-full px-4 sm:px-6 py-8">
        {/* 页面标题 */}
        <div className="flex items-center justify-between mb-8 animate-fade-in">
          <div>
            <h1
              className="text-2xl font-semibold mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              主题设置
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              自定义你的导航页面外观
              {token && user
                ? `（已登录，修改将保存到「${user.username}」的账户）`
                : '（未登录，修改仅保存在本地浏览器）'}
            </p>
          </div>
          <Link
            to="/"
            className="hidden sm:flex items-center gap-1 text-sm font-medium transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-tertiary)';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>返回首页</span>
          </Link>
        </div>

        {/* 两栏布局 */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* 左：设置表单 */}
          <div className="lg:w-[60%] space-y-6">
            {/* 主题名称 */}
            <section
              className="rounded-xl border p-6 animate-fade-in"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-default)',
              }}
            >
              <h2
                className="text-sm font-semibold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                主题名称
              </h2>
              <input
                type="text"
                value={theme.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="输入主题名称"
                className="w-full h-10 px-3 text-sm rounded-lg border outline-none transition-all duration-150"
                style={{
                  backgroundColor: 'var(--bg-inset)',
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
            </section>

            {/* 配色方案预设 */}
            <section
              className="rounded-xl border p-6 animate-fade-in"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-default)',
              }}
            >
              <h2
                className="text-sm font-semibold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                配色方案
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {THEME_PRESETS.map((p) => {
                  const active = theme.presetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => usePreset(p)}
                      className="rounded-lg border p-3 flex flex-col items-center gap-2 transition-all duration-150"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: active
                          ? 'var(--color-primary)'
                          : 'var(--border-default)',
                        boxShadow: active
                          ? '0 0 0 2px var(--color-primary-50)'
                          : 'none',
                      }}
                    >
                      <div
                        className="w-[80px] h-[50px] rounded-md border flex items-center justify-center"
                        style={{
                          backgroundColor: p.background,
                          borderColor: 'var(--border-default)',
                        }}
                      >
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: p.accentColor }}
                        />
                      </div>
                      <span
                        className="text-xs font-medium"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {p.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 主色调 */}
            <section
              className="rounded-xl border p-6 animate-fade-in"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-default)',
              }}
            >
              <h2
                className="text-sm font-semibold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                主色调
              </h2>
              <div className="flex items-center gap-3 flex-wrap">
                {ACCENT_COLORS.map((c) => {
                  const active = theme.accentColor.toLowerCase() === c.toLowerCase();
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => patch({ accentColor: c })}
                      className="w-9 h-9 rounded-full transition-all duration-150"
                      style={{
                        backgroundColor: c,
                        boxShadow: active
                          ? `0 0 0 2px var(--bg-surface), 0 0 0 4px ${c}`
                          : 'var(--shadow-sm)',
                      }}
                      aria-label={`主色 ${c}`}
                    />
                  );
                })}
                {/* 自定义颜色 */}
                <label
                  className="w-9 h-9 rounded-full border cursor-pointer relative overflow-hidden"
                  style={{ borderColor: 'var(--border-default)' }}
                  title="自定义颜色"
                >
                  <input
                    type="color"
                    value={theme.accentColor}
                    onChange={(e) => patch({ accentColor: e.target.value })}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <svg
                    className="w-full h-full p-1.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </label>
              </div>
            </section>

            {/* 卡片样式 */}
            <section
              className="rounded-xl border p-6 animate-fade-in"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-default)',
              }}
            >
              <h2
                className="text-sm font-semibold mb-5"
                style={{ color: 'var(--text-primary)' }}
              >
                卡片样式
              </h2>

              <div className="space-y-5">
                {/* 圆角 */}
                <div>
                  <label
                    className="text-sm font-medium mb-2 block"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    圆角大小
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {RADIUS_OPTIONS.map((opt) => {
                      const active = theme.cardRadius === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => patch({ cardRadius: opt.value })}
                          className="px-4 py-1.5 rounded-full border text-xs font-medium transition-all duration-150"
                          style={
                            active
                              ? {
                                  backgroundColor: 'var(--color-primary)',
                                  borderColor: 'var(--color-primary)',
                                  color: '#FFFFFF',
                                }
                              : {
                                  backgroundColor: 'var(--bg-surface)',
                                  borderColor: 'var(--border-default)',
                                  color: 'var(--text-secondary)',
                                }
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 阴影 */}
                <div>
                  <label
                    className="text-sm font-medium mb-2 block"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    阴影模式
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {SHADOW_OPTIONS.map((opt) => {
                      const active = theme.cardShadow === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => patch({ cardShadow: opt.value })}
                          className="px-4 py-1.5 rounded-full border text-xs font-medium transition-all duration-150"
                          style={
                            active
                              ? {
                                  backgroundColor: 'var(--color-primary)',
                                  borderColor: 'var(--color-primary)',
                                  color: '#FFFFFF',
                                }
                              : {
                                  backgroundColor: 'var(--bg-surface)',
                                  borderColor: 'var(--border-default)',
                                  color: 'var(--text-secondary)',
                                }
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            {/* 操作按钮 */}
            <div className="flex items-center gap-3 pt-2">
              <Button type="button" onClick={() => void onSave()}>
                保存主题
              </Button>
              <Button type="button" variant="outline" onClick={reset}>
                重置默认
              </Button>
            </div>
          </div>

          {/* 右：实时预览 */}
          <div className="lg:w-[40%]">
            <div className="sticky top-20">
              <h2
                className="text-sm font-semibold mb-3"
                style={{ color: 'var(--text-primary)' }}
              >
                实时预览
              </h2>
              {/* 模拟浏览器框架 */}
              <div
                className="rounded-xl border overflow-hidden animate-fade-in"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-default)',
                  boxShadow: 'var(--shadow-lg)',
                }}
              >
                {/* 浏览器顶部栏 */}
                <div
                  className="flex items-center gap-2 px-3 py-2 border-b"
                  style={{
                    backgroundColor: 'var(--bg-inset)',
                    borderColor: 'var(--border-default)',
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#EF4444' }} />
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#F59E0B' }} />
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#22C55E' }} />
                  </div>
                  <div
                    className="flex-1 h-5 rounded flex items-center px-2"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                  >
                    <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                      mynav.example.com
                    </span>
                  </div>
                </div>

                {/* 预览内容 */}
                <div className="p-4" style={{ backgroundColor: 'var(--bg-page)' }}>
                  {/* 分类标签 */}
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded text-white"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                    >
                      常用
                    </span>
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded border"
                      style={{
                        color: 'var(--text-tertiary)',
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-default)',
                      }}
                    >
                      开发
                    </span>
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded border"
                      style={{
                        color: 'var(--text-tertiary)',
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-default)',
                      }}
                    >
                      设计
                    </span>
                  </div>

                  {/* 迷你卡片网格 */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      'var(--color-primary-100)',
                      'var(--state-info-light)',
                      'var(--state-success-light)',
                      'var(--state-warning-light)',
                      'var(--state-error-light)',
                      'var(--color-primary-50)',
                    ].map((bg, i) => (
                      <div
                        key={i}
                        className="rounded-lg border p-2"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: 'var(--border-default)',
                          boxShadow: 'var(--shadow-card)',
                          borderRadius: 'var(--radius-card)',
                        }}
                      >
                        <div
                          className="w-5 h-5 rounded mb-1.5"
                          style={{ backgroundColor: bg }}
                        />
                        <div
                          className="w-12 h-1.5 rounded-full mb-1"
                          style={{ backgroundColor: 'var(--border-strong)' }}
                        />
                        <div
                          className="w-8 h-1 rounded-full"
                          style={{ backgroundColor: 'var(--border-default)' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 状态提示 */}
              <div
                className="mt-4 text-xs rounded-lg px-3 py-2"
                style={{
                  backgroundColor: 'var(--bg-inset)',
                  color: 'var(--text-tertiary)',
                }}
              >
                当前主题：{theme.name}（{theme.presetId}）
                <br />
                修改会实时应用到全页面
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
