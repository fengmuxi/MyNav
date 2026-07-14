import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AdminLayout } from '../../components/ui/AdminLayout';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { ColorPicker } from '../../components/nav/ColorPicker';
import { useNavStore } from '../../store/navStore';
import api from '../../api/axios';
import { toast } from '../../store/toastStore';
import type { NavGroup, NavItem } from '../../types';

type Shape = 'rounded' | 'square';
type Size = 'sm' | 'md' | 'lg';

/**
 * 管理后台 - 导航管理
 * 对齐设计稿风格（白底 + 边框 + 主色 token）：
 * - 顶部统计卡片（分组数 / 分类数 / 卡片数 / 公开分组数）
 * - 数据列表按 分组 → 分类 → 卡片 渲染，卡片可点击编辑
 * - 创建分组 / 分类 / 卡片 均通过 Modal 触发
 */
export default function NavMgr() {
  const { groups, loading, fetchAdmin } = useNavStore();

  useEffect(() => {
    fetchAdmin();
  }, [fetchAdmin]);

  // ===== 表单状态 =====
  const [groupName, setGroupName] = useState('');
  const [groupIsPublic, setGroupIsPublic] = useState(true);

  const [catName, setCatName] = useState('');
  const [catGroupId, setCatGroupId] = useState<number | ''>('');

  const [itemTitle, setItemTitle] = useState('');
  const [itemUrl, setItemUrl] = useState('');
  const [itemIcon, setItemIcon] = useState('');
  const [itemGroupId, setItemGroupId] = useState<number | ''>('');
  const [itemCategoryId, setItemCategoryId] = useState<number | ''>('');
  const [itemColor, setItemColor] = useState('#ffffff');
  const [itemShape, setItemShape] = useState<Shape>('rounded');
  const [itemSize, setItemSize] = useState<Size>('sm');
  const [itemNote, setItemNote] = useState('');

  const [editingItem, setEditingItem] = useState<NavItem | null>(null);

  // Modal 开关
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [showCreateItem, setShowCreateItem] = useState(false);

  // ===== 图标上传 / 自动获取标题 / 快速创建分组分类（与 Home.tsx 流程一致） =====
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [autoFetching, setAutoFetching] = useState(false);
  const [quickGroupName, setQuickGroupName] = useState('');
  const [quickCatName, setQuickCatName] = useState('');
  const createIconRef = useRef<HTMLInputElement>(null);
  const editIconRef = useRef<HTMLInputElement>(null);

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

  // 图标上传：读取文件 → base64 → POST /user/nav/icon → 返回 URL
  // 复用 /api/user/nav/icon（仅需登录鉴权，管理员同样可调用）
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

  // 创建 Modal：URL 失焦时自动获取网页标题（标题为空时才触发）
  const onUrlBlur = async () => {
    const url = itemUrl.trim();
    if (!url || itemTitle.trim()) return;
    setAutoFetching(true);
    try {
      const { data } = await api.get<{ title: string; favicon: string }>('/util/meta', { params: { url } });
      if (data.title) {
        setItemTitle(data.title);
        toast.success('已自动获取网页标题');
      }
    } catch {
      // 静默失败
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

  // 快速创建分组（在创建卡片 Modal 内联创建）
  const onQuickCreateGroup = async () => {
    if (!quickGroupName.trim()) {
      toast.warning('分组名称不能为空');
      return;
    }
    try {
      const { data } = await api.post<{ id: number }>('/admin/group', {
        name: quickGroupName.trim(),
        isPublic: 1,
      });
      toast.success('分组创建成功');
      setQuickGroupName('');
      await fetchAdmin();
      setItemGroupId(data.id);
    } catch (e) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error || '创建失败');
    }
  };

  // 快速创建分类（在创建卡片 Modal 内联创建）
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
      const { data } = await api.post<{ id: number }>('/admin/category', {
        name: quickCatName.trim(),
        groupId: Number(itemGroupId),
      });
      toast.success('分类创建成功');
      setQuickCatName('');
      await fetchAdmin();
      setItemCategoryId(data.id);
    } catch (e) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error || '创建失败');
    }
  };

  // ===== 批量管理状态 =====
  const [batchMode, setBatchMode] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<number>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

  // ===== 统计 =====
  const stats = useMemo(() => {
    const groupCount = groups.length;
    const categoryCount = groups.reduce((sum, g) => sum + g.categories.length, 0);
    const itemCount = groups.reduce(
      (sum, g) => sum + g.categories.reduce((s, c) => s + c.items.length, 0),
      0,
    );
    const publicGroupCount = groups.filter((g) => g.isPublic).length;
    return { groupCount, categoryCount, itemCount, publicGroupCount };
  }, [groups]);

  // ===== 创建分组 =====
  const onCreateGroup = async (e: FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      toast.warning('分组名称不能为空');
      return;
    }
    try {
      await api.post('/admin/group', {
        name: groupName.trim(),
        isPublic: groupIsPublic ? 1 : 0,
      });
      toast.success(`分组「${groupName}」创建成功`);
      setGroupName('');
      setGroupIsPublic(true);
      setShowCreateGroup(false);
      await fetchAdmin();
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '创建失败');
    }
  };

  // ===== 创建分类 =====
  const onCreateCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!catName.trim() || !catGroupId) {
      toast.warning('分类名称与所属分组不能为空');
      return;
    }
    try {
      await api.post('/admin/category', {
        name: catName.trim(),
        groupId: Number(catGroupId),
      });
      toast.success('分类创建成功');
      setCatName('');
      setCatGroupId('');
      setShowCreateCategory(false);
      await fetchAdmin();
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '创建失败');
    }
  };

  // ===== 创建卡片 =====
  const onCreateItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!itemTitle.trim() || !itemUrl.trim() || !itemGroupId) {
      toast.warning('标题、链接、所属分组不能为空');
      return;
    }
    try {
      await api.post('/admin/item', {
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
      toast.success('卡片创建成功');
      resetCreateForm();
      setShowCreateItem(false);
      await fetchAdmin();
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '创建失败');
    }
  };

  // ===== 更新卡片 =====
  const onUpdateItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    try {
      await api.put(`/admin/item/${editingItem.id}`, {
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
      await fetchAdmin();
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '更新失败');
    }
  };

  // ===== 删除卡片（编辑弹窗内触发） =====
  const onDeleteItem = async (item: NavItem) => {
    if (!window.confirm(`确认删除「${item.title}」？`)) return;
    try {
      await api.delete(`/admin/item/${item.id}`);
      toast.success('卡片已删除');
      setEditingItem(null);
      await fetchAdmin();
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '删除失败');
    }
  };

  // ===== 批量管理 =====
  // 切换分组选中状态：同时联动其下所有分类与卡片
  const toggleGroupSelection = (groupId: number) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const isSelected = selectedGroups.has(groupId);
    const newGroups = new Set(selectedGroups);
    const newCategories = new Set(selectedCategories);
    const newItems = new Set(selectedItems);
    if (isSelected) {
      newGroups.delete(groupId);
      group.categories.forEach((c) => {
        newCategories.delete(c.id);
        c.items.forEach((it) => newItems.delete(it.id));
      });
    } else {
      newGroups.add(groupId);
      group.categories.forEach((c) => {
        newCategories.add(c.id);
        c.items.forEach((it) => newItems.add(it.id));
      });
    }
    setSelectedGroups(newGroups);
    setSelectedCategories(newCategories);
    setSelectedItems(newItems);
  };

  // 切换分类选中状态：同时联动其下所有卡片
  const toggleCategorySelection = (groupId: number, categoryId: number) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const category = group.categories.find((c) => c.id === categoryId);
    if (!category) return;
    const isSelected = selectedCategories.has(categoryId);
    const newCategories = new Set(selectedCategories);
    const newItems = new Set(selectedItems);
    if (isSelected) {
      newCategories.delete(categoryId);
      category.items.forEach((it) => newItems.delete(it.id));
    } else {
      newCategories.add(categoryId);
      category.items.forEach((it) => newItems.add(it.id));
    }
    setSelectedCategories(newCategories);
    setSelectedItems(newItems);
  };

  // 切换单个卡片选中状态
  const toggleItemSelection = (itemId: number) => {
    const newItems = new Set(selectedItems);
    if (newItems.has(itemId)) {
      newItems.delete(itemId);
    } else {
      newItems.add(itemId);
    }
    setSelectedItems(newItems);
  };

  // 全选：选中所有分组、分类、卡片
  const selectAll = () => {
    const newGroups = new Set<number>();
    const newCategories = new Set<number>();
    const newItems = new Set<number>();
    groups.forEach((g) => {
      newGroups.add(g.id);
      g.categories.forEach((c) => {
        newCategories.add(c.id);
        c.items.forEach((it) => newItems.add(it.id));
      });
    });
    setSelectedGroups(newGroups);
    setSelectedCategories(newCategories);
    setSelectedItems(newItems);
  };

  // 清空所有选中
  const clearSelection = () => {
    setSelectedGroups(new Set());
    setSelectedCategories(new Set());
    setSelectedItems(new Set());
  };

  // 批量删除：并行调用删除接口
  const onBatchDelete = async () => {
    const total = selectedGroups.size + selectedCategories.size + selectedItems.size;
    if (total === 0) {
      toast.warning('请先选择要删除的内容');
      return;
    }
    const ok = window.confirm(`确认删除选中的 ${total} 项？删除分组将级联删除其下所有分类和卡片，删除分类将级联删除其下所有卡片。`);
    if (!ok) return;
    try {
      const tasks: Promise<unknown>[] = [];
      selectedGroups.forEach((id) => tasks.push(api.delete(`/admin/group/${id}`)));
      selectedCategories.forEach((id) => tasks.push(api.delete(`/admin/category/${id}`)));
      selectedItems.forEach((id) => tasks.push(api.delete(`/admin/item/${id}`)));
      await Promise.all(tasks);
      toast.success(`成功删除 ${total} 项`);
      clearSelection();
      setBatchMode(false);
      await fetchAdmin();
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '删除失败');
    }
  };

  // Radio 按钮组通用样式
  const radioCls = 'flex-1 px-3 py-2 text-sm rounded-lg border cursor-pointer transition text-center';

  return (
    <AdminLayout
      pageName="导航管理"
      actions={
        <>
          {/* 批量管理切换按钮 */}
          <Button
            variant="outline"
            onClick={() => {
              setBatchMode((v) => !v);
              clearSelection();
            }}
            className="!px-3 sm:!px-4"
            style={batchMode ? { borderColor: 'var(--state-error)', color: 'var(--state-error)' } : undefined}
            title="批量管理"
          >
            <span className="hidden sm:inline">{batchMode ? '退出管理' : '批量管理'}</span>
            <svg className="w-4 h-4 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </Button>
          {/* 移动端：仅图标；桌面端：完整文字 */}
          <Button variant="outline" onClick={() => setShowCreateGroup(true)} className="!px-3 sm:!px-4" title="新建分组">
            <span className="hidden sm:inline">新建分组</span>
            <svg className="w-4 h-4 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25z" />
            </svg>
          </Button>
          <Button variant="outline" onClick={() => setShowCreateCategory(true)} className="!px-3 sm:!px-4" title="新建分类">
            <span className="hidden sm:inline">新建分类</span>
            <svg className="w-4 h-4 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6z" />
            </svg>
          </Button>
          <Button onClick={() => setShowCreateItem(true)} className="!px-3 sm:!px-4" title="新建卡片">
            <span className="hidden sm:inline">新建卡片</span>
            <svg className="w-4 h-4 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </Button>
        </>
      }
    >
      {/* ===== 统计卡片：移动端 2 列紧凑，桌面端 4 列 ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <StatCard label="分组总数" value={stats.groupCount} color="primary" iconPath="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        <StatCard label="分类总数" value={stats.categoryCount} color="info" iconPath="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        <StatCard label="卡片总数" value={stats.itemCount} color="success" iconPath="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        <StatCard label="公开分组" value={stats.publicGroupCount} color="purple" iconPath="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </div>

      {/* ===== 批量管理工具栏（仅在批量模式下显示） ===== */}
      {batchMode && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border rounded-lg p-3 sm:p-4"
          style={{ borderColor: 'var(--state-error)', background: 'var(--state-error-light)' }}
        >
          <div className="text-sm font-medium" style={{ color: 'var(--state-error)' }}>
            已选 {selectedGroups.size + selectedCategories.size + selectedItems.size} 项
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={selectAll} className="!px-3 !py-1.5 !text-sm">全选</Button>
            <Button
              onClick={onBatchDelete}
              className="!px-3 !py-1.5 !text-sm"
              style={{ backgroundColor: 'var(--state-error)' }}
            >
              删除选中
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setBatchMode(false);
                clearSelection();
              }}
              className="!px-3 !py-1.5 !text-sm"
            >
              退出管理
            </Button>
          </div>
        </div>
      )}

      {/* ===== 数据列表 ===== */}
      <div className="bg-white border rounded-lg p-4 sm:p-6" style={{ borderColor: 'var(--border-default)' }}>
        <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4" style={{ color: 'var(--text-primary)' }}>导航数据</h2>
        {loading ? (
          <div className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>加载中…</div>
        ) : groups.length === 0 ? (
          <div className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
            暂无数据，点击右上角「新建分组」开始创建
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {groups.map((g: NavGroup) => (
              <div
                key={g.id}
                className="border rounded-lg p-3 sm:p-4"
                style={{ borderColor: 'var(--border-default)', background: 'var(--bg-page)' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  {batchMode && (
                    <input
                      type="checkbox"
                      checked={selectedGroups.has(g.id)}
                      onChange={() => toggleGroupSelection(g.id)}
                      className="h-4 w-4 flex-shrink-0"
                      style={{ accentColor: 'var(--color-primary)' }}
                    />
                  )}
                  <span className="font-medium text-sm sm:text-base truncate" style={{ color: 'var(--text-primary)' }}>{g.name}</span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                    style={
                      g.isPublic
                        ? { background: 'var(--state-success-light)', color: 'var(--state-success)' }
                        : { background: 'var(--bg-inset)', color: 'var(--text-tertiary)' }
                    }
                  >
                    {g.isPublic ? '公共' : '私有'}
                  </span>
                </div>
                <div className="space-y-3">
                  {g.categories.map((c) => (
                    <div key={c.id}>
                      <div className="mb-2 flex items-center gap-1.5">
                        {batchMode && (
                          <input
                            type="checkbox"
                            checked={selectedCategories.has(c.id)}
                            onChange={() => toggleCategorySelection(g.id, c.id)}
                            className="h-4 w-4 flex-shrink-0"
                            style={{ accentColor: 'var(--color-primary)' }}
                          />
                        )}
                        <span className="w-1 h-3.5 rounded-full flex-shrink-0" style={{ background: 'var(--color-primary)' }} />
                        <span className="text-xs sm:text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{c.name}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {c.items.map((it) => (
                          <div key={it.id} className="flex items-center gap-1.5">
                            {batchMode && (
                              <input
                                type="checkbox"
                                checked={selectedItems.has(it.id)}
                                onChange={() => toggleItemSelection(it.id)}
                                className="h-4 w-4 flex-shrink-0"
                                style={{ accentColor: 'var(--color-primary)' }}
                              />
                            )}
                            <button
                              onClick={() => {
                                if (batchMode) {
                                  toggleItemSelection(it.id);
                                } else {
                                  setEditingItem({ ...it });
                                }
                              }}
                              className="flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 py-2 sm:py-1.5 text-[13px] sm:text-xs text-white border transition hover:scale-105"
                              style={{
                                backgroundColor: it.color ?? 'var(--color-primary)',
                                borderColor: 'transparent',
                              }}
                              title={
                                batchMode
                                  ? '点击选择'
                                  : it.note
                                    ? `点击编辑 · 备注：${it.note}`
                                    : '点击编辑'
                              }
                            >
                              {it.icon && <span>{it.icon}</span>}
                              <span>{it.title}</span>
                              {it.note && (
                                <span className="opacity-80" title={`备注：${it.note}`}>
                                  {/* 备注图标 */}
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="8" y1="13" x2="16" y2="13" />
                                    <line x1="8" y1="17" x2="13" y2="17" />
                                  </svg>
                                </span>
                              )}
                              <span className="opacity-70 hidden sm:inline">{it.size}/{it.shape}</span>
                            </button>
                          </div>
                        ))}
                        {c.items.length === 0 && (
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>无卡片</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {g.categories.length === 0 && (
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>暂无分类</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== 创建分组 Modal ===== */}
      <Modal open={showCreateGroup} onClose={() => setShowCreateGroup(false)} title="新建分组">
        <form onSubmit={onCreateGroup} className="space-y-4">
          <Input label="分组名称" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="如：搜索引擎" />
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={groupIsPublic}
              onChange={(e) => setGroupIsPublic(e.target.checked)}
              className="h-4 w-4 rounded"
              style={{ accentColor: 'var(--color-primary)' }}
            />
            公开分组（未登录可见）
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowCreateGroup(false)}>取消</Button>
            <Button type="submit">创建分组</Button>
          </div>
        </form>
      </Modal>

      {/* ===== 创建分类 Modal ===== */}
      <Modal open={showCreateCategory} onClose={() => setShowCreateCategory(false)} title="新建分类">
        <form onSubmit={onCreateCategory} className="space-y-4">
          <Input label="分类名称" value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="如：常用搜索" />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>所属分组</label>
            <select
              value={catGroupId}
              onChange={(e) => setCatGroupId(e.target.value ? Number(e.target.value) : '')}
              className="w-full h-9 px-3 text-sm border rounded-md outline-none"
              style={{ borderColor: 'var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="">请选择分组</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowCreateCategory(false)}>取消</Button>
            <Button type="submit">创建分类</Button>
          </div>
        </form>
      </Modal>

      {/* ===== 创建卡片 Modal ===== */}
      <Modal open={showCreateItem} onClose={() => { setShowCreateItem(false); resetCreateForm(); }} title="新建卡片">
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
          <div className="flex flex-col gap-1.5">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>形状</span>
            <div className="flex gap-2">
              {(['rounded', 'square'] as Shape[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setItemShape(s)}
                  className={radioCls}
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
          <div className="flex flex-col gap-1.5">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>尺寸</span>
            <div className="flex gap-2">
              {(['sm', 'md', 'lg'] as Size[]).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setItemSize(sz)}
                  className={radioCls}
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
            <Button type="submit">创建卡片</Button>
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
            <div className="flex flex-col gap-1.5">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>形状</span>
              <div className="flex gap-2">
                {(['rounded', 'square'] as Shape[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEditingItem({ ...editingItem, shape: s })}
                    className={radioCls}
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
            <div className="flex flex-col gap-1.5">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>尺寸</span>
              <div className="flex gap-2">
                {(['sm', 'md', 'lg'] as Size[]).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setEditingItem({ ...editingItem, size: sz })}
                    className={radioCls}
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
    </AdminLayout>
  );
}

/** 统计卡片（与 UserMgr 一致风格） */
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
    <div className="bg-white border rounded-lg p-3 sm:p-4" style={{ borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
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
