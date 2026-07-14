import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AdminLayout } from '../../components/ui/AdminLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import api from '../../api/axios';
import { encryptPassword } from '../../api/crypto';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import type { AdminUser, Role, UserStatus } from '../../types';

/**
 * 管理后台 - 用户管理
 * 与设计稿「后台 - 用户管理.html」一致：
 * - 左侧固定侧边栏 + 顶部面包屑（由 AdminLayout 提供）
 * - 4 个统计卡片（总用户数 / 今日新增 / 活跃用户 / 管理员数）
 * - 搜索 + 角色/状态筛选
 * - 用户表格（头像/用户名/邮箱/角色/注册时间/状态/操作）
 * - 分页（客户端，每页 10 条）
 *
 * 功能保留：创建用户（Modal）、编辑、重置密码、禁用/启用、删除
 */
const PAGE_SIZE = 10;

export default function UserMgr() {
  const currentUser = useAuthStore((s) => s.user);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // 搜索/筛选
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');

  // 分页
  const [page, setPage] = useState(1);

  // 创建用户弹窗
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<Role>('USER');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newEmail, setNewEmail] = useState('');

  // 编辑用户弹窗
  const [editing, setEditing] = useState<AdminUser | null>(null);

  // 重置密码弹窗
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/users');
      setUsers(data.users);
    } catch (e) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error || '加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // ===== 统计卡片数据 =====
  const stats = useMemo(() => {
    const total = users.length;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todayNew = users.filter((u) => {
      if (!u.createdAt) return false;
      const d = new Date(u.createdAt as string | Date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === todayStr;
    }).length;
    const activeCount = users.filter((u) => u.status === 'active').length;
    const adminCount = users.filter((u) => u.role === 'ADMIN').length;
    return { total, todayNew, activeCount, adminCount };
  }, [users]);

  // ===== 筛选 + 分页 =====
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (kw) {
        const hit =
          u.username.toLowerCase().includes(kw) ||
          (u.email?.toLowerCase().includes(kw) ?? false) ||
          (u.displayName?.toLowerCase().includes(kw) ?? false);
        if (!hit) return false;
      }
      return true;
    });
  }, [users, keyword, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

  // 筛选条件变化时回到第一页
  useEffect(() => {
    setPage(1);
  }, [keyword, roleFilter, statusFilter]);

  // ===== 创建用户 =====
  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) {
      toast.warning('用户名和密码不能为空');
      return;
    }
    if (newPassword.length < 6) {
      toast.warning('密码长度不能少于 6 位');
      return;
    }
    try {
      const encryptedPassword = await encryptPassword(newPassword);
      await api.post('/admin/users', {
        username: newUsername.trim(),
        password: encryptedPassword,
        role: newRole,
        displayName: newDisplayName.trim() || undefined,
        email: newEmail.trim() || undefined,
      });
      toast.success(`用户「${newUsername}」创建成功`);
      setNewUsername('');
      setNewPassword('');
      setNewRole('USER');
      setNewDisplayName('');
      setNewEmail('');
      setShowCreate(false);
      await fetchUsers();
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '创建失败');
    }
  };

  // ===== 编辑用户 =====
  const onUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      const { data } = await api.put(`/admin/users/${editing.id}`, {
        role: editing.role,
        status: editing.status,
        displayName: editing.displayName ?? '',
        email: editing.email ?? '',
        bio: editing.bio ?? '',
      });
      setUsers((list) => list.map((u) => (u.id === data.user.id ? data.user : u)));
      toast.success(`用户「${editing.username}」已更新`);
      setEditing(null);
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '更新失败');
    }
  };

  // ===== 切换启用/禁用 =====
  const onToggleStatus = async (u: AdminUser) => {
    const next: UserStatus = u.status === 'active' ? 'disabled' : 'active';
    try {
      const { data } = await api.put(`/admin/users/${u.id}`, { status: next });
      setUsers((list) => list.map((x) => (x.id === data.user.id ? data.user : x)));
      toast.success(`用户「${u.username}」已${next === 'active' ? '启用' : '禁用'}`);
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '操作失败');
    }
  };

  // ===== 重置密码 =====
  const onResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (!resetPassword) {
      toast.warning('新密码不能为空');
      return;
    }
    if (resetPassword.length < 6) {
      toast.warning('新密码长度不能少于 6 位');
      return;
    }
    try {
      const encryptedPassword = await encryptPassword(resetPassword);
      await api.put(`/admin/users/${resetTarget.id}/password`, { newPassword: encryptedPassword });
      toast.success(`用户「${resetTarget.username}」的密码已重置`);
      setResetTarget(null);
      setResetPassword('');
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '重置失败');
    }
  };

  // ===== 删除用户 =====
  const onDelete = async (u: AdminUser) => {
    if (!window.confirm(`确认删除用户「${u.username}」？此操作不可恢复。`)) return;
    try {
      await api.delete(`/admin/users/${u.id}`);
      setUsers((list) => list.filter((x) => x.id !== u.id));
      toast.success(`用户「${u.username}」已删除`);
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '删除失败');
    }
  };

  // 头像渲染：取首字母，背景色基于用户名 hash
  const renderAvatar = (u: AdminUser) => {
    if (u.avatar) {
      return <img src={u.avatar} alt={u.username} className="w-8 h-8 rounded-full object-cover" />;
    }
    const palette = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-sky-500', 'bg-violet-500', 'bg-rose-500', 'bg-teal-500', 'bg-orange-500'];
    const idx = u.username.charCodeAt(0) % palette.length;
    return (
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium ${palette[idx]}`}>
        {(u.displayName || u.username).slice(0, 1).toUpperCase()}
      </div>
    );
  };

  const formatDate = (v?: string | Date) => {
    if (!v) return '-';
    const d = new Date(v);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <AdminLayout
      pageName="用户管理"
      actions={
        <Button onClick={() => setShowCreate(true)} className="!px-3 sm:!px-4">
          <span className="inline-flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="hidden sm:inline">新建用户</span>
          </span>
        </Button>
      }
    >
      {/* ===== 统计卡片：移动端 2 列紧凑 ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <StatCard label="总用户数" value={stats.total} color="primary" iconPath="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        <StatCard label="今日新增" value={stats.todayNew} color="success" iconPath="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 018.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
        <StatCard label="活跃用户" value={stats.activeCount} color="info" iconPath="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        <StatCard label="管理员数" value={stats.adminCount} color="purple" iconPath="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </div>

      {/* ===== 搜索/筛选栏：移动端纵向堆叠 ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--text-tertiary)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索用户名/邮箱..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-white border rounded-lg outline-none transition-colors focus:ring-2"
            style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-primary)';
              e.currentTarget.style.boxShadow = '0 0 0 2px var(--color-primary-50)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-default)';
              e.currentTarget.style.boxShadow = '';
            }}
          />
        </div>
        <div className="flex gap-2.5">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'all' | Role)}
            className="flex-1 sm:flex-none px-3 py-2 text-sm bg-white border rounded-lg cursor-pointer outline-none focus:ring-2"
            style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
          >
            <option value="all">全部角色</option>
            <option value="ADMIN">管理员</option>
            <option value="USER">普通用户</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | UserStatus)}
            className="flex-1 sm:flex-none px-3 py-2 text-sm bg-white border rounded-lg cursor-pointer outline-none focus:ring-2"
            style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
          >
            <option value="all">全部状态</option>
            <option value="active">正常</option>
            <option value="disabled">已禁用</option>
          </select>
        </div>
      </div>

      {/* ===== 用户列表 ===== */}
      <div className="bg-white border rounded-lg overflow-hidden" style={{ borderColor: 'var(--border-default)' }}>
        {loading ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
            加载中…
          </div>
        ) : pageItems.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {filtered.length === 0 ? '暂无符合条件的用户' : '暂无用户'}
          </div>
        ) : (
          <>
            {/* 桌面端：表格 */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: 'var(--bg-inset)' }}>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>用户</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>邮箱</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>角色</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>注册时间</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>状态</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--border-default)' }}>
                  {pageItems.map((u) => {
                    const isSelf = currentUser?.id === u.id;
                    return (
                      <tr
                        key={u.id}
                        className="transition-colors hover:bg-[var(--bg-inset)]"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {renderAvatar(u)}
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                                {u.displayName || u.username}
                                {isSelf && (
                                  <span
                                    className="text-[10px] px-1 py-0.5 rounded"
                                    style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}
                                  >
                                    你
                                  </span>
                                )}
                              </div>
                              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>@{u.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {u.email || '-'}
                        </td>
                        <td className="px-4 py-3">
                          {u.role === 'ADMIN' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}>
                              管理员
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ background: 'var(--bg-inset)', color: 'var(--text-tertiary)' }}>
                              普通用户
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {formatDate(u.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: u.status === 'active' ? 'var(--state-success)' : 'var(--state-error)' }}
                            />
                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                              {u.status === 'active' ? '正常' : '已禁用'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <button
                              onClick={() => setEditing({ ...u })}
                              className="text-sm font-medium transition-colors"
                              style={{ color: 'var(--color-primary)' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-primary-700)')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-primary)')}
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => onToggleStatus(u)}
                              disabled={isSelf}
                              className="text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ color: 'var(--color-primary)' }}
                              title={isSelf ? '不能禁用自己' : ''}
                            >
                              {u.status === 'active' ? '禁用' : '启用'}
                            </button>
                            <button
                              onClick={() => setResetTarget(u)}
                              className="text-sm font-medium transition-colors"
                              style={{ color: 'var(--text-secondary)' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                            >
                              重置密码
                            </button>
                            <button
                              onClick={() => onDelete(u)}
                              disabled={isSelf}
                              className="text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ color: 'var(--state-error)' }}
                              title={isSelf ? '不能删除自己' : ''}
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 移动端：卡片列表 */}
            <div className="sm:hidden divide-y" style={{ borderColor: 'var(--border-default)' }}>
              {pageItems.map((u) => {
                const isSelf = currentUser?.id === u.id;
                return (
                  <div key={u.id} className="p-3.5 space-y-3">
                    {/* 头部：头像 + 名称 + 状态 */}
                    <div className="flex items-start gap-3">
                      {renderAvatar(u)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {u.displayName || u.username}
                          </span>
                          {isSelf && (
                            <span
                              className="text-[10px] px-1 py-0.5 rounded"
                              style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary)' }}
                            >
                              你
                            </span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={
                            u.role === 'ADMIN'
                              ? { background: 'var(--color-primary-50)', color: 'var(--color-primary)' }
                              : { background: 'var(--bg-inset)', color: 'var(--text-tertiary)' }
                          }>
                            {u.role === 'ADMIN' ? '管理员' : '普通用户'}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: u.status === 'active' ? 'var(--state-success)' : 'var(--state-error)' }}
                            />
                            {u.status === 'active' ? '正常' : '已禁用'}
                          </span>
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>@{u.username}</div>
                        <div className="text-xs mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                          {u.email || '无邮箱'} · {formatDate(u.createdAt)}
                        </div>
                      </div>
                    </div>
                    {/* 操作按钮：两列网格 */}
                    <div className="grid grid-cols-4 gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-default)' }}>
                      <button
                        onClick={() => setEditing({ ...u })}
                        title="编辑"
                        className="text-xs font-medium py-2 rounded-md transition-colors"
                        style={{ color: 'var(--color-primary)', backgroundColor: 'var(--color-primary-50)' }}
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => onToggleStatus(u)}
                        disabled={isSelf}
                        title={isSelf ? '不能禁用自己' : (u.status === 'active' ? '禁用' : '启用')}
                        className="text-xs font-medium py-2 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ color: 'var(--color-primary)', backgroundColor: 'var(--color-primary-50)' }}
                      >
                        {u.status === 'active' ? '禁用' : '启用'}
                      </button>
                      <button
                        onClick={() => setResetTarget(u)}
                        title="重置密码"
                        className="text-xs font-medium py-2 rounded-md transition-colors"
                        style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-inset)' }}
                      >
                        密码
                      </button>
                      <button
                        onClick={() => onDelete(u)}
                        disabled={isSelf}
                        title={isSelf ? '不能删除自己' : '删除'}
                        className="text-xs font-medium py-2 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ color: 'var(--state-error)', backgroundColor: 'var(--state-error-light)' }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ===== 分页 ===== */}
      <div className="flex items-center justify-between flex-wrap gap-2.5">
        <p className="text-xs sm:text-sm" style={{ color: 'var(--text-tertiary)' }}>
          共 {filtered.length} 条
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg border flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-inset)]"
            style={{ borderColor: 'var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-tertiary)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
            .map((p, idx, arr) => {
              // 插入省略号
              const showEllipsisBefore = idx > 0 && p - arr[idx - 1] > 1;
              return (
                <span key={p} className="flex items-center gap-1">
                  {showEllipsisBefore && (
                    <span className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                      …
                    </span>
                  )}
                  <button
                    onClick={() => setPage(p)}
                    className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg text-sm font-medium flex items-center justify-center transition-colors"
                    style={
                      p === currentPage
                        ? { background: 'var(--color-primary)', color: '#fff' }
                        : { background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }
                    }
                  >
                    {p}
                  </button>
                </span>
              );
            })}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg border flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--bg-inset)]"
            style={{ borderColor: 'var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-tertiary)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* ===== 创建用户 Modal ===== */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="新建用户">
        <form onSubmit={onCreate} className="space-y-4">
          <Input label="用户名" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="登录用户名" />
          <Input label="密码" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="至少 6 位" />
          <Input label="昵称（可选）" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="显示名称" />
          <Input label="邮箱（可选）" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="you@example.com" />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>角色</span>
            <div className="flex gap-2">
              {(['USER', 'ADMIN'] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setNewRole(r)}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border cursor-pointer transition text-center"
                  style={
                    newRole === r
                      ? { borderColor: 'var(--color-primary)', background: 'var(--color-primary-50)', color: 'var(--color-primary)' }
                      : { borderColor: 'var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)' }
                  }
                >
                  {r === 'ADMIN' ? '管理员' : '普通用户'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button type="submit">创建用户</Button>
          </div>
        </form>
      </Modal>

      {/* ===== 编辑用户 Modal ===== */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `编辑用户 - ${editing.username}` : ''}>
        {editing && (
          <form onSubmit={onUpdate} className="space-y-4">
            <Input label="昵称" value={editing.displayName ?? ''} onChange={(e) => setEditing({ ...editing, displayName: e.target.value })} />
            <Input label="邮箱" type="email" value={editing.email ?? ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
            <Input label="简介" value={editing.bio ?? ''} onChange={(e) => setEditing({ ...editing, bio: e.target.value })} />
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>角色</span>
                <div className="flex gap-2">
                  {(['USER', 'ADMIN'] as Role[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setEditing({ ...editing, role: r })}
                      className="flex-1 px-3 py-2 text-sm rounded-lg border cursor-pointer transition text-center"
                      style={
                        editing.role === r
                          ? { borderColor: 'var(--color-primary)', background: 'var(--color-primary-50)', color: 'var(--color-primary)' }
                          : { borderColor: 'var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)' }
                      }
                    >
                      {r === 'ADMIN' ? '管理员' : '普通用户'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>状态</span>
                <div className="flex gap-2">
                  {(['active', 'disabled'] as UserStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setEditing({ ...editing, status: s })}
                      className="flex-1 px-3 py-2 text-sm rounded-lg border cursor-pointer transition text-center"
                      style={
                        editing.status === s
                          ? { borderColor: 'var(--color-primary)', background: 'var(--color-primary-50)', color: 'var(--color-primary)' }
                          : { borderColor: 'var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)' }
                      }
                    >
                      {s === 'active' ? '启用' : '禁用'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button type="submit">保存</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ===== 重置密码 Modal ===== */}
      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title={resetTarget ? `重置密码 - ${resetTarget.username}` : ''}>
        {resetTarget && (
          <form onSubmit={onResetPassword} className="space-y-4">
            <Input
              label="新密码"
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="至少 6 位"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>取消</Button>
              <Button type="submit">重置密码</Button>
            </div>
          </form>
        )}
      </Modal>
    </AdminLayout>
  );
}

/**
 * 统计卡片
 * - color: primary / success / info / purple，决定图标背景和图标颜色
 */
function StatCard({
  label,
  value,
  color,
  iconPath,
}: {
  label: string;
  value: number;
  color: 'primary' | 'success' | 'info' | 'purple';
  iconPath: string;
}) {
  const colorMap = {
    primary: { bg: 'var(--color-primary-50)', fg: 'var(--color-primary)' },
    success: { bg: 'var(--state-success-light)', fg: 'var(--state-success)' },
    info: { bg: 'var(--state-info-light)', fg: 'var(--state-info)' },
    purple: { bg: '#F5F3FF', fg: '#8B5CF6' },
  } as const;
  const c = colorMap[color];
  return (
    <div
      className="bg-white border rounded-lg p-3 sm:p-4"
      style={{ borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] sm:text-xs mb-1 truncate" style={{ color: 'var(--text-tertiary)' }}>{label}</p>
          <p className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value.toLocaleString()}</p>
        </div>
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: c.bg }}>
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: c.fg }}>
            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
          </svg>
        </div>
      </div>
    </div>
  );
}
