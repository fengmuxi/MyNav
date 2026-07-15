# MyNav 项目 Agent 指南

> 约束 AI 代理在本项目中的开发行为。

## 1. 项目概述

前后端分离的个人导航网站，单文件 SQLite 部署，深色模式 + 毛玻璃风格，支持多主题切换。

## 2. 不可变技术栈（严格遵守）

| 层级 | 技术 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite + TailwindCSS + Zustand + React Router DOM + Axios |
| 后端 | Express.js + TypeScript + ES Modules (`"type": "module"`) |
| 数据库 | SQLite3（`better-sqlite3`） |
| ORM | Drizzle ORM |
| 认证 | JWT + `bcrypt` + RSA（前端公钥加密，后端私钥解密） |

> 禁止引入 Prisma、TypeORM、Sequelize；禁止改用 MySQL/PostgreSQL。

## 3. 目录结构

```
client/src/  → components/{ui,nav}, pages(/Admin), store, api, types, App.tsx
server/src/  → db(schema/seed/migrations), routes, middleware, crypto, logger, mailer, settings, version, zip, index.ts
server/uploads/{avatars,icons}  database.db(运行时生成)
```

## 4. 数据库 Schema

| 表名 | 说明 |
| --- | --- |
| users | 用户（role、status、theme、profile、登录失败计数） |
| navGroups | 分组（isPublic、ownerId） |
| navCategories | 分类（关联 groupId） |
| navItems | 卡片（categoryId 可空、groupId 必填、color/shape/size/note） |
| settings | 系统设置（key-value） |
| passwordResets | 密码重置令牌 |
| navItemClicks | 点击记录（userId 可空） |

**约束**：布尔用 `integer`(0/1)；`shape`=`rounded|square`、`size`=`sm|md|lg`；外键 `onDelete: 'cascade'`；列表按 `localeCompare('zh')` 排序。

### 4.1 数据库迁移与版本管理（强制）

项目使用版本化迁移系统（[server/src/db/migrations.ts](server/src/db/migrations.ts)），确保旧版数据库在升级新版本时自动兼容。

**核心机制**：
- `schema_migrations` 表记录已应用的迁移版本号
- 启动时 `runMigrations()` 读取当前版本，依次执行未应用的迁移
- 每个迁移在独立事务中执行，失败则回滚，不残留半完成状态
- 迁移必须**幂等**（可重复执行），使用 `hasColumn`/`hasTable` 辅助函数先检查再操作

**三步初始化流程**（`index.ts` → `initSchema()`）：
1. `CREATE TABLE IF NOT EXISTS`：新库直接创建最新结构，旧库跳过
2. `runMigrations()`：对旧库补充缺失列/结构，对新库幂等跳过
3. `seedDatabase()`：首次启动创建管理员和示例导航

**修改数据库结构的强制规则**：
当需要新增列、修改列类型或新增表时，**必须**按以下步骤操作：
1. 在 `migrations.ts` 的 `migrations` 数组末尾追加新迁移，`version` 递增（当前最新版本见 `LATEST_DB_VERSION`）
2. 迁移 `up` 函数中用 `hasColumn`/`hasTable` 检查后再 `ALTER TABLE` / `CREATE TABLE`，保证幂等
3. 同步更新 `schema.ts` 的 Drizzle 定义和 `index.ts` 的 `CREATE TABLE` 语句
4. 禁止直接修改已发布的迁移（已应用的迁移不可变），只能追加新迁移
5. `schema_migrations` 表不参与数据备份/恢复（属于 schema 元数据，非用户数据）

## 5. API 路由

| 模块 | 前缀 | 鉴权 | 核心能力 |
| --- | --- | --- | --- |
| 认证 | `/api/auth` | 否 | RSA 公钥、注册、登录、忘记/重置密码 |
| 公共导航 | `/api/public/nav` | 否 | `isPublic=1` 导航树 |
| 私有导航 | `/api/private/nav` | JWT | 当前用户私有导航树 |
| 用户 | `/api/user` | JWT | 主题/资料/密码/头像/私有导航 CRUD/备份导出 |
| 导航工具 | `/api/nav` | 可选 | 点击记录、Top N |
| 网页工具 | `/api/util` | 否 | meta 抓取、favicon 代理 |
| 系统设置 | `/api/settings` | 否 | 公开设置、版本、版本检查 |
| 管理后台 | `/api/admin` | Admin | 导航/用户/设置/RSA/备份导入导出 |
| 日志 | `/api/admin/logs` | Admin | 配置/文件/SSE 流/清理 |

备份路由：`GET /api/user/backup/export`、`POST /api/admin/backup/export`、`POST /api/admin/backup/import`。

## 6. 中间件

