import { useEffect, useRef, useState } from 'react';
import { AdminLayout } from '../../components/ui/AdminLayout';
import { Button } from '../../components/ui/Button';
import { Toggle } from '../../components/ui/Toggle';
import { OAuthIcon } from '../../components/ui/OAuthIcon';
import api from '../../api/axios';
import { clearPublicKeyCache } from '../../api/crypto';
import { toast } from '../../store/toastStore';
import { useAuthStore } from '../../store/authStore';
import {
  DEFAULT_SETTINGS,
  OAUTH_PROVIDER_META,
  type OAuthProviderId,
  type RegisterMethod,
  type SystemSettings,
} from '../../types/settings';

/**
 * 管理后台 - 系统设置
 * ------------------------------------------------------------------
 * 与设计稿「后台 - 系统设置.html」一致，包含 6 个区块：
 * 1. 基本设置（站点名称/描述/图标/ICP）
 * 2. 注册设置（允许注册开关/注册方式/默认角色/邀请码）
 * 3. 第三方注册配置（Google/GitHub/微信/QQ/微博 启用开关 + Client ID + Client Secret）
 * 4. 功能设置（自定义主题/公开导航页/每页数量/搜索）
 * 5. 安全设置（锁定次数/锁定时长/会话超时/两步验证）
 * 6. 维护设置（维护模式/维护公告/清缓存/数据备份）
 *
 * 持久化：后端 /api/admin/settings 读写完整设置（含 clientSecret）
 * 缓存：localStorage 仅作输入态临时缓存，避免编辑中途丢失
 */
const CACHE_KEY = 'mynav-system-settings-draft';

/** 通用 input 样式（聚焦时主色边框 + 软光环） */
const inputCls =
  'w-full h-9 px-3 text-sm border rounded-md outline-none transition-all';
const inputStyle: React.CSSProperties = {
  borderColor: 'var(--border-default)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
};
const textareaCls =
  'w-full px-3 py-2 text-sm border rounded-md outline-none transition-all resize-y';

function focusHandlers() {
  return {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = 'var(--color-primary)';
      e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-50)';
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = 'var(--border-default)';
      e.currentTarget.style.boxShadow = 'none';
    },
  };
}

