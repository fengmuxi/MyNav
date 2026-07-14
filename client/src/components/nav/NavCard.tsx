import { useState } from 'react';
import type { NavItem } from '../../types';
import { useNavStore } from '../../store/navStore';

interface NavCardProps {
  item: NavItem;
  /** 是否显示 hover 工具栏（已登录 + 有权限） */
  editable?: boolean;
  onEdit?: (item: NavItem) => void;
  onMove?: (item: NavItem) => void;
  onDelete?: (item: NavItem) => void;
}

/** 从 url 提取域名作为副标题 */
function domainOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }
}

/** 取首字母用作 fallback 图标 */
function firstChar(s: string): string {
  return (s?.trim()?.[0] ?? '?').toUpperCase();
}

/** 根据 url 生成后端 favicon 代理地址（避免 GFW 拦截 Google 服务） */
function faviconUrl(url: string): string {
  try {
    // 使用后端代理：/api/util/favicon?url=xxx
    return `/api/util/favicon?url=${encodeURIComponent(url)}`;
  } catch {
    return '';
  }
}

/** 尺寸档位 → 样式映射 */
const SIZE_STYLES = {
  sm: {
    cardCls: 'p-3',
    iconSize: 'w-8 h-8',
    iconText: 'text-base',
    iconEmoji: 'text-base',
    iconImg: 'w-4 h-4',
    titleCls: 'text-xs font-semibold',
    domainCls: 'text-[10px]',
    gap: 'gap-2',
  },
  md: {
    cardCls: 'p-4',
    iconSize: 'w-10 h-10',
    iconText: 'text-lg',
    iconEmoji: 'text-xl',
    iconImg: 'w-5 h-5',
    titleCls: 'text-sm font-semibold',
    domainCls: 'text-xs',
    gap: 'gap-3',
  },
  lg: {
    cardCls: 'p-5',
    iconSize: 'w-12 h-12',
    iconText: 'text-xl',
    iconEmoji: 'text-2xl',
    iconImg: 'w-6 h-6',
    titleCls: 'text-base font-semibold',
    domainCls: 'text-sm',
    gap: 'gap-3',
  },
} as const;

/**
 * 导航卡片 - 对齐设计稿 Clean & Minimal
 * - 白底 + 边框 + 阴影 xs
 * - 根据 size 属性自适应卡片尺寸（sm 紧凑 / md 标准 / lg 宽松）
 * - 图标优先级：用户自定义（emoji/文字/图片URL） > 自动获取 favicon > 首字母
 * - hover 工具栏（editable=true）：编辑 / 移动 / 删除
 * - 卡片悬停：translateY(-2px) + 阴影加深
 */
export function NavCard({ item, editable, onEdit, onMove, onDelete }: NavCardProps) {
  const iconBg = item.color || 'var(--color-primary)';
  const iconRounded = item.shape === 'square' ? 'rounded-md' : 'rounded-lg';
  const sz = SIZE_STYLES[item.size] ?? SIZE_STYLES.md;
  const recordClick = useNavStore((s) => s.recordClick);

  // favicon 自动获取：当用户未设置自定义图标时，尝试从链接获取
  // icon 存在值时为用户自定义（emoji/文字/http 图片），此时不使用 favicon
  const shouldAutoFetch = !item.icon;
  const [faviconFailed, setFaviconFailed] = useState(false);
  const favUrl = shouldAutoFetch ? faviconUrl(item.url) : '';

  /** 渲染图标块内容 */
  function renderIcon() {
    // 1. 用户自定义图标
    // - 以 http 或 /uploads/ 开头 → 图片 URL，直接用 <img> 渲染
    // - 否则视为 emoji/文字
    if (item.icon) {
      if (item.icon.startsWith('http') || item.icon.startsWith('/uploads/')) {
        return <img src={item.icon} alt={item.title} className="w-full h-full object-cover" />;
      }
      return <span className={`${sz.iconEmoji} leading-none`}>{item.icon}</span>;
    }
    // 2. 自动获取 favicon（未失败时）
    if (shouldAutoFetch && favUrl && !faviconFailed) {
      return (
        <img
          src={favUrl}
          alt={item.title}
          className={`${sz.iconImg} object-contain`}
          onError={() => setFaviconFailed(true)}
        />
      );
    }
    // 3. fallback：首字母
    return <span className={`${sz.iconText} font-semibold`}>{firstChar(item.title)}</span>;
  }

  return (
    <div
      className={`card-item relative rounded-xl border cursor-pointer group transition-all duration-200 hover:-translate-y-0.5 ${sz.cardCls}`}
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-default)',
        boxShadow: 'var(--shadow-xs)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-strong)';
        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)';
        e.currentTarget.style.boxShadow = 'var(--shadow-xs)';
      }}
      title={item.note || undefined}
    >
      {/* hover 工具栏 */}
      {editable && (
        <div
          className="absolute top-2 right-2 flex gap-1 rounded-lg px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          style={{
            backgroundColor: 'var(--bg-surface)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit?.(item);
            }}
            className="p-1 rounded transition-colors hover:bg-inset"
            title="编辑"
            aria-label="编辑"
          >
            <svg
              className="w-3.5 h-3.5"
              style={{ color: 'var(--text-tertiary)' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onMove?.(item);
            }}
            className="p-1 rounded transition-colors hover:bg-inset"
            title="移动"
            aria-label="移动"
          >
            <svg
              className="w-3.5 h-3.5"
              style={{ color: 'var(--text-tertiary)' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete?.(item);
            }}
            className="p-1 rounded transition-colors"
            title="删除"
            aria-label="删除"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--state-error-light)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg
              className="w-3.5 h-3.5"
              style={{ color: 'var(--text-tertiary)' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      )}

      {/* 卡片内容 */}
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer noopener"
        className="block"
        onClick={() => recordClick(item.id)}
      >
        <div className={`flex items-start ${sz.gap} mb-2`}>
          {/* 图标块 */}
          <div
            className={`${sz.iconSize} ${iconRounded} flex items-center justify-center flex-shrink-0 text-white overflow-hidden`}
            style={{ backgroundColor: iconBg }}
          >
            {renderIcon()}
          </div>
          {/* 标题 + 域名 */}
          <div className="min-w-0 flex-1">
            <h3
              className={`${sz.titleCls} truncate`}
              style={{ color: 'var(--text-primary)' }}
            >
              {item.title}
            </h3>
            <p
              className={`${sz.domainCls} truncate mt-0.5`}
              style={{ color: 'var(--text-tertiary)' }}
            >
              {domainOf(item.url)}
            </p>
            {/* 备注预览（单行截断，悬停卡片时通过 title 查看完整内容） */}
            {item.note && (
              <p
                className={`${sz.domainCls} truncate mt-0.5 italic opacity-70`}
                style={{ color: 'var(--text-tertiary)' }}
              >
                {item.note}
              </p>
            )}
          </div>
        </div>
      </a>
    </div>
  );
}

export default NavCard;