- `authMiddleware`：解析 JWT 挂载 `req.user`，失败 401
- `roleMiddleware`：检查 `role === 'ADMIN'`，否则 403
- `maintenanceMiddleware`：检查 `maintenanceMode`，启用 503
- `requestLogMiddleware`：记录请求（跳过静态文件/健康检查，4xx warn、5xx error）
- `errorLogMiddleware`：全局错误捕获，放所有路由之后

## 7. 安全规则

- **密码传输**：RSA 公钥加密 → 私钥解密 → bcrypt 比对；密钥持久化 `settings` 表 key='rsa_keys'
- **登录安全**：失败超 `maxLoginAttempts`(5) 锁定 `lockMinutes`(30)，成功重置
- **数据隔离**：用户仅访问 `ownerId=自己 && isPublic=0`；公共数据对所有人可见；管理员可访问全部

## 8. 前端关键实现

- **状态**：authStore(localStorage+hasHydrated)、navStore(公共/私有/管理三源)、themeStore、toastStore、settingsStore(从 `/api/settings/public` 拉取不持久化)
- **路由守卫**：AdminRoute(仅 ADMIN)、PrivateRoute(需登录)、PublicOnly(已登录不可访问)
- **首页**：未登录走公共、已登录走私有，支持常用导航视图
- **网格**：`grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4 auto-rows-[120px]`
- **NavCard**：size 分配 col-span(sm=1/md=2/lg=3)、color 绑定 backgroundColor、shape 切换圆角、点击 fire-and-forget
- **主题**：6 预设(clean/dark/warm/forest/aurora/sunset) + 用户自定义(存 `users.theme` JSON)

## 9. 初始化与默认凭据

- 首次启动自动建表 + seed + 生成 RSA 密钥对
- 管理员：`admin` / `123456`（须提醒用户修改）
- JWT 密钥：见 `server/.env` 的 `JWT_SECRET`（生产必须覆盖）

## 10. 系统设置

存储 `settings` 表 key='system'，value=JSON。分类：站点信息(siteName/siteDescription/siteIcon/icp)、注册控制(allowRegister/registerMethod/inviteCode/defaultRole)、OAuth(google/github/wechat/qq/weibo，默认禁用)、功能开关(allowCustomTheme/allowPublicNav/enableSearch)、分页(pageSize=20)、登录安全(maxLoginAttempts/lockMinutes/sessionHours/force2FA)、维护模式(maintenanceMode/maintenanceNotice)、GitHub 开源(githubEnabled/githubUrl)、SMTP(smtp.*)。

## 11. 部署与运维

- **上传目录**：`server/uploads/{avatars,icons}/`，启动自动创建；`UPLOADS_PATH` 自定义
- **静态托管**：`PUBLIC_DIR` 指定前端产物，SPA 回退 `index.html`
- **健康检查**：`GET /api/health`
- **Docker**：单镜像 + Compose；多架构仅 linux/amd64（better-sqlite3 限制）

## 12. 系统日志

`server/src/logger.ts`，纯 Node.js 实现。单行 JSON `{ts, level, msg, meta}`，目录 `server/logs/`（`LOGS_PATH` 自定义）。按天 `app-YYYY-MM-DD.log`，超 10MB 分文件，超 30 天清理（配置存 `settings` key='log_config'）。内存环形缓冲 500 条，SSE 推送 + 30 秒心跳。

## 13. 数据备份

- **用户导出**：`GET /api/user/backup/export`（JWT），加密私有导航/资料/点击
- **管理员导出**：`POST /api/admin/backup/export`（Admin），全量数据（排除 rsa_keys、passwordResets）
- **管理员导入**：`POST /api/admin/backup/import`，全量恢复（恢复后管理员账号被替换需重新登录）
- 加密：PBKDF2 派生 + AES-256-GCM；ZIP 含单 backup.json；导入导出包裹 SQLite 事务

## 14. 代码质量

- 关键模块必详细注释：SQLite 连接、JWT 验证、RSA 加解密
- 后端 ES Modules，导入带 `.js` 扩展名
- 外科手术式改动，不重构无关代码
- 优先中文注释

---

## 15. CHANGELOG.md 维护规范（强制）

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，CHANGELOG.md 是 GitHub Release 正文唯一来源。

### 15.1 修改代码后必须同步记录

**每次代码修改完成后，必须**在 CHANGELOG.md 顶部 `## [Unreleased]` 对应分类下追加一条记录：

- 分类：`### 新增`（之前不存在）/ `### 变更`（修改已有行为）/ `### 修复`（修复错误）/ `### 移除`（删除代码）
- 格式：`- 简洁描述改了什么/为什么改`
- 一条变更对应一条记录；某分类无内容则整段省略
- 禁止合并多条不相关变更、禁止在 `[Unreleased]` 使用版本号标题、禁止删除已发布历史