export default function SystemSettings() {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  // RSA 密钥信息：{ publicKey, createdAt }，独立于系统设置加载
  const [rsaInfo, setRsaInfo] = useState<{ publicKey: string; createdAt: number } | null>(null);
  const [rsaRegenerating, setRsaRegenerating] = useState(false);
  // 服务器数据备份相关状态
  const [backupPassword, setBackupPassword] = useState('');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const { logout } = useAuthStore();

  // 首次加载：从后端拉取设置；失败时尝试读取本地草稿
  useEffect(() => {
    api
      .get<SystemSettings>('/admin/settings')
      .then(({ data }) => {
        setSettings(data || DEFAULT_SETTINGS);
        setLoaded(true);
      })
      .catch(() => {
        // 后端不可用：尝试本地草稿
        try {
          const raw = localStorage.getItem(CACHE_KEY);
          if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
        } catch {
          /* ignore */
        }
        setLoaded(true);
      });
  }, []);

  // 加载 RSA 公钥信息（独立请求，失败不影响主设置编辑）
  useEffect(() => {
    api
      .get<{ publicKey: string; createdAt: number }>('/admin/rsa/public-key')
      .then(({ data }) => setRsaInfo(data))
      .catch(() => {
        /* RSA 信息加载失败时静默处理，不影响主设置 */
      });
  }, []);

  // 编辑过程同步写入本地草稿（仅作断网恢复用，主存储为后端）
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings, loaded]);

  // 局部更新
  const patch = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  // 更新某个 oauthProvider
  const patchProvider = (
    id: OAuthProviderId,
    field: 'enabled' | 'clientId' | 'clientSecret',
    value: string | boolean,
  ) => {
    setSettings((s) => ({
      ...s,
      oauthProviders: s.oauthProviders.map((p) =>
        p.id === id ? { ...p, [field]: value } : p,
      ),
    }));
  };

  // 保存到后端
  const onSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.put<SystemSettings>('/admin/settings', settings);
      setSettings(data);
      toast.success('设置已保存');
    } catch (e) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || '保存失败';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // 重置：清除本地草稿，重新从后端拉取
  const onReset = async () => {
    if (!window.confirm('确认放弃当前修改并重新加载后端设置？')) return;
    localStorage.removeItem(CACHE_KEY);
    toast.info('正在重新加载…');
    try {
      const { data } = await api.get<SystemSettings>('/admin/settings');
      setSettings(data || DEFAULT_SETTINGS);
      toast.success('已重新加载后端设置');
    } catch {
      toast.error('加载失败');
    }
  };

  // 清除缓存（前端层面提示）
  const onClearCache = async () => {
    toast.info('正在清除缓存…');
    try {
      await new Promise((r) => setTimeout(r, 600));
      toast.success('缓存已清除');
    } catch {
      toast.error('清除缓存失败');
    }
  };

  // 数据备份（调用后端导出公开导航数据，明文 JSON）
  const onBackup = async () => {
    toast.info('正在导出公开导航数据…');
    try {
      const { data } = await api.get('/public/nav');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mynav-nav-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('公开导航数据已下载');
    } catch {
      toast.error('导出失败：无法获取导航数据');
    }
  };

  /**
   * 服务器全量数据备份（加密）
   * 使用管理员输入的自定义密码 + PBKDF2 派生密钥，AES-256-GCM 加密后打包为 ZIP
   */
  const onServerExport = async () => {
    if (!backupPassword) {
      toast.warning('请输入备份密码');
      return;
    }
    if (backupPassword.length < 6) {
      toast.warning('备份密码至少 6 位');
      return;
    }
    if (!window.confirm('确认开始服务器数据备份？\n\n备份将包含所有用户、导航数据与系统设置（含密码哈希），请妥善保管备份文件与密码。丢失密码将无法恢复。')) {
      return;
    }
    setExporting(true);
    try {
      const response = await api.post('/admin/backup/export', { password: backupPassword }, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mynav-server-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('服务器数据备份已下载');
      setBackupPassword('');
    } catch (e) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error || '备份失败';
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  };

  /**
   * 选择备份文件后导入恢复
   * 读取 ZIP 文件 → base64 编码 → POST /admin/backup/import
   * 使用密码框中的密码解密，全量恢复服务器数据
   */
  const onServerImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!backupPassword) {
      toast.warning('请先输入备份密码');
      if (importFileRef.current) importFileRef.current.value = '';
      return;
    }
    if (!window.confirm('⚠️ 警告：确认导入服务器备份？\n\n此操作将清空当前服务器所有数据（用户、导航、设置等）并替换为备份文件中的内容。\n\n• 当前管理员账号将被替换为备份中的账号\n• 操作完成后需使用备份中的账号重新登录\n• 此操作不可撤销，请确保已做好当前数据备份\n\n是否继续？')) {
      if (importFileRef.current) importFileRef.current.value = '';
      return;
    }
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        // 将 ZIP 文件转为 base64 后发送
        const arrayBuffer = reader.result as ArrayBuffer;
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce(
            (str, byte) => str + String.fromCharCode(byte),
            '',
          ),
        );
        const { data } = await api.post('/admin/backup/import', {
          password: backupPassword,
          zip: base64,
        });
        toast.success(data?.message || '服务器数据已恢复');
        // 清除登录态并跳转登录页（当前管理员账号已被替换）
        setTimeout(() => {
          logout();
          window.location.href = '/login';
        }, 1500);
      } catch (e2) {
        const msg =
          (e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '导入失败';
        toast.error(msg);
      } finally {
        setImporting(false);
        if (importFileRef.current) importFileRef.current.value = '';
      }
    };
    reader.onerror = () => {
      toast.error('文件读取失败');
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  // 重新生成 RSA 密钥对
  // - 二次确认：避免误操作导致旧密钥加密的密码无法解密
  // - 成功后清除前端公钥缓存，使下次加密使用新公钥
  const onRegenerateRsa = async () => {
    if (!window.confirm('确认重新生成 RSA 密钥对？\n\n重新生成后，已打开页面的用户需刷新浏览器才能正常登录/注册，否则密码将无法解密。')) {
      return;
    }
    setRsaRegenerating(true);
    try {
      const { data } = await api.put<{ publicKey: string; createdAt: number }>('/admin/rsa/regenerate');
      setRsaInfo({ publicKey: data.publicKey, createdAt: data.createdAt });
      clearPublicKeyCache();
      toast.success('RSA 密钥对已重新生成');
    } catch (e) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || '重新生成失败';
      toast.error(msg);
    } finally {
      setRsaRegenerating(false);
    }
  };

  if (!loaded) return null;

  // 区块标题样式
  const sectionCls = 'bg-white border rounded-lg p-6 space-y-5';
  const sectionStyle = { borderColor: 'var(--border-default)' };
  const titleCls = 'text-lg font-semibold';
  const titleStyle = { color: 'var(--text-primary)' };
  const subtitleCls = 'mt-1 text-sm';
  const subtitleStyle = { color: 'var(--text-tertiary)' };
  const labelCls = 'block text-sm font-medium mb-1.5';
  const labelStyle = { color: 'var(--text-secondary)' };

  return (
    <AdminLayout pageName="系统设置">
      <div className="max-w-3xl space-y-6">
        {/* ====== 1. 基本设置 ====== */}
        <section className={sectionCls} style={sectionStyle}>
          <div className="mb-5">
            <h2 className={titleCls} style={titleStyle}>基本设置</h2>
            <p className={subtitleCls} style={subtitleStyle}>配置站点的基本信息</p>
          </div>
          <div className="space-y-5">
            <div>
              <label className={labelCls} style={labelStyle}>站点名称</label>
              <input
                type="text"
                value={settings.siteName}
                onChange={(e) => patch('siteName', e.target.value)}
                className={inputCls}
                style={inputStyle}
                {...focusHandlers()}
              />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>站点描述</label>
              <textarea
                rows={3}
                value={settings.siteDescription}
                onChange={(e) => patch('siteDescription', e.target.value)}
                className={textareaCls}
                style={inputStyle}
                {...focusHandlers()}
              />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>站点图标</label>
              <div
                className="w-full h-28 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors"
                style={{ borderColor: 'var(--border-default)', background: 'var(--bg-inset)' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
                onClick={() => toast.info('图标上传功能待后端支持')}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-neutral-400, #9AA3B8)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span className="mt-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {settings.siteIcon ? '已上传图标' : '点击上传图标'}
                </span>
              </div>
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>ICP备案号</label>
              <input
                type="text"
                value={settings.icp}
                onChange={(e) => patch('icp', e.target.value)}
                placeholder="京ICP备XXXXXXXX号"
                className={inputCls}
                style={inputStyle}
                {...focusHandlers()}
              />
            </div>
          </div>
        </section>

        {/* ====== 2. 注册设置 ====== */}
        <section className={sectionCls} style={sectionStyle}>
          <div className="mb-5">
            <h2 className={titleCls} style={titleStyle}>注册设置</h2>
            <p className={subtitleCls} style={subtitleStyle}>管理用户注册方式与权限</p>
          </div>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>允许新用户注册</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>关闭后注册接口返回 403，仅管理员可建号</div>
              </div>
              <Toggle checked={settings.allowRegister} onChange={(v) => patch('allowRegister', v)} aria-label="允许新用户注册" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2.5" style={labelStyle}>注册方式</label>
              <div className="flex flex-wrap gap-4">
                {([
                  { value: 'email', label: '邮箱注册' },
                  { value: 'invite', label: '邀请码注册' },
                  { value: 'closed', label: '关闭注册' },
                ] as { value: RegisterMethod; label: string }[]).map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="register-method"
                      value={opt.value}
                      checked={settings.registerMethod === opt.value}
                      onChange={() => patch('registerMethod', opt.value)}
                      className="w-4 h-4"
                      style={{ accentColor: 'var(--color-primary)' }}
                    />
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>默认用户角色</label>
              <select
                value={settings.defaultRole}
                onChange={(e) => patch('defaultRole', e.target.value as 'USER' | 'ADMIN')}
                className={inputCls}
                style={inputStyle}
              >
                <option value="USER">普通用户</option>
                <option value="ADMIN">管理员</option>
              </select>
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>邀请码</label>
              <input
                type="text"
                value={settings.inviteCode}
                onChange={(e) => patch('inviteCode', e.target.value)}
                className={inputCls}
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}
                {...focusHandlers()}
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                选择"邀请码注册"时，用户需输入此邀请码才能完成注册
              </p>
            </div>
          </div>
        </section>

        {/* ====== 3. 第三方注册配置 ====== */}
        <section className={sectionCls} style={sectionStyle}>
          <div className="mb-5">
            <h2 className={titleCls} style={titleStyle}>第三方注册配置</h2>
            <p className={subtitleCls} style={subtitleStyle}>
              启用后将在注册页显示对应入口；未启用的注册方式不显示。需填写各平台的 OAuth App 凭据。
            </p>
          </div>
          <div className="space-y-4">
            {settings.oauthProviders.map((p) => {
              const meta = OAUTH_PROVIDER_META[p.id];
              return (
                <div
                  key={p.id}
                  className="border rounded-lg p-4"
                  style={{ borderColor: 'var(--border-default)' }}
                >
                  {/* 头部：图标 + 名称 + 启用开关 */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md"
                        style={{ backgroundColor: 'var(--bg-inset)', color: meta.color }}
                      >
                        <OAuthIcon id={p.id} size={18} />
                      </span>
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {meta.name}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {p.enabled ? '已启用' : '未启用'}
                        </div>
                      </div>
                    </div>
                    <Toggle
                      checked={p.enabled}
                      onChange={(v) => patchProvider(p.id, 'enabled', v)}
                      aria-label={`启用 ${meta.name} 注册`}
                    />
                  </div>
                  {/* 凭据输入：Client ID + Client Secret */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        Client ID
                      </label>
                      <input
                        type="text"
                        value={p.clientId}
                        onChange={(e) => patchProvider(p.id, 'clientId', e.target.value)}
                        placeholder="OAuth App Client ID"
                        className="w-full h-8 px-3 text-sm border rounded-md outline-none transition-all"
                        style={inputStyle}
                        {...focusHandlers()}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        Client Secret
                      </label>
                      <input
                        type="password"
                        value={p.clientSecret}
                        onChange={(e) => patchProvider(p.id, 'clientSecret', e.target.value)}
                        placeholder="OAuth App Client Secret"
                        className="w-full h-8 px-3 text-sm border rounded-md outline-none transition-all"
                        style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                        {...focusHandlers()}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              提示：Client Secret 仅管理员可见，不会通过公开接口返回。OAuth 回调流程待后端实现，前端入口已就绪。
            </p>
          </div>
        </section>

        {/* ====== 3.5 邮件 SMTP 配置 ====== */}
        <section className={sectionCls} style={sectionStyle}>
          <div className="mb-5">
            <h2 className={titleCls} style={titleStyle}>邮件 SMTP 配置</h2>
            <p className={subtitleCls} style={subtitleStyle}>
              用于忘记密码等邮件通知。启用后用户可通过邮箱自助重置密码；未启用时忘记密码接口返回开发模式重置链接。
            </p>
          </div>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>启用邮件发送</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>关闭后忘记密码将返回开发模式链接（不发送邮件）</div>
              </div>
              <Toggle
                checked={settings.smtp.enabled}
                onChange={(v) => patch('smtp', { ...settings.smtp, enabled: v })}
                aria-label="启用邮件发送"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <div className="sm:col-span-2">
                <label className={labelCls} style={labelStyle}>SMTP 服务器</label>
                <input
                  type="text"
                  value={settings.smtp.host}
                  onChange={(e) => patch('smtp', { ...settings.smtp, host: e.target.value })}
                  placeholder="如 smtp.qq.com / smtp.gmail.com"
                  className={inputCls}
                  style={inputStyle}
                  {...focusHandlers()}
                />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>端口</label>
                <input
                  type="number"
                  value={settings.smtp.port}
                  onChange={(e) => patch('smtp', { ...settings.smtp, port: Number(e.target.value) || 0 })}
                  className={inputCls}
                  style={inputStyle}
                  {...focusHandlers()}
                />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>加密方式</label>
                <select
                  value={settings.smtp.secure ? 'ssl' : 'starttls'}
                  onChange={(e) => patch('smtp', { ...settings.smtp, secure: e.target.value === 'ssl' })}
                  className={inputCls}
                  style={inputStyle}
                >
                  <option value="ssl">SSL (465)</option>
                  <option value="starttls">STARTTLS (587)</option>
                </select>
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>用户名</label>
                <input
                  type="text"
                  value={settings.smtp.user}
                  onChange={(e) => patch('smtp', { ...settings.smtp, user: e.target.value })}
                  placeholder="SMTP 登录账号"
                  className={inputCls}
                  style={inputStyle}
                  {...focusHandlers()}
                />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>密码 / 授权码</label>
                <input
                  type="password"
                  value={settings.smtp.pass}
                  onChange={(e) => patch('smtp', { ...settings.smtp, pass: e.target.value })}
                  placeholder="SMTP 登录密码或授权码"
                  className={inputCls}
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                  {...focusHandlers()}
                />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>发件人名称</label>
                <input
                  type="text"
                  value={settings.smtp.fromName}
                  onChange={(e) => patch('smtp', { ...settings.smtp, fromName: e.target.value })}
                  placeholder="如 MyNav"
                  className={inputCls}
                  style={inputStyle}
                  {...focusHandlers()}
                />
              </div>
              <div>
                <label className={labelCls} style={labelStyle}>发件人邮箱</label>
                <input
                  type="email"
                  value={settings.smtp.fromEmail}
                  onChange={(e) => patch('smtp', { ...settings.smtp, fromEmail: e.target.value })}
                  placeholder="发件人邮箱地址（不填则用 SMTP 用户名）"
                  className={inputCls}
                  style={inputStyle}
                  {...focusHandlers()}
                />
              </div>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              提示：QQ 邮箱需使用授权码而非登录密码；Gmail 需使用应用专用密码。生产环境需先安装 nodemailer：<code style={{ fontFamily: 'var(--font-mono)' }}>cd server && npm install nodemailer</code>
            </p>
          </div>
        </section>

        {/* ====== 4. 功能设置 ====== */}
        <section className={sectionCls} style={sectionStyle}>
          <div className="mb-5">
            <h2 className={titleCls} style={titleStyle}>功能设置</h2>
            <p className={subtitleCls} style={subtitleStyle}>开关和配置站点功能模块</p>
          </div>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>允许用户自定义主题</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>用户可自定义导航页的外观样式</div>
              </div>
              <Toggle checked={settings.allowCustomTheme} onChange={(v) => patch('allowCustomTheme', v)} aria-label="允许自定义主题" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>允许用户公开导航页</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>用户可选择将自己的导航页设为公开可见</div>
              </div>
              <Toggle checked={settings.allowPublicNav} onChange={(v) => patch('allowPublicNav', v)} aria-label="允许公开导航页" />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>默认每页显示数量</label>
              <div
                className="inline-flex items-center border rounded-md overflow-hidden"
                style={{ borderColor: 'var(--border-default)' }}
              >
                <button
                  type="button"
                  onClick={() => patch('pageSize', Math.max(1, settings.pageSize - 1))}
                  className="w-9 h-9 flex items-center justify-center transition-colors"
                  style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-inset)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-surface)')}
                >
                  −
                </button>
                <input
                  type="text"
                  value={settings.pageSize}
                  readOnly
                  className="w-15 h-9 text-center text-sm border-x outline-none"
                  style={{ width: 60, borderColor: 'var(--border-default)', color: 'var(--text-primary)', background: 'var(--bg-surface)' }}
                />
                <button
                  type="button"
                  onClick={() => patch('pageSize', Math.min(100, settings.pageSize + 1))}
                  className="w-9 h-9 flex items-center justify-center transition-colors"
                  style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-inset)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-surface)')}
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>启用搜索功能</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>允许用户通过关键词搜索导航链接</div>
              </div>
              <Toggle checked={settings.enableSearch} onChange={(v) => patch('enableSearch', v)} aria-label="启用搜索功能" />
            </div>
          </div>
        </section>

        {/* ====== 5. 安全设置 ====== */}
        <section className={sectionCls} style={sectionStyle}>
          <div className="mb-5">
            <h2 className={titleCls} style={titleStyle}>安全设置</h2>
            <p className={subtitleCls} style={subtitleStyle}>配置登录安全与会话管理</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <label className={labelCls} style={labelStyle}>登录失败锁定次数</label>
              <input
                type="number"
                value={settings.maxLoginAttempts}
                onChange={(e) => patch('maxLoginAttempts', Number(e.target.value) || 0)}
                className={inputCls}
                style={inputStyle}
                {...focusHandlers()}
              />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>锁定时长（分钟）</label>
              <input
                type="number"
                value={settings.lockMinutes}
                onChange={(e) => patch('lockMinutes', Number(e.target.value) || 0)}
                className={inputCls}
                style={inputStyle}
                {...focusHandlers()}
              />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>会话超时（小时）</label>
              <input
                type="number"
                value={settings.sessionHours}
                onChange={(e) => patch('sessionHours', Number(e.target.value) || 0)}
                className={inputCls}
                style={inputStyle}
                {...focusHandlers()}
              />
            </div>
            <div className="sm:col-span-2 flex items-center justify-between pt-1">
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>强制两步验证</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>所有用户登录时必须进行两步验证</div>
              </div>
              <Toggle checked={settings.force2FA} onChange={(v) => patch('force2FA', v)} aria-label="强制两步验证" />
            </div>
          </div>
        </section>

        {/* ====== 5.5 RSA 密钥管理 ====== */}
        <section className={sectionCls} style={sectionStyle}>
          <div className="mb-5">
            <h2 className={titleCls} style={titleStyle}>RSA 密钥管理</h2>
            <p className={subtitleCls} style={subtitleStyle}>
              用于加密登录、注册等敏感接口的密码字段。密钥对存储在后端，首次访问时自动生成。
            </p>
          </div>
          <div className="space-y-4">
            {rsaInfo ? (
              <>
                <div>
                  <label className={labelCls} style={labelStyle}>创建时间</label>
                  <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {new Date(rsaInfo.createdAt).toLocaleString('zh-CN')}
                  </div>
                </div>
                <div>
                  <label className={labelCls} style={labelStyle}>当前公钥（PEM）</label>
                  <textarea
                    readOnly
                    rows={6}
                    value={rsaInfo.publicKey}
                    className={textareaCls}
                    style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                  />
                </div>
              </>
            ) : (
              <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                正在加载密钥信息…
              </div>
            )}
            <div
              className="flex items-start gap-3 p-3 rounded-md"
              style={{ background: 'var(--bg-inset)' }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-warning, #F59E0B)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-shrink-0 mt-0.5"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                重新生成密钥对后，<strong>已打开页面的用户需刷新浏览器</strong>才能获取新公钥，否则其登录/注册请求将因密码无法解密而失败。
              </div>
            </div>
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={onRegenerateRsa}
                disabled={rsaRegenerating}
              >
                {rsaRegenerating ? '重新生成中…' : '重新生成密钥对'}
              </Button>
            </div>
          </div>
        </section>

        {/* ====== 6. 维护设置 ====== */}
        <section className={sectionCls} style={sectionStyle}>
          <div className="mb-5">
            <h2 className={titleCls} style={titleStyle}>维护设置</h2>
            <p className={subtitleCls} style={subtitleStyle}>站点维护与数据管理</p>
          </div>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>站点维护模式</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>开启后仅管理员可访问站点</div>
              </div>
              <Toggle checked={settings.maintenanceMode} onChange={(v) => patch('maintenanceMode', v)} aria-label="站点维护模式" />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>维护公告</label>
              <textarea
                rows={3}
                value={settings.maintenanceNotice}
                onChange={(e) => patch('maintenanceNotice', e.target.value)}
                placeholder="站点维护中，请稍后再试..."
                className={textareaCls}
                style={inputStyle}
                {...focusHandlers()}
              />
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" onClick={onClearCache}>
                <span className="inline-flex items-center gap-2">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  清除缓存
                </span>
              </Button>
              <Button type="button" variant="outline" onClick={onBackup}>
                <span className="inline-flex items-center gap-2">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  导出公开导航
                </span>
              </Button>
            </div>
          </div>
        </section>

        {/* ====== 6.5 GitHub 开源信息配置 ====== */}
        <section className={sectionCls} style={sectionStyle}>
          <div className="mb-5">
            <h2 className={titleCls} style={titleStyle}>GitHub 开源信息</h2>
            <p className={subtitleCls} style={subtitleStyle}>
              配置后将在页脚展示开源仓库链接，并支持自动检查 GitHub Release 是否有新版本
            </p>
          </div>
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  显示 GitHub 开源入口
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  开启后页脚将显示 GitHub 仓库链接与版本检查入口
                </div>
              </div>
              <Toggle
                checked={settings.githubEnabled}
                onChange={(v) => patch('githubEnabled', v)}
                aria-label="显示 GitHub 开源入口"
              />
            </div>
            <div>
              <label className={labelCls} style={labelStyle}>GitHub 仓库地址</label>
              <input
                type="url"
                value={settings.githubUrl}
                onChange={(e) => patch('githubUrl', e.target.value)}
                placeholder="https://github.com/your-username/your-repo"
                className={inputCls}
                style={inputStyle}
                {...focusHandlers()}
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                填写仓库主页地址，系统会自动调用 GitHub API 检查最新 Release 版本
              </p>
            </div>
          </div>
        </section>

        {/* ====== 7. 服务器数据备份与恢复 ====== */}
        <section className={sectionCls} style={sectionStyle}>
          <div className="mb-5">
            <h2 className={titleCls} style={titleStyle}>服务器数据备份与恢复</h2>
            <p className={subtitleCls} style={subtitleStyle}>
              使用自定义密码加密全站数据（含用户、导航、设置），支持跨实例迁移与灾难恢复
            </p>
          </div>
          <div className="space-y-5">
            {/* 安全提示 */}
            <div
              className="flex items-start gap-3 p-3 rounded-md"
              style={{ background: 'var(--bg-inset)' }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-warning, #F59E0B)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-shrink-0 mt-0.5"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                <strong>安全提示：</strong>
                <ul className="mt-1 space-y-0.5 list-disc list-inside">
                  <li>备份内容包含<strong>所有用户密码哈希</strong>与系统设置（含 OAuth Secret、SMTP 密码等敏感字段）</li>
                  <li>加密密码<strong>不会保存在服务器</strong>，丢失密码将无法解密备份文件</li>
                  <li>导入操作将<strong>清空并替换</strong>当前服务器所有数据，操作不可撤销</li>
                  <li>导入后当前管理员账号会被替换，需使用备份文件中的账号重新登录</li>
                </ul>
              </div>
            </div>

            {/* 备份密码输入 */}
            <div>
              <label className={labelCls} style={labelStyle}>备份 / 恢复密码</label>
              <input
                type="password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                placeholder="至少 6 位，用于加密或解密备份文件"
                className={inputCls}
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                {...focusHandlers()}
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                备份时使用此密码加密，恢复时需输入相同密码解密
              </p>
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-wrap gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={onServerExport}
                disabled={exporting || importing}
              >
                <span className="inline-flex items-center gap-2">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {exporting ? '备份中…' : '备份数据'}
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => importFileRef.current?.click()}
                disabled={exporting || importing}
              >
                <span className="inline-flex items-center gap-2">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  {importing ? '导入中…' : '导入数据'}
                </span>
              </Button>
              <input
                ref={importFileRef}
                type="file"
                accept="application/zip,.zip"
                onChange={onServerImportFile}
                className="hidden"
              />
            </div>
          </div>
        </section>
      </div>

      {/* ====== 底部粘性操作栏 ====== */}
      <div
        className="sticky bottom-0 -mx-4 sm:-mx-6 mt-6 px-4 sm:px-6 py-3 flex justify-end gap-3 border-t"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', boxShadow: '0 -1px 3px rgba(22, 26, 38, 0.04)' }}
      >
        <Button type="button" variant="outline" onClick={onReset}>重置</Button>
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving ? '保存中…' : '保存设置'}
        </Button>
      </div>
    </AdminLayout>
  );
}
