/**
 * 导航数据路由 /api/nav (挂载为 /api/public/nav 与 /api/private/nav)
 * ------------------------------------------------------------------
 * - GET /api/public/nav  无需鉴权，返回 isPublic=1 的导航树
 * - GET /api/private/nav 需鉴权，返回 ownerId=当前用户 的私有导航树
 * - POST /api/nav/item/:id/click  可选鉴权，记录点击（已登录记录到用户，匿名 userId=null）
 * - GET /api/nav/top     可选鉴权，返回 Top N 常用导航（已登录按用户，匿名聚合全局）
 *
 * 返回结构（嵌套树）：
 * [
 *   { id, name, orderIndex, isPublic, ownerId, categories: [
 *     { id, name, orderIndex, items: [ { ...navItem } ] }
 *   ] }
 * ]
 */
import { Router } from 'express';
import { and, eq, desc, sql } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { navGroups, navCategories, navItems, navItemClicks, users } from '../db/schema.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { maintenanceMiddleware } from '../middleware/maintenanceMiddleware.js';

export const navRouter = Router();

// JWT 密钥（与 authMiddleware 一致）：用于可选鉴权解析 req.user
const JWT_SECRET = process.env.JWT_SECRET || 'mynav_dev_secret_change_me';

/**
 * 可选鉴权中间件：尝试解析 Authorization: Bearer <token>
 * - 解析成功：挂载 req.user
 * - 解析失败/无 token：直接放行，req.user 为 undefined
 *
 * 用于点击记录与 Top 查询接口（既支持匿名也支持登录用户）
 */
function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string; role: 'USER' | 'ADMIN' };
      // 查库确认账户仍有效
      const row = db
        .select({ id: users.id, username: users.username, role: users.role, status: users.status })
        .from(users)
        .where(eq(users.id, decoded.id))
        .get();
      if (row && row.status === 'active') {
        req.user = {
          id: row.id,
          username: row.username,
          role: row.role as 'USER' | 'ADMIN',
        };
      }
    } catch {
      // token 无效：忽略，按匿名处理
    }
  }
  next();
}

/**
 * 构建导航树：groups -> categories -> items
 * @param groupWhere 过滤分组的条件
 * - items 按 title 字母顺序排序
 * - 无 categoryId 的卡片归入虚拟分类"未分类"
 */
function buildNavTree(groupWhere: ReturnType<typeof eq> | ReturnType<typeof and>) {
  // 1) 查询符合条件的分组
  const groups = db
    .select()
    .from(navGroups)
    .where(groupWhere)
    .all();

  if (groups.length === 0) return [];

  // 2) 查询这些分组下的所有分类
  const groupIds = groups.map((g) => g.id);
  const categories = db.select().from(navCategories).all();
  const filteredCats = categories.filter((c) => groupIds.includes(c.groupId));

  // 3) 查询属于这些分组的所有卡片（通过 groupId 或 categoryId 关联）
  const catIds = filteredCats.map((c) => c.id);
  const items = db.select().from(navItems).all();
  const filteredItems = items.filter((i) => {
    if (i.groupId && groupIds.includes(i.groupId)) return true;
    if (i.categoryId && catIds.includes(i.categoryId)) return true;
    return false;
  });

  // 4) 组装嵌套结构，分组/分类/卡片均按名称排序
  return groups
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    .map((g) => {
      const groupCats = filteredCats
        .filter((c) => c.groupId === g.id)
        .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
        .map((c) => ({
          ...c,
          items: filteredItems
            .filter((i) => i.categoryId === c.id)
            .sort((a, b) => a.title.localeCompare(b.title, 'zh')),
        }));

      // 无分类的卡片归入"未分类"虚拟分类
      const uncategorized = filteredItems
        .filter((i) => (i.groupId === g.id) && !i.categoryId)
        .sort((a, b) => a.title.localeCompare(b.title, 'zh'));
      if (uncategorized.length > 0) {
        groupCats.push({
          id: 0,
          name: '未分类',
          groupId: g.id,
          orderIndex: 9999,
          items: uncategorized,
        } as typeof groupCats[number]);
      }

      return { ...g, categories: groupCats };
    });
}

/**
 * GET /api/public/nav
 * 返回所有公共分组（isPublic=1）及其下的分类与卡片
 */
navRouter.get('/public/nav', maintenanceMiddleware, (_req, res) => {
  const tree = buildNavTree(eq(navGroups.isPublic, 1));
  res.json(tree);
});

/**
 * GET /api/private/nav
 * 需鉴权：返回当前登录用户拥有的私有分组
 */
navRouter.get('/private/nav', authMiddleware, (req, res) => {
  const userId = req.user!.id;
  // 私有分组：ownerId = 当前用户 且 isPublic = 0
  const tree = buildNavTree(and(eq(navGroups.ownerId, userId), eq(navGroups.isPublic, 0)));
  res.json(tree);
});

