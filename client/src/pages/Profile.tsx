import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Navbar } from '../components/ui/Navbar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuthStore } from '../store/authStore';
import api from '../api/axios';
import { encryptPassword } from '../api/crypto';
import { toast } from '../store/toastStore';

/**
 * 个人中心 / 个人信息界面
 * ------------------------------------------------------------------
 * 设计对齐首页（已登录）设计稿的 Clean & Minimal 系统：
 * - 顶部玻璃导航栏（Navbar）
 * - 主色品牌横幅卡（头像 + 名称 + 角色徽章 + 简介）
 * - 分区卡片：基础信息 / 账户安全 / 快捷入口
 * - 圆角 xl、微阴影、token 文字色
 *
 * 功能：
 * - 未登录跳转登录页
 * - 挂载时拉取最新个人资料
 * - 编辑基础信息：昵称 / 邮箱 / 简介
 * - 头像上传（悬停覆盖层点击上传，前端转 base64 提交）
 * - 修改密码（旧密码 + 新密码 + 确认）
 */
export default function Profile() {
  const { user, token, logout, updateUser } = useAuthStore();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  // 挂载时拉取最新资料，保证展示与服务端一致
  useEffect(() => {
    if (!token) return;
    api
      .get('/user/profile')
      .then(({ data }) => {
        if (data?.user) {
          updateUser(data.user);
          setDisplayName(data.user.displayName ?? '');
          setEmail(data.user.email ?? '');
          setBio(data.user.bio ?? '');
        }
      })
      .catch(() => {
        /* 拉取失败时沿用本地状态，不阻塞页面 */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token || !user) return <Navigate to="/login" replace />;

  const onSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const { data } = await api.put('/user/profile', {
        displayName: displayName.trim(),
        email: email.trim(),
        bio: bio.trim(),
      });
      updateUser(data.user);
      toast.success('个人资料已保存');
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '保存失败');
    } finally {
      setSavingProfile(false);
    }
  };

  const onPickAvatar = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.warning('请选择图片文件');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.warning('图片大小不能超过 2MB');
      return;
    }
    setUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const { data } = await api.post('/user/avatar', { avatar: dataUrl });
        updateUser({ avatar: data.avatar });
        toast.success('头像已更新');
      } catch (e2) {
        toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '头像上传失败');
      } finally {
        setUploadingAvatar(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      toast.error('图片读取失败');
      setUploadingAvatar(false);
    };
    reader.readAsDataURL(file);
  };

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast.warning('请完整填写所有密码字段');
      return;
    }
    if (newPassword.length < 6) {
      toast.warning('新密码长度不能少于 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.warning('两次输入的新密码不一致');
      return;
    }
    setSavingPassword(true);
    try {
      const encryptedOld = await encryptPassword(oldPassword);
      const encryptedNew = await encryptPassword(newPassword);
      await api.put('/user/password', { oldPassword: encryptedOld, newPassword: encryptedNew });
      toast.success('密码修改成功，下次登录请使用新密码');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '密码修改失败');
    } finally {
      setSavingPassword(false);
    }
  };

  /**
   * 备份当前账号下的所有数据
   * 调用 GET /user/backup/export，后端用账号 ID 派生密钥加密后打包为 ZIP 返回
   * 前端将响应体作为 .zip 文件下载
   */
  const onBackup = async () => {
    setBackingUp(true);
    try {
      const response = await api.get('/user/backup/export', { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mynav-user-${user.username}-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('数据备份已下载');
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '备份失败');
    } finally {
      setBackingUp(false);
    }
  };

  /**
   * 选择备份文件后导入恢复
   * 读取 ZIP 文件 → base64 编码 → POST /user/backup/import
   * 注意：导入会覆盖当前账号下的所有私有导航数据
   */
  const onImportFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm('确认导入此备份文件？\n\n此操作将覆盖当前账号下的所有导航数据（含分组、分类、卡片与点击记录），且不可撤销。')) {
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
        const { data } = await api.post('/user/backup/import', { zip: base64 });
        toast.success(`数据已恢复：${data.stats?.groups ?? 0} 个分组 / ${data.stats?.items ?? 0} 个卡片`);
        // 重新拉取资料以反映备份中恢复的字段
        try {
          const { data: profileData } = await api.get('/user/profile');
          if (profileData?.user) {
            updateUser(profileData.user);
            setDisplayName(profileData.user.displayName ?? '');
            setEmail(profileData.user.email ?? '');
            setBio(profileData.user.bio ?? '');
          }
        } catch {
          /* 拉取资料失败时静默 */
        }
      } catch (e2) {
        toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '导入失败');
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

  // 头像展示（大尺寸，用于横幅与上传区）
  const renderAvatar = (size: number) => {
    if (user.avatar) {
      return (
        <img
          src={user.avatar}
          alt={user.username}
          className="rounded-2xl object-cover"
          style={{ width: size, height: size, boxShadow: 'var(--shadow-md)' }}
        />
      );
    }
    return (
      <span
        className="inline-flex items-center justify-center rounded-2xl font-bold text-white"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.4,
          backgroundColor: 'var(--color-primary)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {user.username.slice(0, 1).toUpperCase()}
      </span>
    );
  };

  const showName = user.displayName || user.username;
  const isAdmin = user.role === 'ADMIN';

  // 卡片通用样式（对齐设计稿：白底 + 边框 + 圆角 xl + 微阴影）
  const cardCls = 'bg-surface border rounded-xl p-6 space-y-5';
  const cardStyle = {
    borderColor: 'var(--border-default)',
    boxShadow: 'var(--shadow-sm)',
  };

  // 分区标题：图标 + 标题 + 副标题
  const SectionTitle = ({
    icon,
    title,
    desc,
  }: {
    icon: React.ReactNode;
    title: string;
    desc: string;
  }) => (
    <div className="flex items-center gap-3 pb-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
      <span
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary)' }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {desc}
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8 space-y-6 animate-fade-in">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              个人中心
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
              管理你的账户信息与安全
            </p>
          </div>
          <Link
            to="/"
            className="text-sm font-medium transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
          >
            ← 返回首页
          </Link>
        </div>

        {/* ===== 个人信息横幅卡 ===== */}
        <div
          className="relative overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-sm)' }}
        >
          {/* 顶部品牌色装饰条 */}
          <div
            className="h-20"
            style={{
              background:
                'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-400) 100%)',
            }}
          />
          {/* 内容区：头像 + 名称 + 角色徽章 + 简介 */}
          <div className="bg-surface px-6 pb-6">
            <div className="flex items-end gap-4 -mt-10">
              {/* 头像（带白边，悬浮于装饰条之上） */}
              <div
                className="rounded-2xl ring-4"
                style={{ backgroundColor: 'var(--bg-surface)', ['--tw-ring-color' as string]: 'var(--bg-surface)' }}
              >
                {renderAvatar(80)}
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {showName}
                  </h2>
                  <span
                    className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                    style={
                      isAdmin
                        ? { backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary)' }
                        : { backgroundColor: 'var(--bg-inset)', color: 'var(--text-tertiary)' }
                    }
                  >
                    {isAdmin ? '管理员' : '普通用户'}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 flex-wrap text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <span>@{user.username}</span>
                  <span style={{ color: 'var(--border-strong)' }}>·</span>
                  <span>ID: {user.id}</span>
                  {user.email && (
                    <>
                      <span style={{ color: 'var(--border-strong)' }}>·</span>
                      <span className="truncate">{user.email}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            {user.bio ? (
              <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {user.bio}
              </p>
            ) : (
              <p className="mt-4 text-sm italic" style={{ color: 'var(--text-tertiary)' }}>
                还没有个人简介，在下方「基础信息」中添加吧。
              </p>
            )}
          </div>
        </div>

        {/* ===== 基础信息 ===== */}
        <form onSubmit={onSaveProfile} className={cardCls} style={cardStyle}>
          <SectionTitle
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            }
            title="基础信息"
            desc="头像、昵称、邮箱与个人简介"
          />

          {/* 头像上传：悬停覆盖层 */}
          <div className="flex items-center gap-5">
            <div className="relative group">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="block rounded-2xl transition-transform group-hover:scale-[1.02] disabled:opacity-60"
                title="点击更换头像"
              >
                {renderAvatar(72)}
                {/* 悬停覆盖层 */}
                <span
                  className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: 'rgba(22, 26, 38, 0.55)' }}
                >
                  <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.66-.9l.82-1.2A2 2 0 0110.07 4h3.86a2 2 0 011.66.9l.82 1.2a2 2 0 001.66.9H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-xs font-medium">{uploadingAvatar ? '上传中' : '更换'}</span>
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={onPickAvatar}
                className="hidden"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {uploadingAvatar ? '正在上传…' : '点击头像更换图片'}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                支持 PNG / JPG / WebP / GIF，最大 2MB
              </span>
            </div>
          </div>

          <Input
            label="昵称"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="留空则使用用户名"
            maxLength={32}
          />
          <Input
            label="邮箱"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="可选，如 you@example.com"
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              个人简介
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="介绍一下自己（可选，最多 200 字）"
              maxLength={200}
              rows={3}
              className="px-3.5 py-2.5 text-sm border rounded-lg outline-none transition-all resize-none"
              style={{
                borderColor: 'var(--border-default)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-primary)';
                e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-50)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            <span className="text-xs text-right" style={{ color: 'var(--text-tertiary)' }}>
              {bio.length}/200
            </span>
          </div>
          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={savingProfile}>
              {savingProfile ? '保存中…' : '保存基础信息'}
            </Button>
          </div>
        </form>

        {/* ===== 账户安全 ===== */}
        <form onSubmit={onChangePassword} className={cardCls} style={cardStyle}>
          <SectionTitle
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            }
            title="账户安全"
            desc="修改登录密码，需验证旧密码"
          />
          <Input
            label="旧密码"
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder="输入当前密码"
            autoComplete="current-password"
          />
          <Input
            label="新密码"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="至少 6 位"
            autoComplete="new-password"
          />
          <Input
            label="确认新密码"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="再次输入新密码"
            autoComplete="new-password"
          />
          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={savingPassword}>
              {savingPassword ? '修改中…' : '修改密码'}
            </Button>
          </div>
        </form>

        {/* ===== 数据备份 ===== */}
        <div className={cardCls} style={cardStyle}>
          <SectionTitle
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2-2H6a2 2 0 00-2 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v5m-2.5-2.5h5" />
              </svg>
            }
            title="数据备份"
            desc="备份账号下的所有导航数据，可随时导入恢复"
          />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
            备份内容包含你的私有分组、分类、卡片、点击记录与个人资料（不含密码）。
            备份文件使用你的账号 ID 派生密钥加密，<strong style={{ color: 'var(--text-secondary)' }}>仅能由当前账号恢复</strong>，请妥善保管。
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={onBackup}
              disabled={backingUp || importing}
            >
              <span className="inline-flex items-center gap-2">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {backingUp ? '备份中…' : '备份数据'}
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => importFileRef.current?.click()}
              disabled={backingUp || importing}
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
              onChange={onImportFile}
              className="hidden"
            />
          </div>
        </div>

        {/* ===== 快捷入口 ===== */}
        <div className={cardCls} style={cardStyle}>
          <SectionTitle
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 12h15" />
              </svg>
            }
            title="快捷入口"
            desc="跳转到管理后台与主题设置"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {isAdmin && (
              <>
                <Link
                  to="/admin/nav"
                  className="flex items-center gap-3 bg-surface border rounded-lg p-4 transition-all card-hover"
                  style={{ borderColor: 'var(--border-default)' }}
                >
                  <span
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
                    style={{ backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary)' }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      导航管理后台
                    </div>
                    <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>
                      创建分组、分类与卡片
                    </div>
                  </div>
                </Link>
                <Link
                  to="/admin/users"
                  className="flex items-center gap-3 bg-surface border rounded-lg p-4 transition-all card-hover"
                  style={{ borderColor: 'var(--border-default)' }}
                >
                  <span
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
                    style={{ backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary)' }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-2a4 4 0 10-4-4 4 4 0 004 4z" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      用户管理
                    </div>
                    <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>
                      查看、编辑、禁用或删除账户
                    </div>
                  </div>
                </Link>
                <Link
                  to="/admin/system"
                  className="flex items-center gap-3 bg-surface border rounded-lg p-4 transition-all card-hover"
                  style={{ borderColor: 'var(--border-default)' }}
                >
                  <span
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
                    style={{ backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary)' }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      系统设置
                    </div>
                    <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>
                      站点基本与安全配置
                    </div>
                  </div>
                </Link>
              </>
            )}
            <Link
              to="/settings"
              className="flex items-center gap-3 bg-surface border rounded-lg p-4 transition-all card-hover"
              style={{ borderColor: 'var(--border-default)' }}
            >
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
                style={{ backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary)' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  主题设置
                </div>
                <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>
                  自定义导航页外观
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* ===== 退出登录（危险区） ===== */}
        <div
          className="bg-surface border rounded-xl p-6 flex items-center justify-between"
          style={{ borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-sm)' }}
        >
          <div>
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              退出登录
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              退出当前账户，将返回首页
            </p>
          </div>
          <Button
            variant="danger"
            onClick={() => {
              logout();
              window.location.href = '/';
            }}
          >
            退出登录
          </Button>
        </div>
      </main>
    </div>
  );
}