### 15.2 发版时的两模块格式

发布时 `[Unreleased]` 转为正式版本段落，包含两个模块：

| 模块 | 内容 | 来源 |
| --- | --- | --- |
| 模块一：Git 提交记录 | 自上次 tag 以来所有 commit 哈希与信息 | `git log <上次tag>..HEAD --oneline` |
| 模块二：变更明细 | 新增/变更/修复/移除分类 | `[Unreleased]` 日常维护内容 |

版本段标题**必须**严格为 `## [vX.Y.Z] - YYYY-MM-DD`（release.yml 用 awk 匹配 `^## \[<tag>\]` 到下一个 `^## \[` 结束）；自检正则：`^## \[v\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}$`。

---

## 16. 版本管理规范（强制）

### 16.1 单一来源

版本信息唯一来源：[server/src/version.ts](server/src/version.ts)（`VERSION` / `RELEASE_DATE` / `CHANGELOG_SUMMARY`）。前端通过 `GET /api/settings/version` 读取，禁止硬编码。

### 16.2 版本号规则

Semantic Versioning `v<major>.<minor>.<patch>`：不兼容 API 变更→major、向下兼容新增→minor、缺陷修复→patch。

### 16.3 发版流程（Agent 必须遵守）

当用户说「提交 tag」「发版」「发布版本」「打 tag」「release vX.Y.Z」时，Agent **必须**完整执行以下步骤，与用户确定版本号并更新项目版本信息：

**步骤 0：收集变更并确认（前置必执行）**
- 模块一：`git log <上次版本号>..HEAD --oneline --no-decorate`（上次版本号取自 version.ts；无 tag 取全部历史）
- 模块二：读取 CHANGELOG.md 的 `[Unreleased]` 区域
- 生成一句话摘要（≤30 字），展示两个模块给用户确认或修改
- 若 `[Unreleased]` 为空且 git log 无输出，停止并提示「无变更」

**步骤 1：确定版本号（与用户确认）**
- 读取 version.ts 解析当前 major.minor.patch
- 基于变更建议：含「移除」或重大「变更」→major；含「新增」→minor；仅「修复」→patch
- **必须与用户确认版本号**；用户指定时以指定为准；major 递增需明确同意

**步骤 2：更新 CHANGELOG.md（整合两模块）**
- `## [Unreleased]` → `## [vX.Y.Z] - YYYY-MM-DD`
- 写入 `### Git 提交记录`（每行 `- <短哈希> <信息>`）+ `### 新增/变更/修复/移除`
- 上方重建空 `## [Unreleased]`（保留分类骨架）
- 自检：标题匹配 `^## \[v\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}$`；版本号与 newVersion 一致；日期与 RELEASE_DATE 一致

**步骤 3：更新 version.ts（更新项目版本信息）**
- `VERSION` = newVersion
- `RELEASE_DATE` = 当天（YYYY-MM-DD，Asia/Shanghai）
- `CHANGELOG_SUMMARY` = 用户确认的摘要

**步骤 4：Git 提交**
- `git add server/src/version.ts CHANGELOG.md`
- 提交信息：`release: vX.Y.Z - <摘要>`

**步骤 5：推送 Tag**
- `git tag vX.Y.Z` → `git push origin vX.Y.Z` → `git push origin HEAD`

**步骤 6：验证与提示**
- 输出摘要（版本号、日期、Tag、Release、Docker 状态），提醒查看 GitHub Actions

### 16.4 约束

- 禁止跳过步骤 0、1、2、3
- 禁止遗漏模块一或模块二
- 禁止未征得用户同意递增 major 或使用 `git push --force`
- 禁止修改版本号格式（必须 `v` 前缀 + 三段数字）
- 禁止版本标题不规范（如 `## v1.0.1` 或 `## [1.0.1]`）
- 禁止发版后遗漏创建空 `[Unreleased]`
- Git 工作区有未提交改动时先提示用户处理

### 16.5 GitHub Release 自动化

[.github/workflows/release.yml](.github/workflows/release.yml)：推送 `v*` tag 触发 → 从 CHANGELOG.md 提取对应版本段落作为 Release 正文 → `softprops/action-gh-release@v2` 创建 Release → 触发 docker-build.yml 构建推送镜像到阿里云 ACR。

### 16.6 版本对比

本地 version.ts 的 `VERSION` vs GitHub Releases 最新 tag_name，语义化比较（去 `v` 逐段比较），服务端 5 分钟缓存。接口：`GET /api/settings/version`、`GET /api/settings/version/check`。