/* ============================== 点击记录与常用导航 ============================== */

/**
 * POST /api/nav/item/:id/click
 * 记录一次卡片点击：根据是否登录分别记录到 (userId, itemId) 或 (null, itemId)
 * - 已登录：upsert (userId, itemId)，clickCount + 1
 * - 匿名：插入新行 (null, itemId, clickCount=1)（SQLite 中 NULL 不参与唯一约束，故每次点击都新增一行；
 *   匿名场景下接受这种行为，反正 Top 查询时会 SUM 聚合）
 *
 * 返回 { ok: true }
 */
navRouter.post('/nav/item/:id/click', optionalAuth, (req, res) => {
  const itemId = Number(req.params.id);
  if (Number.isNaN(itemId)) {
    res.status(400).json({ error: '无效的卡片 ID' });
    return;
  }

  // 校验卡片存在（避免脏数据）
  const item = db.select().from(navItems).where(eq(navItems.id, itemId)).get();
  if (!item) {
    res.status(404).json({ error: '卡片不存在' });
    return;
  }

  const userId = req.user?.id ?? null;
  const now = new Date();

  if (userId !== null) {
    // 已登录：尝试 upsert
    // SQLite 的 UNIQUE 索引在 NULL 行上不生效，所以已登录场景下 (userId, itemId) 唯一约束可用
    const existing = db
      .select()
      .from(navItemClicks)
      .where(and(eq(navItemClicks.userId, userId), eq(navItemClicks.itemId, itemId)))
      .get();
    if (existing) {
      db.update(navItemClicks)
        .set({
          clickCount: existing.clickCount + 1,
          lastClickedAt: now,
        })
        .where(eq(navItemClicks.id, existing.id))
        .run();
    } else {
      db.insert(navItemClicks)
        .values({ itemId, userId, clickCount: 1, lastClickedAt: now })
        .run();
    }
  } else {
    // 匿名：直接插入新行（聚合时 SUM）
    db.insert(navItemClicks)
      .values({ itemId, userId: null, clickCount: 1, lastClickedAt: now })
      .run();
  }

  res.json({ ok: true });
});

/**
 * GET /api/nav/top?limit=10
 * 返回 Top N 常用导航卡片
 * - 已登录：按该用户 clickCount 倒序
 * - 匿名：聚合所有记录 SUM(clickCount) 倒序
 *
 * 返回结构：NavItem[]（平铺数组，附带 clickCount 字段）
 *
 * 注意：返回的卡片会过滤掉当前用户无权访问的（已登录仅返回其私有 + 公共；匿名仅返回公共）
 */
navRouter.get('/nav/top', optionalAuth, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
  const userId = req.user?.id ?? null;

  // 1) 取出候选卡片 ID + 累计点击数
  let ranked: { itemId: number; clickCount: number }[] = [];
  if (userId !== null) {
    // 已登录：仅按该用户的点击次数排序
    ranked = db
      .select({
        itemId: navItemClicks.itemId,
        clickCount: navItemClicks.clickCount,
      })
      .from(navItemClicks)
      .where(eq(navItemClicks.userId, userId))
      .orderBy(desc(navItemClicks.clickCount), desc(navItemClicks.lastClickedAt))
      .limit(limit)
      .all();
  } else {
    // 匿名：聚合所有记录 SUM(click_count) GROUP BY item_id
    ranked = db
      .all(
        sql`SELECT item_id AS itemId, SUM(click_count) AS clickCount
            FROM nav_item_clicks
            GROUP BY item_id
            ORDER BY clickCount DESC, MAX(last_clicked_at) DESC
            LIMIT ${limit}`,
      ) as { itemId: number; clickCount: number }[];
  }

  if (ranked.length === 0) {
    res.json([]);
    return;
  }

  // 2) 取出对应卡片详情
  const allItems = db.select().from(navItems).all();
  const itemsMap = new Map(allItems.map((it) => [it.id, it]));

  // 3) 过滤掉当前用户无权访问的卡片（删除后/权限变化）
  // - 匿名：仅返回公共分组下的卡片
  // - 已登录：返回公共 + 自己私有的卡片
  const allGroups = db.select().from(navGroups).all();
  const publicGroupIds = new Set(allGroups.filter((g) => g.isPublic === 1).map((g) => g.id));
  const userOwnedGroupIds = userId !== null
    ? new Set(allGroups.filter((g) => g.ownerId === userId && g.isPublic === 0).map((g) => g.id))
    : new Set<number>();
  const allowedGroupIds = new Set<number>([...publicGroupIds, ...userOwnedGroupIds]);

  const result = ranked
    .map((r) => {
      const item = itemsMap.get(r.itemId);
      if (!item) return null;
      // 通过 groupId 校验访问权限（无 groupId 的孤儿卡片不展示）
      if (!item.groupId || !allowedGroupIds.has(item.groupId)) return null;
      return { ...item, clickCount: r.clickCount };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  res.json(result);
});
