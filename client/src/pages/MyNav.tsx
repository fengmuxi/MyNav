import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Navbar } from '../components/ui/Navbar';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { ColorPicker } from '../components/nav/ColorPicker';
import { useNavStore } from '../store/navStore';
import api from '../api/axios';
import { toast } from '../store/toastStore';
import type { NavGroup, NavItem } from '../types';

type Shape = 'rounded' | 'square';
type Size = 'sm' | 'md' | 'lg';

/** 垃圾桶图标路径（Heroicons outline trash） */
const TRASH_ICON =
  'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0';

/**
 * 我的导航 - 普通用户私人导航管理
 * - 顶部统计卡片（分组数 / 分类数 / 卡片数）
 * - 数据列表按 分组 → 分类 → 卡片 渲染，分组/分类可删除，卡片点击编辑（编辑弹窗内可删除）
 * - 创建分组 / 分类 / 卡片 均通过 Modal 触发，分组强制私有
 */
export default function MyNav() {
  const { groups, loading, fetchMyNav } = useNavStore();

  useEffect(() => {
    fetchMyNav();
  }, [fetchMyNav]);

  // ===== 表单状态 =====
  const [groupName, setGroupName] = useState('');

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

  // ===== 批量管理状态 =====
  const [batchMode, setBatchMode] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<number>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

  // Modal 开关
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [showCreateItem, setShowCreateItem] = useState(false);

  // ===== 统计 =====
  const stats = useMemo(() => {
    const groupCount = groups.length;
    const categoryCount = groups.reduce((sum, g) => sum + g.categories.length, 0);
    const itemCount = groups.reduce(
      (sum, g) => sum + g.categories.reduce((s, c) => s + c.items.length, 0),
      0,
    );
    return { groupCount, categoryCount, itemCount };
  }, [groups]);

  // ===== 创建分组（私有，不传 isPublic） =====
  const onCreateGroup = async (e: FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      toast.warning('分组名称不能为空');
      return;
    }
    try {
      await api.post('/user/nav/group', { name: groupName.trim() });
      toast.success(`分组「${groupName}」创建成功`);
      setGroupName('');
      setShowCreateGroup(false);
      await fetchMyNav();
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '操作失败');
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
      await api.post('/user/nav/category', {
        name: catName.trim(),
        groupId: Number(catGroupId),
      });
      toast.success('分类创建成功');
      setCatName('');
      setCatGroupId('');
      setShowCreateCategory(false);
      await fetchMyNav();
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '操作失败');
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
      toast.success('卡片创建成功');
      setItemTitle('');
      setItemUrl('');
      setItemIcon('');
      setItemNote('');
      setItemGroupId('');
      setItemCategoryId('');
      setShowCreateItem(false);
      await fetchMyNav();
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '操作失败');
    }
  };

  // ===== 更新卡片 =====
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
      await fetchMyNav();
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '操作失败');
    }
  };

  // ===== 删除分组 =====
  const onDeleteGroup = async (id: number, name: string) => {
    if (!window.confirm(`确定删除分组「${name}」吗？该操作将删除其下所有分类与卡片，且不可恢复。`)) return;
    try {
      await api.delete(`/user/nav/group/${id}`);
      toast.success('分组已删除');
      await fetchMyNav();
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '操作失败');
    }
  };

  // ===== 删除分类 =====
  const onDeleteCategory = async (id: number, name: string) => {
    if (!window.confirm(`确定删除分类「${name}」吗？该操作将删除其下所有卡片，且不可恢复。`)) return;
    try {
      await api.delete(`/user/nav/category/${id}`);
      toast.success('分类已删除');
      await fetchMyNav();
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '操作失败');
    }
  };

  // ===== 删除卡片 =====
  const onDeleteItem = async (id: number, title: string) => {
    if (!window.confirm(`确定删除卡片「${title}」吗？`)) return;
    try {
      await api.delete(`/user/nav/item/${id}`);
      toast.success('卡片已删除');
      setEditingItem(null);
      await fetchMyNav();
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '操作失败');
    }
  };

  // ===== 批量管理：切换分组选中（连带其下所有分类与卡片） =====
  const toggleGroupSelection = (groupId: number) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      const categoryIds = group.categories.map((c) => c.id);
      const itemIds = group.categories.flatMap((c) => c.items.map((it) => it.id));
      if (next.has(groupId)) {
        next.delete(groupId);
        setSelectedCategories((prevC) => {
          const n = new Set(prevC);
          categoryIds.forEach((id) => n.delete(id));
          return n;
        });
        setSelectedItems((prevI) => {
          const n = new Set(prevI);
          itemIds.forEach((id) => n.delete(id));
          return n;
        });
      } else {
        next.add(groupId);
        setSelectedCategories((prevC) => {
          const n = new Set(prevC);
          categoryIds.forEach((id) => n.add(id));
          return n;
        });
        setSelectedItems((prevI) => {
          const n = new Set(prevI);
          itemIds.forEach((id) => n.add(id));
          return n;
        });
      }
      return next;
    });
  };

  // ===== 批量管理：切换分类选中（连带其下所有卡片） =====
  const toggleCategorySelection = (groupId: number, categoryId: number) => {
    const group = groups.find((g) => g.id === groupId);
    const category = group?.categories.find((c) => c.id === categoryId);
    if (!category) return;
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      const itemIds = category.items.map((it) => it.id);
      if (next.has(categoryId)) {
        next.delete(categoryId);
        setSelectedItems((prevI) => {
          const n = new Set(prevI);
          itemIds.forEach((id) => n.delete(id));
          return n;
        });
      } else {
        next.add(categoryId);
        setSelectedItems((prevI) => {
          const n = new Set(prevI);
          itemIds.forEach((id) => n.add(id));
          return n;
        });
      }
      return next;
    });
  };

  // ===== 批量管理：切换单个卡片选中 =====
  const toggleItemSelection = (itemId: number) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // ===== 批量管理：全选 =====
  const selectAll = () => {
    const allGroups = new Set<number>();
    const allCategories = new Set<number>();
    const allItems = new Set<number>();
    groups.forEach((g) => {
      allGroups.add(g.id);
      g.categories.forEach((c) => {
        allCategories.add(c.id);
        c.items.forEach((it) => allItems.add(it.id));
      });
    });
    setSelectedGroups(allGroups);
    setSelectedCategories(allCategories);
    setSelectedItems(allItems);
  };

  // ===== 批量管理：清空选择 =====
  const clearSelection = () => {
    setSelectedGroups(new Set());
    setSelectedCategories(new Set());
    setSelectedItems(new Set());
  };

  // ===== 批量管理：批量删除 =====
  const onBatchDelete = async () => {
    const total = selectedGroups.size + selectedCategories.size + selectedItems.size;
    if (total === 0) {
      toast.warning('请先选择要删除的内容');
      return;
    }
    if (!window.confirm(`确认删除选中的 ${total} 项？删除分组将级联删除其下所有分类和卡片，删除分类将级联删除其下所有卡片。`)) return;
    try {
      const tasks: Promise<unknown>[] = [];
      selectedGroups.forEach((id) => tasks.push(api.delete(`/user/nav/group/${id}`)));
      selectedCategories.forEach((id) => tasks.push(api.delete(`/user/nav/category/${id}`)));
      selectedItems.forEach((id) => tasks.push(api.delete(`/user/nav/item/${id}`)));
      await Promise.all(tasks);
      toast.success(`成功删除 ${total} 项`);
      clearSelection();
      setBatchMode(false);
      await fetchMyNav();
    } catch (e2) {
      toast.error((e2 as { response?: { data?: { error?: string } } })?.response?.data?.error || '批量删除失败');
    }
  };

  // 退出批量管理并清空选择
  const exitBatchMode = () => {
    setBatchMode(false);
    clearSelection();
  };

  // 计算分组复选框状态：checked / indeterminate / unchecked
  const getGroupCheckState = (groupId: number): 'checked' | 'indeterminate' | 'unchecked' => {
    if (selectedGroups.has(groupId)) return 'checked';
    const group = groups.find((g) => g.id === groupId);
    if (!group) return 'unchecked';
    const hasSelectedChild = group.categories.some(
      (c) => selectedCategories.has(c.id) || c.items.some((it) => selectedItems.has(it.id)),
    );
    return hasSelectedChild ? 'indeterminate' : 'unchecked';
  };

  // 计算分类复选框状态：checked / indeterminate / unchecked
  const getCategoryCheckState = (groupId: number, categoryId: number): 'checked' | 'indeterminate' | 'unchecked' => {
    if (selectedCategories.has(categoryId)) return 'checked';
    const group = groups.find((g) => g.id === groupId);
    const category = group?.categories.find((c) => c.id === categoryId);
    if (!category) return 'unchecked';
    const hasSelectedChild = category.items.some((it) => selectedItems.has(it.id));
    return hasSelectedChild ? 'indeterminate' : 'unchecked';
  };

  // Radio 按钮组通用样式
  const radioCls = 'flex-1 px-3 py-2 text-sm rounded-lg border cursor-pointer transition text-center';

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page)' }}>
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-6">
        {/* ===== 标题栏 ===== */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>我的导航</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>管理你的私人导航卡片</p>
          </div>
          <div className="flex items-center gap-2">
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
            <Button
              variant={batchMode ? 'primary' : 'outline'}
              onClick={() => (batchMode ? exitBatchMode() : setBatchMode(true))}
              className="!px-3 sm:!px-4"
              title={batchMode ? '退出管理' : '批量管理'}
            >
              <span className="hidden sm:inline">{batchMode ? '退出管理' : '批量管理'}</span>
              <svg className="w-4 h-4 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </Button>
          </div>
        </div>

        {/* ===== 批量管理工具栏 ===== */}
        {batchMode && (
          <div
            className="flex items-center gap-2 sm:gap-3 flex-wrap rounded-lg border p-3"
            style={{ borderColor: 'var(--color-primary)', background: 'var(--color-primary-50)' }}
          >
            <span className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>
              已选 {selectedGroups.size + selectedCategories.size + selectedItems.size} 项
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <Button type="button" variant="outline" size="sm" onClick={selectAll}>全选</Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={onBatchDelete}
                disabled={selectedGroups.size + selectedCategories.size + selectedItems.size === 0}
              >
                删除选中
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={exitBatchMode}>退出管理</Button>
            </div>
          </div>
        )}

        {/* ===== 统计卡片：移动端 2 列，桌面端 3 列 ===== */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
          <StatCard label="分组总数" value={stats.groupCount} color="primary" iconPath="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          <StatCard label="分类总数" value={stats.categoryCount} color="info" iconPath="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          <StatCard label="卡片总数" value={stats.itemCount} color="success" iconPath="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </div>

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
                      <BatchCheckbox
                        state={getGroupCheckState(g.id)}
                        onChange={() => toggleGroupSelection(g.id)}
                      />
                    )}
                    <span className="font-medium text-sm sm:text-base truncate" style={{ color: 'var(--text-primary)' }}>{g.name}</span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: 'var(--bg-inset)', color: 'var(--text-tertiary)' }}
                    >
                      私有
                    </span>
                    {!batchMode && (
                      <button
                        type="button"
                        onClick={() => onDeleteGroup(g.id, g.name)}
                        className="ml-auto inline-flex items-center justify-center h-7 w-7 rounded-md transition flex-shrink-0"
                        style={{ color: 'var(--state-error)' }}
                        title="删除分组"
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--state-error-light)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                          <path strokeLinecap="round" strokeLinejoin="round" d={TRASH_ICON} />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {g.categories.map((c) => (
                      <div key={c.id}>
                        <div className="mb-2 flex items-center gap-1.5">
                          {batchMode && (
                            <BatchCheckbox
                              state={getCategoryCheckState(g.id, c.id)}
                              onChange={() => toggleCategorySelection(g.id, c.id)}
                            />
                          )}
                          <span className="w-1 h-3.5 rounded-full flex-shrink-0" style={{ background: 'var(--color-primary)' }} />
                          <span className="text-xs sm:text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{c.name}</span>
                          {!batchMode && (
                            <button
                              type="button"
                              onClick={() => onDeleteCategory(c.id, c.name)}
                              className="inline-flex items-center justify-center h-6 w-6 rounded transition flex-shrink-0"
                              style={{ color: 'var(--state-error)' }}
                              title="删除分类"
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--state-error-light)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                                <path strokeLinecap="round" strokeLinejoin="round" d={TRASH_ICON} />
                              </svg>
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 sm:gap-2">
                          {c.items.map((it) => (
                            <div key={it.id} className="flex items-center gap-1.5">
                              {batchMode && (
                                <BatchCheckbox
                                  state={selectedItems.has(it.id) ? 'checked' : 'unchecked'}
                                  onChange={() => toggleItemSelection(it.id)}
                                />
                              )}
                              <button
                                onClick={() => (batchMode ? toggleItemSelection(it.id) : setEditingItem({ ...it }))}
                                className="flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 py-2 sm:py-1.5 text-[13px] sm:text-xs text-white border transition hover:scale-105"
                                style={{
                                  backgroundColor: it.color ?? 'var(--color-primary)',
                                  borderColor: 'transparent',
                                  boxShadow: batchMode && selectedItems.has(it.id) ? '0 0 0 2px var(--color-primary)' : 'none',
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
      </div>

      {/* ===== 创建分组 Modal（无公开分组选项） ===== */}
      <Modal open={showCreateGroup} onClose={() => setShowCreateGroup(false)} title="新建分组">
        <form onSubmit={onCreateGroup} className="space-y-4">
          <Input label="分组名称" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="如：搜索引擎" />
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>私人导航分组仅自己可见</p>
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
      <Modal open={showCreateItem} onClose={() => setShowCreateItem(false)} title="新建卡片">
        <form onSubmit={onCreateItem} className="space-y-4">
          <Input label="标题" value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} placeholder="如：Google" />
          <Input label="链接" value={itemUrl} onChange={(e) => setItemUrl(e.target.value)} placeholder="https://..." />
          <Input label="图标 (Emoji 或文字)" value={itemIcon} onChange={(e) => setItemIcon(e.target.value)} placeholder="🔍" />
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
          <div className="flex flex-col gap-1.5">
            <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>所属分类（可选）</label>
            <select
              value={itemCategoryId}
              onChange={(e) => setItemCategoryId(e.target.value ? Number(e.target.value) : '')}
              className="w-full h-9 px-3 text-sm border rounded-md outline-none"
              style={{ borderColor: 'var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="">不选择分类</option>
              {itemGroupId && groups.find((g) => g.id === itemGroupId)?.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
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
            <Button type="button" variant="outline" onClick={() => setShowCreateItem(false)}>取消</Button>
            <Button type="submit">创建卡片</Button>
          </div>
        </form>
      </Modal>

      {/* ===== 编辑卡片 Modal（含删除入口） ===== */}
      <Modal open={!!editingItem} onClose={() => setEditingItem(null)} title="编辑卡片">
        {editingItem && (
          <form onSubmit={onUpdateItem} className="space-y-4">
            <Input label="标题" value={editingItem.title} onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })} />
            <Input label="链接" value={editingItem.url} onChange={(e) => setEditingItem({ ...editingItem, url: e.target.value })} />
            <Input label="图标" value={editingItem.icon ?? ''} onChange={(e) => setEditingItem({ ...editingItem, icon: e.target.value })} />
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
            <div className="flex justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onDeleteItem(editingItem.id, editingItem.title)}
                style={{ color: 'var(--state-error)', borderColor: 'var(--state-error)' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d={TRASH_ICON} />
                </svg>
                删除卡片
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setEditingItem(null)}>取消</Button>
                <Button type="submit">保存</Button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

/** 统计卡片（对齐 NavMgr 风格，仅 primary/info/success 三色） */
function StatCard({
  label,
  value,
  color,
  iconPath,
}: {
  label: string;
  value: number;
  color: 'primary' | 'info' | 'success';
  iconPath: string;
}) {
  const colorMap = {
    primary: { bg: 'var(--color-primary-50)', fg: 'var(--color-primary)' },
    info: { bg: 'var(--state-info-light)', fg: 'var(--state-info)' },
    success: { bg: 'var(--state-success-light)', fg: 'var(--state-success)' },
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

/** 批量管理复选框：支持 checked / indeterminate / unchecked 三态 */
function BatchCheckbox({
  state,
  onChange,
}: {
  state: 'checked' | 'indeterminate' | 'unchecked';
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'indeterminate';
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'checked'}
      onChange={onChange}
      className="h-4 w-4 cursor-pointer flex-shrink-0"
      style={{ accentColor: 'var(--color-primary)' }}
    />
  );
}
