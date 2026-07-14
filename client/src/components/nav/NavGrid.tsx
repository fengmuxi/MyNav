import { ReactNode } from 'react';

interface NavGridProps {
  children: ReactNode;
}

/**
 * 导航网格容器 - 对齐设计稿响应式断点
 * - 移动端 1 列
 * - 平板 sm 起 2 列
 * - 桌面 lg 起 3 列
 * - 大屏 xl 起 4 列
 * - 间距 gap-5
 */
export function NavGrid({ children }: NavGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {children}
    </div>
  );
}

export default NavGrid;
