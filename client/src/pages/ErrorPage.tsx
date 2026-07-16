import { useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { Button } from '../components/ui/Button';

/**
 * 异常路由页面 - 对齐设计稿 Clean & Minimal
 * ------------------------------------------------------------------
 * 覆盖常见 HTTP 异常状态：404 / 403 / 500 / 502 / 503
 * - 内联 SVG 插画，按错误码切换主题色与图形，无外部依赖
 * - 消费设计稿 token（var(--xxx)），自动适配深色主题
 * - 提供返回首页 / 返回上一页 / 我的导航 等快捷操作
 */

type ErrorCode = '404' | '403' | '500' | '502' | '503';

interface ErrorConfig {
  /** 大标题数字 */
  code: ErrorCode;
  /** 主提示语 */
  title: string;
  /** 副提示语 */
  description: string;
  /** 插画主题色（会覆盖 --color-primary 上下文，但不写 DOM） */
  accent: string;
  /** 插画类型，用于切换 SVG */
  illustration: 'compass' | 'lock' | 'gear' | 'cloud' | 'wrench';
}

const ERROR_MAP: Record<ErrorCode, ErrorConfig> = {
  '404': {
    code: '404',
    title: '页面走丢了',
    description: '你访问的页面不存在，可能已被移动或删除。',
    accent: 'var(--color-primary)',
    illustration: 'compass',
  },
  '403': {
    code: '403',
    title: '没有权限',
    description: '抱歉，你没有访问该页面的权限，请联系管理员。',
    accent: 'var(--state-warning)',
    illustration: 'lock',
  },
  '500': {
    code: '500',
    title: '服务器开小差了',
    description: '服务器遇到内部错误，我们正在排查，请稍后重试。',
    accent: 'var(--state-error)',
    illustration: 'gear',
  },
  '502': {
    code: '502',
    title: '网关异常',
    description: '上游服务暂时无响应，请检查服务状态或稍后再试。',
    accent: 'var(--state-error)',
    illustration: 'cloud',
  },
  '503': {
    code: '503',
    title: '服务维护中',
    description: '系统正在维护或升级，请稍后再来访问。',
    accent: 'var(--state-info)',
    illustration: 'wrench',
  },
};

/* ================================================================
   内联 SVG 插画组件
   ================================================================ */

function CompassIllustration({ accent }: { accent: string }) {
  return (
    <svg
      width="180"
      height="180"
      viewBox="0 0 180 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="error-illustration"
    >
      {/* 外圈光晕 */}
      <circle cx="90" cy="90" r="78" stroke={accent} strokeWidth="1.5" opacity="0.15" />
      <circle cx="90" cy="90" r="66" stroke={accent} strokeWidth="2" opacity="0.3" />
      {/* 罗盘外环 */}
      <circle cx="90" cy="90" r="52" stroke={accent} strokeWidth="3" fill="none" />
      {/* 罗盘刻度 */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 90 + Math.cos(rad) * 52;
        const y1 = 90 + Math.sin(rad) * 52;
        const x2 = 90 + Math.cos(rad) * 44;
        const y2 = 90 + Math.sin(rad) * 44;
        return (
          <line
            key={deg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={accent}
            strokeWidth="2"
            strokeLinecap="round"
          />
        );
      })}
      {/* 指针 */}
      <polygon points="90,48 100,90 90,84 80,90" fill={accent} opacity="0.9" />
      <polygon points="90,132 80,90 90,96 100,90" fill="var(--text-tertiary)" opacity="0.4" />
      {/* 中心点 */}
      <circle cx="90" cy="90" r="4" fill={accent} />
      {/* N 标记 */}
      <text
        x="90"
        y="30"
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill={accent}
        fontFamily="Inter, sans-serif"
      >
        N
      </text>
      {/* 漂浮的小点装饰 */}
      <circle cx="30" cy="40" r="3" fill={accent} opacity="0.3">
        <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="150" cy="50" r="2" fill={accent} opacity="0.4">
        <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="155" cy="130" r="2.5" fill={accent} opacity="0.3">
        <animate attributeName="opacity" values="0.3;0.7;0.3" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="25" cy="135" r="2" fill={accent} opacity="0.4">
        <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2.2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function LockIllustration({ accent }: { accent: string }) {
  return (
    <svg
      width="180"
      height="180"
      viewBox="0 0 180 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="error-illustration"
    >
      {/* 外圈光晕 */}
      <circle cx="90" cy="90" r="72" stroke={accent} strokeWidth="1.5" opacity="0.15" />
      <circle cx="90" cy="90" r="60" stroke={accent} strokeWidth="2" opacity="0.25" />
      {/* 锁体 */}
      <rect x="58" y="82" width="64" height="52" rx="10" stroke={accent} strokeWidth="3" fill="none" />
      {/* 锁梁 */}
      <path
        d="M70 82 V70 a20 20 0 0 1 40 0 V82"
        stroke={accent}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      {/* 锁孔 */}
      <circle cx="90" cy="104" r="6" fill={accent} />
      <rect x="87" y="108" width="6" height="14" rx="3" fill={accent} />
      {/* 装饰小点 */}
      <circle cx="40" cy="50" r="2.5" fill={accent} opacity="0.4">
        <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="140" cy="45" r="2" fill={accent} opacity="0.3">
        <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="145" cy="140" r="3" fill={accent} opacity="0.35">
        <animate attributeName="opacity" values="0.35;0.85;0.35" dur="2.1s" repeatCount="indefinite" />
      </circle>
      <circle cx="35" cy="145" r="2" fill={accent} opacity="0.4">
        <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function GearIllustration({ accent }: { accent: string }) {
  return (
    <svg
      width="180"
      height="180"
      viewBox="0 0 180 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="error-illustration"
    >
      {/* 外圈光晕 */}
      <circle cx="90" cy="90" r="72" stroke={accent} strokeWidth="1.5" opacity="0.15" />
      {/* 大齿轮 */}
      <g style={{ transformOrigin: '90px 90px' }}>
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 90 90"
          to="360 90 90"
          dur="12s"
          repeatCount="indefinite"
        />
        <path
          d="M90 48 L96 48 L99 58 L109 62 L118 56 L124 62 L118 71 L122 81 L132 84 L132 96 L122 99 L118 109 L124 118 L118 124 L109 118 L99 122 L96 132 L84 132 L81 122 L71 118 L62 124 L56 118 L62 109 L58 99 L48 96 L48 84 L58 81 L62 71 L56 62 L62 56 L71 62 L81 58 L84 48 Z"
          stroke={accent}
          strokeWidth="2.5"
          fill="none"
          opacity="0.7"
        />
        <circle cx="90" cy="90" r="16" stroke={accent} strokeWidth="3" fill="none" />
      </g>
      {/* 小齿轮（反向旋转） */}
      <g style={{ transformOrigin: '135px 55px' }}>
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="360 135 55"
          to="0 135 55"
          dur="8s"
          repeatCount="indefinite"
        />
        <circle cx="135" cy="55" r="10" stroke={accent} strokeWidth="2" fill="none" opacity="0.5" />
        {[0, 60, 120, 180, 240, 300].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const x1 = 135 + Math.cos(rad) * 10;
          const y1 = 55 + Math.sin(rad) * 10;
          const x2 = 135 + Math.cos(rad) * 14;
          const y2 = 55 + Math.sin(rad) * 14;
          return (
            <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={accent} strokeWidth="2" opacity="0.4" />
          );
        })}
      </g>
      {/* 警告标记 */}
      <circle cx="90" cy="90" r="4" fill={accent}>
        <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function CloudIllustration({ accent }: { accent: string }) {
  return (
    <svg
      width="180"
      height="180"
      viewBox="0 0 180 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="error-illustration"
    >
      {/* 外圈光晕 */}
      <circle cx="90" cy="90" r="72" stroke={accent} strokeWidth="1.5" opacity="0.15" />
      {/* 云朵 */}
      <path
        d="M56 110 a20 20 0 0 1 4 -39 a28 28 0 0 1 54 -6 a22 22 0 0 1 10 45 z"
        stroke={accent}
        strokeWidth="3"
        fill="none"
        strokeLinejoin="round"
      />
      {/* 断裂线 */}
      <path
        d="M85 82 L92 92 L88 100"
        stroke={accent}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      >
        <animate attributeName="opacity" values="0.6;0.2;0.6" dur="2s" repeatCount="indefinite" />
      </path>
      <path
        d="M96 88 L102 98"
        stroke={accent}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      >
        <animate attributeName="opacity" values="0.6;0.2;0.6" dur="2s" repeatCount="indefinite" begin="0.3s" />
      </path>
      {/* 装饰小点 */}
      <circle cx="40" cy="60" r="2" fill={accent} opacity="0.4">
        <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2.3s" repeatCount="indefinite" />
      </circle>
      <circle cx="145" cy="65" r="2.5" fill={accent} opacity="0.3">
        <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2.7s" repeatCount="indefinite" />
      </circle>
      <circle cx="140" cy="140" r="2" fill={accent} opacity="0.4">
        <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function WrenchIllustration({ accent }: { accent: string }) {
  return (
    <svg
      width="180"
      height="180"
      viewBox="0 0 180 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="error-illustration"
    >
      {/* 外圈光晕 */}
      <circle cx="90" cy="90" r="72" stroke={accent} strokeWidth="1.5" opacity="0.15" />
      <circle cx="90" cy="90" r="60" stroke={accent} strokeWidth="2" opacity="0.25" />
      {/* 扳手 */}
      <g style={{ transformOrigin: '90px 90px' }}>
        <animateTransform
          attributeName="transform"
          type="rotate"
          values="-15 90 90; 15 90 90; -15 90 90"
          dur="3s"
          repeatCount="indefinite"
        />
        {/* 扳手柄 */}
        <rect x="86" y="86" width="8" height="50" rx="3" stroke={accent} strokeWidth="2.5" fill="none" transform="rotate(45 90 90)" />
        {/* 扳手头 */}
        <path
          d="M70 70 a16 16 0 0 1 28 -10 a12 12 0 0 0 -8 8 a12 12 0 0 0 8 8 a16 16 0 0 1 -28 -6 z"
          stroke={accent}
          strokeWidth="2.5"
          fill="none"
          strokeLinejoin="round"
        />
      </g>
      {/* 螺母装饰 */}
      <g style={{ transformOrigin: '135px 125px' }}>
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 135 125"
          to="360 135 125"
          dur="10s"
          repeatCount="indefinite"
        />
        <polygon
          points="135,112 146,118.5 146,131.5 135,138 124,131.5 124,118.5"
          stroke={accent}
          strokeWidth="2"
          fill="none"
          opacity="0.5"
        />
        <circle cx="135" cy="125" r="4" stroke={accent} strokeWidth="2" fill="none" opacity="0.5" />
      </g>
      {/* 装饰小点 */}
      <circle cx="35" cy="55" r="2.5" fill={accent} opacity="0.4">
        <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="40" cy="140" r="2" fill={accent} opacity="0.3">
        <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/* ================================================================
   插画选择器
   ================================================================ */
function Illustration({ type, accent }: { type: ErrorConfig['illustration']; accent: string }) {
  switch (type) {
    case 'compass':
      return <CompassIllustration accent={accent} />;
    case 'lock':
      return <LockIllustration accent={accent} />;
    case 'gear':
      return <GearIllustration accent={accent} />;
    case 'cloud':
      return <CloudIllustration accent={accent} />;
    case 'wrench':
      return <WrenchIllustration accent={accent} />;
    default:
      return <CompassIllustration accent={accent} />;
  }
}

/* ================================================================
   主组件
   ================================================================ */
interface ErrorPageProps {
  /** 错误码，决定插画与文案 */
  code?: ErrorCode;
}

export default function ErrorPage({ code = '404' }: ErrorPageProps) {
  const navigate = useNavigate();
  const settings = useSettingsStore((s) => s.settings);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const config = useMemo(() => ERROR_MAP[code] ?? ERROR_MAP['404'], [code]);
  const siteName = settings?.siteName ?? 'MyNav';

  useEffect(() => {
    document.title = `${config.code} · ${siteName}`;
  }, [config.code, siteName]);

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ backgroundColor: 'var(--bg-page)' }}
    >
      <div className="w-full max-w-[460px] text-center animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="14" stroke="var(--color-primary)" strokeWidth="2.5" fill="none" />
            <path
              d="M16 6 L16 10 M16 22 L16 26 M6 16 L10 16 M22 16 L26 16 M9.5 9.5 L12.3 12.3 M19.7 19.7 L22.5 22.5 M9.5 22.5 L12.3 19.7 M19.7 12.3 L22.5 9.5"
              stroke="var(--color-primary)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <polygon points="16,11 18,15 22,15.8 19,18.6 19.8,22.5 16,20.5 12.2,22.5 13,18.6 10,15.8 14,15" fill="var(--color-primary)" />
          </svg>
          <span
            className="text-lg font-bold"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
          >
            {siteName}
          </span>
        </div>

        {/* 插画卡片 */}
        <div
          className="rounded-2xl p-10 mb-8 flex items-center justify-center"
          style={{
            backgroundColor: 'var(--bg-surface)',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border-default)',
          }}
        >
          <Illustration type={config.illustration} accent={config.accent} />
        </div>

        {/* 错误码大数字 */}
        <h1
          className="text-6xl font-bold mb-3"
          style={{
            color: config.accent,
            letterSpacing: '-0.03em',
            fontFamily: 'var(--font-display)',
            lineHeight: 1,
          }}
        >
          {config.code}
        </h1>

        {/* 标题 */}
        <h2
          className="text-xl font-semibold mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          {config.title}
        </h2>

        {/* 描述 */}
        <p
          className="text-sm mb-8 max-w-[340px] mx-auto"
          style={{ color: 'var(--text-tertiary)', lineHeight: 1.6 }}
        >
          {config.description}
        </p>

        {/* 操作按钮组 */}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate('/')}
          >
            返回首页
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate(-1)}
          >
            返回上一页
          </Button>
        </div>

        {/* 快捷链接 */}
        <div
          className="flex items-center justify-center gap-4 mt-6 text-xs"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <Link
            to="/"
            className="transition-colors hover:underline"
            style={{ color: 'var(--text-link)' }}
          >
            首页
          </Link>
          <span style={{ color: 'var(--border-default)' }}>|</span>
          {token && user ? (
            <Link
              to="/my/nav"
              className="transition-colors hover:underline"
              style={{ color: 'var(--text-link)' }}
            >
              我的导航
            </Link>
          ) : (
            <Link
              to="/login"
              className="transition-colors hover:underline"
              style={{ color: 'var(--text-link)' }}
            >
              登录
            </Link>
          )}
          <span style={{ color: 'var(--border-default)' }}>|</span>
          <Link
            to="/settings"
            className="transition-colors hover:underline"
            style={{ color: 'var(--text-link)' }}
          >
            设置
          </Link>
        </div>
      </div>
    </main>
  );
}
