import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '../components/ui/Navbar';
import { NavGrid } from '../components/nav/NavGrid';
import { NavCard } from '../components/nav/NavCard';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { ColorPicker } from '../components/nav/ColorPicker';
import { useAuthStore } from '../store/authStore';
import { useNavStore } from '../store/navStore';
import { useSettingsStore } from '../store/settingsStore';
import api from '../api/axios';
import { toast } from '../store/toastStore';
import type { NavItem } from '../types';

type Shape = 'rounded' | 'square';
type Size = 'sm' | 'md' | 'lg';

/**
 * 首页 - 对齐设计稿 Clean & Minimal
 * - 未登录：Hero（标题+副标题+搜索框）+ 分类标签条 + 公共导航卡片网格
 * - 已登录：欢迎栏（用户名+添加网站按钮）+ 分类标签条 + 私有导航卡片网格
 * - 搜索框：按标题/URL 模糊匹配前端筛选
 * - 分类标签：按 group 名筛选，"全部" 重置
 *
 * 维护模式（系统设置 maintenanceMode=true）：
 * - 非管理员：显示维护页面（隐藏导航内容 + 展示维护公告）
 * - 管理员：顶部显示维护中横幅，可正常浏览预览
 */
export default function Home() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const {
    groups,
    loading,
    error,
    maintenance,
    maintenanceNotice,
    topItems,
    topLoaded,
    fetchPublic,
    fetchPrivate,
    fetchTop,
    clear,
  } = useNavStore();

  const [keyword, setKeyword] = useState('');
  // 'all' = 全部分组；'top' = 常用导航（默认）；其他字符串 = 对应分组名
  const [activeGroup, setActiveGroup] = useState<'all' | 'top' | string>('top');
  // 标记是否已执行过首次自动回退（避免重复回退影响用户后续手动切换）
  const hasInitialFallback = useRef(false);
  const settings = useSettingsStore((s) => s.settings);

  // ===== 首页内联编辑：添加 / 编辑 / 删除卡片 =====
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [editingItem, setEditingItem] = useState<NavItem | null>(null);

  // 创建卡片表单
  const [itemTitle, setItemTitle] = useState('');
  const [itemUrl, setItemUrl] = useState('');
  const [itemIcon, setItemIcon] = useState('');
  const [itemGroupId, setItemGroupId] = useState<number | ''>('');
  const [itemCategoryId, setItemCategoryId] = useState<number | ''>('');
  const [itemColor, setItemColor] = useState('#ffffff');
  const [itemShape, setItemShape] = useState<Shape>('rounded');
  const [itemSize, setItemSize] = useState<Size>('sm');
  const [itemNote, setItemNote] = useState('');

  // 快速创建分组 / 分类（用户在首页无分组时也可直接创建）
  const [quickGroupName, setQuickGroupName] = useState('');
  const [quickCatName, setQuickCatName] = useState('');

  // 图标上传
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const createIconRef = useRef<HTMLInputElement>(null);
  const editIconRef = useRef<HTMLInputElement>(null);

  // 维护模式判定：综合公开设置与 store 中的 503 响应
  // - maintenanceMode=true（来自 settingsStore）：非管理员在发请求前拦截
  // - maintenance=true（来自 /public/nav 的 503 响应）：兜底处理，避免漏掉边角情况
  const maintenanceMode = settings?.maintenanceMode === true;
  const blockedByMaintenance =
    (maintenanceMode || maintenance) && user?.role !== 'ADMIN';
  const notice = maintenanceNotice || settings?.maintenanceNotice || '';

  // 动态设置页面标题
  useEffect(() => {
    if (settings?.siteName) {
      document.title = settings.siteName;
    }
  }, [settings?.siteName]);

  useEffect(() => {
    // persist 水合未完成：token 可能还是 null（即将被恢复为真实值）
    // 此时不应发起任何请求，避免登录用户闪现公共导航
    if (!hasHydrated) return;
    // 维护模式拦截非管理员：不发起导航数据请求
    if (blockedByMaintenance) return;
    // token 变化时先清空旧数据，避免切换登录态时残留上一状态的数据
    clear();
    // 默认切换到「常用」视图，并重置自动回退标记
    setActiveGroup('top');
    hasInitialFallback.current = false;
    if (token) {
      fetchPrivate();
    } else {
      fetchPublic();
    }
    // 加载常用导航 Top 10（与登录态一致：已登录按用户、匿名按全局）
    fetchTop(10);
    // 故意不把 maintenance 加入依赖：maintenance 状态变化不应再次触发 fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, fetchPublic, fetchPrivate, fetchTop, blockedByMaintenance, hasHydrated]);

  // 自动回退：首次常用导航加载完成后，若为空则回退到「全部」
  // 仅在首次执行（hasInitialFallback 标记），避免影响用户后续手动切换
  useEffect(() => {
    if (
      !hasInitialFallback.current &&
      topLoaded &&
      topItems.length === 0 &&
      activeGroup === 'top'
    ) {
      hasInitialFallback.current = true;
      setActiveGroup('all');
    }
  }, [topLoaded, topItems, activeGroup]);

  // 按 group 筛选
  const visibleGroups = useMemo(() => {
    if (activeGroup === 'all') return groups;
    return groups.filter((g) => g.name === activeGroup);
  }, [groups, activeGroup]);

  // 按关键词筛选（标题或 URL 包含）
  const filteredGroups = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return visibleGroups;
    return visibleGroups
      .map((g) => ({
        ...g,
        categories: g.categories
          .map((c) => ({
            ...c,
            items: c.items.filter(
              (it) =>
                it.title.toLowerCase().includes(kw) ||
                it.url.toLowerCase().includes(kw),
            ),
          }))
          .filter((c) => c.items.length > 0),
      }))
      .filter((g) => g.categories.length > 0);
  }, [visibleGroups, keyword]);

  // 常用导航按关键词筛选（标题或 URL 包含）
  const filteredTopItems = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return topItems;
    return topItems.filter(
      (it) => it.title.toLowerCase().includes(kw) || it.url.toLowerCase().includes(kw),
    );
  }, [topItems, keyword]);

  const hasData = filteredGroups.length > 0;
  const showName = user?.displayName || user?.username || '';

  // 当前选中分组下的分类列表（用于创建卡片时分类下拉）
  const categoriesOfSelectedGroup = useMemo(() => {
    if (!itemGroupId) return [];
    return groups.find((g) => g.id === itemGroupId)?.categories ?? [];
  }, [groups, itemGroupId]);

  // 重置创建表单
  const resetCreateForm = () => {
    setItemTitle('');
    setItemUrl('');
    setItemIcon('');
    setItemGroupId('');
    setItemCategoryId('');
    setItemColor('#ffffff');
    setItemShape('rounded');
    setItemSize('sm');
    setItemNote('');
    setQuickGroupName('');
    setQuickCatName('');
  };

  // 预设分组+分类打开创建弹窗（从分组/分类旁的"+"按钮触发）
  const openCreateForGroup = (groupId: number) => {
    resetCreateForm();
    setItemGroupId(groupId);
    setShowCreateItem(true);
  };
  const openCreateForCategory = (groupId: number, categoryId: number) => {
    resetCreateForm();
    setItemGroupId(groupId);
    setItemCategoryId(categoryId);
    setShowCreateItem(true);
  };

  // 图标上传：读取文件 → base64 → POST /user/nav/icon → 返回 URL
  const onPickIcon = async (file: File, mode: 'create' | 'edit') => {
    if (!file) return;
    setUploadingIcon(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const { data } = await api.post<{ icon: string }>('/user/nav/icon', { icon: dataUrl });
        if (mode === 'create') {
          setItemIcon(data.icon);
        } else {
          setEditingItem((prev) => prev ? { ...prev, icon: data.icon } : prev);
        }
        toast.success('图标上传成功');
      } catch (e) {
        toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error || '图标上传失败');
      } finally {
        setUploadingIcon(false);
        if (mode === 'create' && createIconRef.current) createIconRef.current.value = '';
        if (mode === 'edit' && editIconRef.current) editIconRef.current.value = '';
      }
    };
    reader.onerror = () => {
      toast.error('图片读取失败');
      setUploadingIcon(false);
    };
    reader.readAsDataURL(file);
  };

  // URL 失焦时自动获取网页标题（标题为空时才触发）
  const [autoFetching, setAutoFetching] = useState(false);
  const onUrlBlur = async () => {
    const url = itemUrl.trim();
    if (!url || itemTitle.trim()) return; // 标题已填则不自动获取
    setAutoFetching(true);
    try {
      const { data } = await api.get<{ title: string; favicon: string }>('/util/meta', { params: { url } });
      if (data.title) {
        setItemTitle(data.title);
        toast.success('已自动获取网页标题');
      }
    } catch {
      // 静默失败，不打扰用户
    } finally {
      setAutoFetching(false);
    }
  };

  // 编辑 Modal：URL 失焦时自动获取网页标题（标题为空时才触发）
  const onEditUrlBlur = async () => {
    if (!editingItem) return;
    const url = editingItem.url.trim();
    if (!url || editingItem.title.trim()) return;
    setAutoFetching(true);
    try {
      const { data } = await api.get<{ title: string; favicon: string }>('/util/meta', { params: { url } });
      if (data.title) {
        setEditingItem({ ...editingItem, title: data.title });
        toast.success('已自动获取网页标题');
      }
    } catch {
      // 静默失败
    } finally {
      setAutoFetching(false);
    }
  };

  // 快速创建分组（首页内联，无需跳转）
  const onQuickCreateGroup = async () => {
    if (!quickGroupName.trim()) {
      toast.warning('分组名称不能为空');
      return;
    }
    try {
      const { data } = await api.post<{ id: number }>('/user/nav/group', { name: quickGroupName.trim() });
      toast.success('分组创建成功');
      setQuickGroupName('');
      await fetchPrivate();
      setItemGroupId(data.id);
    } catch (e) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error || '创建失败');
    }
  };

  // 快速创建分类
  const onQuickCreateCategory = async () => {
    if (!itemGroupId) {
      toast.warning('请先选择分组');
      return;
    }
    if (!quickCatName.trim()) {
      toast.warning('分类名称不能为空');
      return;
    }
    try {
      const { data } = await api.post<{ id: number }>('/user/nav/category', { name: quickCatName.trim(), groupId: Number(itemGroupId) });
      toast.success('分类创建成功');
      setQuickCatName('');
      await fetchPrivate();
      setItemCategoryId(data.id);
    } catch (e) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error || '创建失败');
    }
  };

  // 创建卡片
  const onCreateItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!itemTitle.trim() || !itemUrl.trim() || !itemGroupId) {
      toast.warning('标题、链接、所属分组不能为空');
      return;
    }
    try {
      await api.post('/user/nav/item', {
        title: itemTitle.trim(),
        url: itemUrl.trim(),
        icon: itemIcon.trim() || null,
        groupId: Number(itemGroupId),
        categoryId: itemCategoryId ? Number(itemCategoryId) : null,
        color: itemColor,
        shape: itemShape,
        size: itemSize,
        note: itemNote.trim() || null,
      });
      toast.success('网站添加成功');
      resetCreateForm();
      setShowCreateItem(false);
      await fetchPrivate();
    } catch (e) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error || '添加失败');
    }
  };

  // 更新卡片
  const onUpdateItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      await api.put(`/user/nav/item/${editingItem.id}`, {
        title: editingItem.title,
        url: editingItem.url,
        icon: editingItem.icon,
        color: editingItem.color,
        shape: editingItem.shape,
        size: editingItem.size,
        note: editingItem.note,
      });
      toast.success('卡片更新成功');
      setEditingItem(null);
      // 同时刷新私有导航与常用导航：默认「常用」视图渲染的是 topItems，
      // 仅 fetchPrivate 会导致 topItems 仍为旧值，备注/标题等修改不实时更新
      await Promise.all([fetchPrivate(), fetchTop(10)]);
    } catch (e) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error || '更新失败');
    }
  };

  // 删除卡片
  const onDeleteItem = async (item: NavItem) => {
    if (!window.confirm(`确认删除「${item.title}」？`)) return;
    try {
      await api.delete(`/user/nav/item/${item.id}`);
      toast.success('卡片已删除');
      setEditingItem(null);
      // 同步刷新常用导航，避免已删除卡片仍残留在「常用」视图中
      await Promise.all([fetchPrivate(), fetchTop(10)]);
    } catch (e) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error || '删除失败');
    }
  };

  // 卡片编辑回调：直接弹出编辑 Modal（不再跳转后台）
  const handleEdit = (item: NavItem) => {
    setEditingItem({ ...item });
  };
  const handleDelete = (item: NavItem) => {
    onDeleteItem(item);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* persist 水合未完成：显示骨架占位，避免登录用户闪现未登录界面 */}
      {!hasHydrated ? (
        <main
          className="flex-1 flex items-center justify-center"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <div className="text-sm">加载中…</div>
        </main>
      ) : (
        <>
      {/* 维护模式横幅（仅管理员可见，提示其当前站点处于维护中） */}
      {(maintenanceMode || maintenance) && user?.role === 'ADMIN' && (
        <div
          className="border-b px-4 py-2.5 text-sm flex items-center justify-center gap-2"
          style={{
            backgroundColor: 'var(--state-warning-light)',
            color: 'var(--state-warning)',
            borderColor: 'var(--border-default)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>站点当前处于维护模式，请联系管理员。</span>
        </div>
      )}

      {/* 维护模式拦截页（非管理员） */}
      {blockedByMaintenance ? (
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <div
            className="max-w-md w-full rounded-2xl p-8 text-center animate-fade-in"
            style={{
              backgroundColor: 'var(--bg-surface)',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid var(--border-default)',
            }}
          >
            {/* 维护图标 */}
            <div
              className="w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: 'var(--state-warning-light)',
                color: 'var(--state-warning)',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </div>
            <h1
              className="text-2xl font-semibold mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              站点维护中
            </h1>
            <p
              className="text-sm mb-6 leading-relaxed"
              style={{ color: 'var(--text-secondary)' }}
            >
              {notice || '站点正在维护中，请稍后再试。'}
            </p>
            {!token && (
              <Link
                to="/login"
                className="inline-block px-5 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                管理员登录
              </Link>
            )}
          </div>
        </main>
      ) : (
      <main className="flex-1 mx-auto max-w-6xl w-full px-4 sm:px-6 pt-6 pb-24">
        {/* Hero / 欢迎栏 */}
        {!token ? (
          <section className="pt-8 sm:pt-12 pb-6 text-center animate-fade-in">
            <h1
              className="mb-3 text-3xl sm:text-[34px] font-bold"
              style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
            >
              发现你常用的网站
            </h1>
            <p
              className="mb-8 text-base"
              style={{ color: 'var(--text-secondary)' }}
            >
              精心整理的导航站点，帮助你快速找到所需资源
            </p>
            {/* 搜索框 */}
            <div className="relative max-w-lg mx-auto">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索网站、工具、资源..."
                className="w-full h-11 pl-10 pr-4 rounded-lg border text-sm outline-none transition-all duration-150"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-primary)',
                  boxShadow: 'var(--shadow-sm)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-focus)';
                  e.currentTarget.style.boxShadow =
                    '0 0 0 3px var(--color-primary-50), var(--shadow-sm)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-default)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                }}
              />
            </div>
          </section>
        ) : (
          <section className="flex items-center justify-between mb-6 animate-fade-in">
            <h2
              className="text-xl font-semibold"
              style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}
            >
              欢迎回来，{showName}
            </h2>
            <button
              type="button"
              onClick={() => setShowCreateItem(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 5v14M5 12h14"
                />
              </svg>
              添加网站
            </button>
          </section>
        )}

        {/* 已登录态：搜索框（小尺寸） */}
        {token && (
          <div className="relative mb-6 max-w-md animate-fade-in">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索我的导航..."
              className="w-full h-10 pl-9 pr-4 rounded-lg border text-sm outline-none transition-all duration-150"
              style={{
                backgroundColor: 'var(--bg-surface)',
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
          </div>
        )}

        {/* ===== 主体布局：侧边栏 + 内容区 ===== */}
        <div className="flex flex-col sm:flex-row gap-6">
          {/* 侧边栏：分组列表（PC 端左侧垂直，移动端顶部横向） */}
          {groups.length > 0 && (
            <aside className="sm:w-56 sm:flex-shrink-0">
              {/* 移动端：横向滚动；PC 端：垂直列表 sticky */}
              <div className="flex sm:flex-col gap-2 overflow-x-auto sm:overflow-y-auto no-scrollbar pb-1 sm:pb-0 sm:sticky sm:top-20 sm:max-h-[calc(100vh-180px)]">
                {/* 标题（仅 PC 端显示） */}
                <div
                  className="hidden sm:flex items-center justify-between px-3 mb-1"
                  aria-hidden
                >
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    分组
                  </span>
                  <span
                    className="text-[11px]"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {groups.length}
                  </span>
                </div>

                {/* "常用" 按钮（仅在 topItems 非空时显示） */}
                {topItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveGroup('top')}
                    className="group relative flex-shrink-0 sm:w-full flex items-center gap-2.5 px-3 h-10 rounded-full sm:rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap"
                    style={
                      activeGroup === 'top'
                        ? {
                            backgroundColor: 'var(--color-primary-50)',
                            color: 'var(--color-primary)',
                          }
                        : {
                            backgroundColor: 'transparent',
                            color: 'var(--text-secondary)',
                          }
                    }
                    onMouseEnter={(e) => {
                      if (activeGroup !== 'top') e.currentTarget.style.backgroundColor = 'var(--bg-inset)';
                    }}
                    onMouseLeave={(e) => {
                      if (activeGroup !== 'top') e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {/* 选中态：左侧色条指示器（仅 PC 端） */}
                    {activeGroup === 'top' && (
                      <span
                        className="hidden sm:block absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
                        style={{ backgroundColor: 'var(--color-primary)' }}
                        aria-hidden
                      />
                    )}
                    {/* 闪电图标徽章（常用 = 高频） */}
                    <span
                      className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold transition-all duration-200 group-hover:scale-105"
                      style={
                        activeGroup === 'top'
                          ? { backgroundColor: 'var(--color-primary)', color: '#FFFFFF' }
                          : { backgroundColor: 'var(--bg-inset)', color: 'var(--text-tertiary)' }
                      }
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
                      </svg>
                    </span>
                    <span className="flex-1 sm:text-left">常用</span>
                    {/* 计数徽章 */}
                    <span
                      className="flex-shrink-0 text-[10px] px-1.5 min-w-[20px] h-[18px] flex items-center justify-center rounded-full font-semibold transition-colors"
                      style={
                        activeGroup === 'top'
                          ? { backgroundColor: 'var(--color-primary)', color: '#FFFFFF' }
                          : { backgroundColor: 'var(--bg-inset)', color: 'var(--text-tertiary)' }
                      }
                    >
                      {topItems.length}
                    </span>
                  </button>
                )}

                {/* "全部" 按钮 */}
                <button
                  type="button"
                  onClick={() => setActiveGroup('all')}
                  className="group relative flex-shrink-0 sm:w-full flex items-center gap-2.5 px-3 h-10 rounded-full sm:rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap"
                  style={
                    activeGroup === 'all'
                      ? {
                          backgroundColor: 'var(--color-primary-50)',
                          color: 'var(--color-primary)',
                        }
                      : {
                          backgroundColor: 'transparent',
                          color: 'var(--text-secondary)',
                        }
                  }
                  onMouseEnter={(e) => {
                    if (activeGroup !== 'all') e.currentTarget.style.backgroundColor = 'var(--bg-inset)';
                  }}
                  onMouseLeave={(e) => {
                    if (activeGroup !== 'all') e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {/* 选中态：左侧色条指示器（仅 PC 端） */}
                  {activeGroup === 'all' && (
                    <span
                      className="hidden sm:block absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
                      style={{ backgroundColor: 'var(--color-primary)' }}
                      aria-hidden
                    />
                  )}
                  {/* 首字母徽章 */}
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold transition-all duration-200 group-hover:scale-105"
                    style={
                      activeGroup === 'all'
                        ? { backgroundColor: 'var(--color-primary)', color: '#FFFFFF' }
                        : { backgroundColor: 'var(--bg-inset)', color: 'var(--text-tertiary)' }
                    }
                  >
                    ★
                  </span>
                  <span className="flex-1 sm:text-left">全部</span>
                  {/* 计数徽章 */}
                  <span
                    className="flex-shrink-0 text-[10px] px-1.5 min-w-[20px] h-[18px] flex items-center justify-center rounded-full font-semibold transition-colors"
                    style={
                      activeGroup === 'all'
                        ? { backgroundColor: 'var(--color-primary)', color: '#FFFFFF' }
                        : { backgroundColor: 'var(--bg-inset)', color: 'var(--text-tertiary)' }
                    }
                  >
                    {groups.reduce(
                      (sum, g) => sum + g.categories.reduce((s, c) => s + c.items.length, 0),
                      0,
                    )}
                  </span>
                </button>

                {/* 各分组按钮 */}
                {groups.map((g) => {
                  const active = activeGroup === g.name;
                  const count = g.categories.reduce((s, c) => s + c.items.length, 0);
                  const initial = g.name.charAt(0).toUpperCase();
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setActiveGroup(g.name)}
                      className="group relative flex-shrink-0 sm:w-full flex items-center gap-2.5 px-3 h-10 rounded-full sm:rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap hover:bg-opacity-50"
                      style={
                        active
                          ? {
                              backgroundColor: 'var(--color-primary-50)',
                              color: 'var(--color-primary)',
                            }
                          : {
                              backgroundColor: 'transparent',
                              color: 'var(--text-secondary)',
                            }
                      }
                      onMouseEnter={(e) => {
                        if (!active) e.currentTarget.style.backgroundColor = 'var(--bg-inset)';
                      }}
                      onMouseLeave={(e) => {
                        if (!active) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {/* 选中态：左侧色条指示器（仅 PC 端） */}
                      {active && (
                        <span
                          className="hidden sm:block absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
                          style={{ backgroundColor: 'var(--color-primary)' }}
                          aria-hidden
                        />
                      )}
                      {/* 首字母徽章 */}
                      <span
                        className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold transition-all duration-200 group-hover:scale-105"
                        style={
                          active
                            ? { backgroundColor: 'var(--color-primary)', color: '#FFFFFF' }
                            : { backgroundColor: 'var(--bg-inset)', color: 'var(--text-tertiary)' }
                        }
                      >
                        {initial}
                      </span>
                      <span className="flex-1 sm:text-left truncate">{g.name}</span>
                      {/* 计数徽章 */}
                      <span
                        className="flex-shrink-0 text-[10px] px-1.5 min-w-[20px] h-[18px] flex items-center justify-center rounded-full font-semibold transition-colors"
                        style={
                          active
                            ? { backgroundColor: 'var(--color-primary)', color: '#FFFFFF' }
                            : { backgroundColor: 'var(--bg-inset)', color: 'var(--text-tertiary)' }
                        }
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          )}

          {/* 主内容区 */}
          <div className="flex-1 min-w-0">
            {/* ===== 常用导航视图：activeGroup === 'top' 时独占内容区 ===== */}
            {activeGroup === 'top' && (
              <>
                {filteredTopItems.length > 0 ? (
                  <section className="animate-fade-in">
                    <div className="mb-4 flex items-center gap-2">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        style={{ color: 'var(--color-primary)' }}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                      <h3
                        className="text-base font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        常用导航
                      </h3>
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: 'var(--color-primary-50)',
                          color: 'var(--color-primary)',
                        }}
                      >
                        Top {filteredTopItems.length}
                      </span>
                    </div>
                    <NavGrid>
                      {filteredTopItems.map((item) => (
                        <NavCard
                          key={`top-${item.id}`}
                          item={item}
                          editable={!!token}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                        />
                      ))}
                    </NavGrid>
                  </section>
                ) : (
                  // 常用导航为空（用户手动切换到「常用」但无数据）
                  !loading && (
                    <div
                      className="p-12 text-center rounded-xl border animate-fade-in"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-default)',
                      }}
                    >
                      <div className="text-4xl mb-3">⚡</div>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {keyword
                          ? '没有找到匹配的常用导航'
                          : '暂无常用导航记录，点击导航卡片后会自动统计到此处'}
                      </p>
                      {!keyword && (
                        <button
                          type="button"
                          onClick={() => setActiveGroup('all')}
                          className="mt-4 inline-block text-sm font-medium"
                          style={{ color: 'var(--color-primary)' }}
                        >
                          浏览全部导航 →
                        </button>
                      )}
                    </div>
                  )
                )}
              </>
            )}

            {/* ===== 常用导航 Top 10 横幅（仅在「全部」+ 无搜索时展示） ===== */}
            {activeGroup === 'all' && topItems.length > 0 && !keyword.trim() && (
              <section className="mb-10 animate-fade-in">
                <div className="mb-4 flex items-center gap-2">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    style={{ color: 'var(--color-primary)' }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  <h3
                    className="text-base font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    常用导航
                  </h3>
                  <span
                    className="text-[11px] px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: 'var(--color-primary-50)',
                      color: 'var(--color-primary)',
                    }}
                  >
                    Top {topItems.length}
                  </span>
                </div>
                <NavGrid>
                  {topItems.map((item) => (
                    <NavCard
                      key={`top-${item.id}`}
                      item={item}
                      editable={!!token}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </NavGrid>
              </section>
            )}

            {/* 加载状态 */}
            {loading && (
              <div
                className="p-8 text-center text-sm"
                style={{ color: 'var(--text-tertiary)' }}
              >
                正在加载导航数据…
              </div>
            )}

            {/* 空状态：仅在非 top 视图时展示（top 视图空数据已在上方条件过滤） */}
            {activeGroup !== 'top' && !loading && !error && !hasData && (
              <div
                className="p-12 text-center rounded-xl border animate-fade-in"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-default)',
                }}
              >
                <div className="text-4xl mb-3">🗂️</div>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {keyword
                    ? '没有找到匹配的网站'
                    : token
                      ? '暂无导航数据，点击「添加网站」开始构建你的导航'
                      : '暂无公共导航数据'}
                </p>
                {token && (
                  <button
                    type="button"
                    onClick={() => setShowCreateItem(true)}
                    className="mt-4 inline-block text-sm font-medium"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    添加你的第一个网站 →
                  </button>
                )}
              </div>
            )}

            {/* 卡片网格：按 group → category → items 渲染（仅在非 top 视图时展示） */}
            {activeGroup !== 'top' && hasData && (
              <div className="space-y-10">
                {filteredGroups.map((group) => (
                  <section key={group.id} className="animate-fade-in">
                    <div className="mb-4 flex items-center gap-2">
                      <h3
                        className="text-base font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {group.name}
                      </h3>
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: 'var(--bg-inset)',
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        {group.isPublic ? '公共' : '私有'}
                      </span>
                      {token && (
                        <button
                          onClick={() => openCreateForGroup(group.id)}
                          className="ml-1 w-6 h-6 flex items-center justify-center rounded-full text-sm transition hover:scale-110"
                          style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
                          title="在此分组下添加导航"
                        >
                          +
                        </button>
                      )}
                    </div>
                    <div className="space-y-6">
                      {group.categories.map((cat) => (
                        <div key={cat.id}>
                          <div className="mb-3 flex items-center gap-2">
                            <h4
                              className="text-xs font-medium uppercase tracking-wide"
                              style={{ color: 'var(--text-tertiary)' }}
                            >
                              {cat.name}
                            </h4>
                            {token && cat.id !== 0 && (
                              <button
                                onClick={() => openCreateForCategory(group.id, cat.id)}
                                className="w-5 h-5 flex items-center justify-center rounded-full text-xs transition hover:scale-110"
                                style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}
                                title="在此分类下添加导航"
                              >
                                +
                              </button>
                            )}
                          </div>
                          <NavGrid>
                            {cat.items.map((item) => (
                              <NavCard
                                key={item.id}
                                item={item}
                                editable={!!token}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                              />
                            ))}
                          </NavGrid>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      )}
      </>
      )}

      {/* ===== 创建卡片 Modal ===== */}
      <Modal open={showCreateItem} onClose={() => { setShowCreateItem(false); resetCreateForm(); }} title="添加网站">
        <form onSubmit={onCreateItem} className="space-y-4">
          {/* 分组选择 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>所属分组</label>
            <select
              value={itemGroupId}
              onChange={(e) => { setItemGroupId(e.target.value ? Number(e.target.value) : ''); setItemCategoryId(''); }}
              className="w-full h-9 px-3 text-sm border rounded-md outline-none"
              style={{ borderColor: 'var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="">请选择分组</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          {/* 快速创建分组 */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input
                value={quickGroupName}
                onChange={(e) => setQuickGroupName(e.target.value)}
                placeholder="或输入新分组名"
              />
            </div>
            <Button type="button" variant="outline" onClick={onQuickCreateGroup}>创建分组</Button>
          </div>
          {/* 分类选择 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>所属分类（可选）</label>
            <select
              value={itemCategoryId}
              onChange={(e) => setItemCategoryId(e.target.value ? Number(e.target.value) : '')}
              className="w-full h-9 px-3 text-sm border rounded-md outline-none"
              style={{ borderColor: 'var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="">不选择分类</option>
              {categoriesOfSelectedGroup.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {/* 快速创建分类 */}
          {itemGroupId && (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Input
                  value={quickCatName}
                  onChange={(e) => setQuickCatName(e.target.value)}
                  placeholder="或输入新分类名"
                />
              </div>
              <Button type="button" variant="outline" onClick={onQuickCreateCategory}>创建分类</Button>
            </div>
          )}
          <Input label="标题" value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} placeholder={autoFetching ? '正在获取网页标题…' : '如：Google'} />
          <Input label="链接" value={itemUrl} onChange={(e) => setItemUrl(e.target.value)} onBlur={onUrlBlur} placeholder="https://..." />
          {/* 图标上传 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>图标</label>
            <div className="flex items-center gap-3">
              {/* 预览 */}
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                style={{ backgroundColor: itemColor }}
              >
                {itemIcon ? (
                  <img src={itemIcon} alt="icon" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>无</span>
                )}
              </div>
              <input
                ref={createIconRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => e.target.files?.[0] && onPickIcon(e.target.files[0], 'create')}
                className="hidden"
              />
              <Button type="button" variant="outline" onClick={() => createIconRef.current?.click()} disabled={uploadingIcon}>
                {uploadingIcon ? '上传中…' : itemIcon ? '更换图标' : '上传图标'}
              </Button>
              {itemIcon && (
                <Button type="button" variant="outline" onClick={() => setItemIcon('')}>移除</Button>
              )}
            </div>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>留空将自动获取网站图标</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>备注</span>
            <textarea
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              placeholder="记录账号、密码提示、备注等信息（选填）"
              rows={3}
              className="w-full px-3 py-2 rounded-lg outline-none transition-colors text-sm resize-y"
              style={{
                backgroundColor: 'var(--bg-inset)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <ColorPicker value={itemColor} onChange={setItemColor} />
          {/* 形状选择 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>形状</span>
            <div className="flex gap-2">
              {(['rounded', 'square'] as Shape[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setItemShape(s)}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border cursor-pointer transition text-center"
                  style={
                    itemShape === s
                      ? { borderColor: 'var(--color-primary)', background: 'var(--color-primary-50)', color: 'var(--color-primary)' }
                      : { borderColor: 'var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)' }
                  }
                >
                  {s === 'rounded' ? '圆角' : '直角'}
                </button>
              ))}
            </div>
          </div>
          {/* 尺寸选择 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>尺寸</span>
            <div className="flex gap-2">
              {(['sm', 'md', 'lg'] as Size[]).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setItemSize(sz)}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border cursor-pointer transition text-center"
                  style={
                    itemSize === sz
                      ? { borderColor: 'var(--color-primary)', background: 'var(--color-primary-50)', color: 'var(--color-primary)' }
                      : { borderColor: 'var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)' }
                  }
                >
                  {sz.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => { setShowCreateItem(false); resetCreateForm(); }}>取消</Button>
            <Button type="submit">添加</Button>
          </div>
        </form>
      </Modal>

      {/* ===== 编辑卡片 Modal ===== */}
      <Modal open={!!editingItem} onClose={() => setEditingItem(null)} title="编辑卡片">
        {editingItem && (
          <form onSubmit={onUpdateItem} className="space-y-4">
            <Input label="标题" value={editingItem.title} onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })} placeholder={autoFetching ? '正在获取网页标题…' : ''} />
            <Input label="链接" value={editingItem.url} onChange={(e) => setEditingItem({ ...editingItem, url: e.target.value })} onBlur={onEditUrlBlur} />
            {/* 图标上传 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>图标</label>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                  style={{ backgroundColor: editingItem.color ?? '#4F6EF7' }}
                >
                  {editingItem.icon ? (
                    <img src={editingItem.icon} alt="icon" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>无</span>
                  )}
                </div>
                <input
                  ref={editIconRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => e.target.files?.[0] && onPickIcon(e.target.files[0], 'edit')}
                  className="hidden"
                />
                <Button type="button" variant="outline" onClick={() => editIconRef.current?.click()} disabled={uploadingIcon}>
                  {uploadingIcon ? '上传中…' : editingItem.icon ? '更换图标' : '上传图标'}
                </Button>
                {editingItem.icon && (
                  <Button type="button" variant="outline" onClick={() => setEditingItem({ ...editingItem, icon: null })}>移除</Button>
                )}
              </div>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>留空将自动获取网站图标</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>备注</span>
              <textarea
                value={editingItem.note ?? ''}
                onChange={(e) => setEditingItem({ ...editingItem, note: e.target.value })}
                placeholder="记录账号、密码提示、备注等信息（选填）"
                rows={3}
                className="w-full px-3 py-2 rounded-lg outline-none transition-colors text-sm resize-y"
                style={{
                  backgroundColor: 'var(--bg-inset)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <ColorPicker value={editingItem.color ?? '#4F6EF7'} onChange={(c) => setEditingItem({ ...editingItem, color: c })} />
            {/* 形状选择 */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>形状</span>
              <div className="flex gap-2">
                {(['rounded', 'square'] as Shape[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEditingItem({ ...editingItem, shape: s })}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border cursor-pointer transition text-center"
                    style={
                      editingItem.shape === s
                        ? { borderColor: 'var(--color-primary)', background: 'var(--color-primary-50)', color: 'var(--color-primary)' }
                        : { borderColor: 'var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)' }
                    }
                  >
                    {s === 'rounded' ? '圆角' : '直角'}
                  </button>
                ))}
              </div>
            </div>
            {/* 尺寸选择 */}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>尺寸</span>
              <div className="flex gap-2">
                {(['sm', 'md', 'lg'] as Size[]).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setEditingItem({ ...editingItem, size: sz })}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border cursor-pointer transition text-center"
                    style={
                      editingItem.size === sz
                        ? { borderColor: 'var(--color-primary)', background: 'var(--color-primary-50)', color: 'var(--color-primary)' }
                        : { borderColor: 'var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)' }
                    }
                  >
                    {sz.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => onDeleteItem(editingItem)}
                className="text-sm font-medium transition-opacity hover:opacity-80"
                style={{ color: 'var(--state-error)' }}
              >
                删除卡片
              </button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setEditingItem(null)}>取消</Button>
                <Button type="submit">保存</Button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      <footer
        className="mx-auto max-w-6xl w-full px-4 sm:px-6 py-8 text-center text-xs"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {settings?.siteName ?? 'MyNav'} · {settings?.siteDescription ?? '个人导航'} {settings?.icp ? `· ${settings.icp}` : ''}
      </footer>
    </div>
  );
}
