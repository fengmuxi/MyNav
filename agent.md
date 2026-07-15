# MyNav 项目 Agent 指南

> 本文件用于约束 AI 代理（Agent）在本项目中的开发行为，确保所有改动遵循既定技术栈与工程规范。

## 1. 项目概述

MyNav 是一个轻量级、现代化的个人导航网站，采用前后端分离架构。

- **定位**：个人工具应用，部署简单（单文件 SQLite 数据库，无需独立数据库服务）。
- **风格**：深色模式 (Dark Mode) + 毛玻璃 (Glassmorphism)，支持多主题切换。

## 2. 不可变技术栈（严格遵守，不得替换）

| 层级 | 技术 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite + TailwindCSS + Zustand + React Router DOM + Axios |
| 后端 | Express.js + TypeScript + ES Modules (`"type": "module"`) |
| 数据库 | SQLite3（`better-sqlite3`） |
| ORM | Drizzle ORM |
| 认证 | JWT (`jsonwebtoken`) + `bcrypt` + RSA 加密（前端公钥加密，后端私钥解密） |
| 跨域 | `cors` 中间件 |

> 禁止引入 Prisma、TypeORM、Sequelize 等其它 ORM；禁止改用 MySQL/PostgreSQL。

## 3. 目录结构

```
my-nav/
├── client/          # 前端 React
│   ├── src/
│   │   ├── components/{ui,nav}/
│   │   │   ├── ui/        # AdminLayout, Button, Input, Modal, Navbar, Toast, Toggle, OAuthIcon
│   │   │   └── nav/       # NavCard, NavGrid, ColorPicker, ThemePicker
│   │   ├── pages/         # Home, Login, Register, ForgotPassword, ResetPassword
│   │   │   ├── Admin/     # NavMgr, SystemSettings, UserMgr, Logs
│   │   │   └── MyNav, Profile, Settings
│   │   ├── store/         # authStore, navStore, themeStore, toastStore, settingsStore (Zustand)
│   │   ├── api/           # axios.ts, crypto.ts (RSA 加密)
│   │   ├── types/         # types.ts (共享类型), settings.ts (系统设置类型)
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   └── package.json
├── server/          # 后端 Express
│   ├── src/
│   │   ├── db/            # index.ts(连接+建表), schema.ts, seed.ts
│   │   ├── routes/        # auth.ts, nav.ts, user.ts, admin.ts, settings.ts, logs.ts
│   │   ├── middleware/    # authMiddleware.ts, roleMiddleware.ts, maintenanceMiddleware.ts, logMiddleware.ts
│   │   ├── types/         # express.d.ts
│   │   ├── crypto.ts      # RSA 密钥生成与加解密
│   │   ├── logger.ts      # 系统日志核心（按天分割、大小轮转、SSE 推送）
│   │   ├── mailer.ts      # SMTP 邮件发送
│   │   ├── settings.ts    # 系统设置读写
│   │   ├── version.ts     # 版本信息单一来源
│   │   ├── zip.ts         # 极简 ZIP 工具（无外部依赖，用于数据备份）
│   │   └── index.ts
│   ├── uploads/           # 头像与图标上传目录
│   ├── drizzle.config.ts
│   └── package.json
├── database.sqlite  # 运行时生成
└── README.md
```

## 4. 数据库 Schema 规则

### 4.1 核心表

| 表名 | 字段 | 说明 |
| --- | --- | --- |
| users | id, username, passwordHash, role, status, theme, displayName, email, bio, avatar, failedLoginAttempts, lockedUntil, createdAt | 用户表 |
| navGroups | id, name, orderIndex, isPublic, ownerId | 导航分组 |
| navCategories | id, name, groupId, orderIndex | 导航分类 |
| navItems | id, title, url, icon, categoryId(可空), groupId(必填), orderIndex, color, shape, size | 导航卡片 |
| settings | key, value | 系统设置（key-value 结构） |
| passwordResets | id, userId, token, expiresAt, used, createdAt | 密码重置令牌 |
| navItemClicks | id, itemId, userId(可空), clickCount, lastClickedAt | 导航点击记录 |

### 4.2 字段约束

- 布尔字段统一用 `integer` (0/1) 存储（SQLite 无原生 boolean）。
- `shape` / `size` 为枚举字符串：
  - `shape`: `'rounded'` | `'square'`
  - `size`: `'sm'` | `'md'` | `'lg'`
- `navItems.categoryId` 可空（未分类卡片直接挂在分组下）。
- `navItems.groupId` 为必填外键。
- 外键统一配置 `onDelete: 'cascade'`，实现级联删除。

### 4.3 排序规则

navGroups、navCategories、navItems 均按名称使用 `localeCompare('zh')` 进行中文排序。

## 5. API 路由约定

### 5.1 认证路由 /api/auth

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | /api/auth/public-key | 否 | 获取 RSA 公钥（前端加密密码用） |
| POST | /api/auth/register | 否 | 注册（受系统设置 allowRegister 控制） |
| POST | /api/auth/login | 否 | 登录，返回 `{ token, user }` |
| POST | /api/auth/forgot-password | 否 | 忘记密码，生成重置 token |
| POST | /api/auth/reset-password | 否 | 使用 token 重置密码 |

### 5.2 公共导航路由 /api/public

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | /api/public/nav | 否 | 查询 `isPublic = 1` 的导航树 |

### 5.3 私有导航路由 /api/private

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | /api/private/nav | JWT | 查询 `ownerId = 当前用户` 的私有导航树 |

### 5.4 用户个人路由 /api/user

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | /api/user/theme | JWT | 获取当前用户主题方案 |
| PUT | /api/user/theme | JWT | 更新主题方案 |
| GET | /api/user/profile | JWT | 获取个人资料 |
| PUT | /api/user/profile | JWT | 更新个人资料（昵称/邮箱/简介） |
| PUT | /api/user/password | JWT | 修改密码（需旧密码） |
| POST | /api/user/avatar | JWT | 上传头像（base64 data URL） |
| POST | /api/user/nav/icon | JWT | 上传导航图标（base64 data URL） |
| GET | /api/user/nav | JWT | 获取当前用户私有导航树 |
| POST | /api/user/nav/group | JWT | 创建私有分组 |
| POST | /api/user/nav/category | JWT | 创建分类 |
| POST | /api/user/nav/item | JWT | 创建卡片 |
| PUT | /api/user/nav/item/:id | JWT | 更新卡片 |
| DELETE | /api/user/nav/item/:id | JWT | 删除卡片 |
| DELETE | /api/user/nav/category/:id | JWT | 删除分类（级联删除卡片） |
| DELETE | /api/user/nav/group/:id | JWT | 删除分组（级联删除分类和卡片） |

### 5.5 工具路由 /api/nav

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | /api/nav/item/:id/click | 可选 | 记录卡片点击（已登录关联用户，匿名 userId=null） |
| GET | /api/nav/top | 可选 | 获取 Top N 常用导航 |

### 5.6 工具路由 /api/util

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | /api/util/meta?url=xxx | 否 | 获取网页 title 和 favicon（用于添加导航时自动填充） |
| GET | /api/util/favicon?url=xxx | 否 | 代理 favicon 图片（避免前端跨域/GFW 拦截） |

### 5.7 系统设置路由 /api/settings

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | /api/settings/public | 否 | 获取脱敏系统设置 |
| GET | /api/settings/version | 否 | 获取本地版本信息 |
| GET | /api/settings/version/check | 否 | 对比 GitHub 最新版本，返回是否有更新 |

### 5.8 管理后台路由 /api/admin

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | /api/admin/nav | Admin | 查询所有公共导航数据 |
| POST | /api/admin/group | Admin | 创建分组 |
| POST | /api/admin/category | Admin | 创建分类 |
| POST | /api/admin/item | Admin | 创建卡片 |
| PUT | /api/admin/item/:id | Admin | 更新卡片 |
| DELETE | /api/admin/group/:id | Admin | 删除分组（级联删除） |
| DELETE | /api/admin/category/:id | Admin | 删除分类（级联删除卡片） |
| DELETE | /api/admin/item/:id | Admin | 删除卡片 |
| GET | /api/admin/users | Admin | 用户列表 |
| POST | /api/admin/users | Admin | 创建用户 |
| PUT | /api/admin/users/:id | Admin | 更新用户（角色/状态/资料） |
| PUT | /api/admin/users/:id/password | Admin | 重置用户密码 |
| DELETE | /api/admin/users/:id | Admin | 删除用户 |
| GET | /api/admin/settings | Admin | 获取完整系统设置 |
| PUT | /api/admin/settings | Admin | 更新系统设置 |
| GET | /api/admin/rsa/public-key | Admin | 查看 RSA 公钥信息 |
| PUT | /api/admin/rsa/regenerate | Admin | 重新生成 RSA 密钥对 |
| POST | /api/admin/backup/export | Admin | 导出加密数据备份（ZIP） |
| POST | /api/admin/backup/import | Admin | 导入数据备份（解密 ZIP 并全量恢复） |

### 5.9 日志管理路由 /api/admin/logs

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | /api/admin/logs/config | Admin | 获取日志配置（文件大小、保留天数） |
| PUT | /api/admin/logs/config | Admin | 更新日志配置 |
| GET | /api/admin/logs/files | Admin | 列出所有日志文件 |
| GET | /api/admin/logs/files/:filename | Admin | 读取指定日志文件内容（query: ?lines=500） |
| GET | /api/admin/logs/stream | Admin | SSE 实时日志流 |
| POST | /api/admin/logs/cleanup | Admin | 手动触发清理过期日志 |

## 6. 中间件规则

- `authMiddleware`：从 `Authorization: Bearer <token>` 解析 JWT，验证后将 `user` 挂载到 `req.user`。过期/无效 token 返回 401。
- `roleMiddleware`：检查 `req.user.role === 'ADMIN'`，否则返回 403。
- `maintenanceMiddleware`：检查系统设置 `maintenanceMode`，若启用则返回 503 维护模式响应。
- `requestLogMiddleware`：记录每个 HTTP 请求的方法、路径、状态码、响应时长、IP、用户信息。跳过静态文件和健康检查。4xx 用 warn，5xx 用 error。
- `errorLogMiddleware`：全局错误捕获中间件，记录未捕获异常的 stack trace，放在所有路由之后。

## 7. 安全规则

### 7.1 密码传输

- 前端通过 RSA 公钥加密密码后传输（GET `/api/auth/public-key` 获取公钥）。
- 后端使用 RSA 私钥解密后，再与 bcrypt 哈希比对。
- RSA 密钥对由 `server/src/crypto.ts` 管理，持久化存储在 `settings` 表（key='rsa_keys'），支持管理员重新生成。

### 7.2 登录安全

- 连续登录失败超过 `maxLoginAttempts`（默认 5）次后锁定 `lockMinutes`（默认 30）分钟。
- 登录成功后自动重置失败计数和锁定时间。

### 7.3 数据隔离

- 用户只能访问自己的私有导航数据（`ownerId = 当前用户` 且 `isPublic = 0`）。
- 公共导航数据（`isPublic = 1`）对所有访客可见。
- 管理员可访问所有数据。

## 8. 前端关键实现规则

### 8.1 状态管理

- `authStore`：管理 token、user，持久化到 localStorage，支持 `hasHydrated` 标志防止首次渲染闪烁。
- `navStore`：管理导航分组数据，支持公共/私有/管理三种数据源，包含维护模式和常用导航。
- `themeStore`：管理主题方案，支持从后端同步和本地偏好设置。
- `toastStore`：管理全局提示消息。
- `settingsStore`：管理全局系统设置（站点名称、描述、ICP、注册开关等），从 `/api/settings/public` 拉取，无需持久化。

### 8.2 路由守卫

App.tsx 中定义三种路由守卫：
- `AdminRoute`：仅 `role === 'ADMIN'` 可访问，否则重定向到登录页。
- `PrivateRoute`：需登录（token 存在），未登录重定向到登录页。
- `PublicOnly`：已登录用户不可访问（如登录/注册页），已登录重定向到首页。

路由清单：

| 路径 | 守卫 | 页面 |
| --- | --- | --- |
| `/` | 无 | Home |
| `/login` | PublicOnly | Login |
| `/register` | PublicOnly | Register |
| `/forgot-password` | 无 | ForgotPassword |
| `/reset-password` | 无 | ResetPassword |
| `/profile` | PrivateRoute | Profile |
| `/settings` | 无 | Settings |
| `/my/nav` | PrivateRoute | MyNav |
| `/admin/nav` | AdminRoute | NavMgr |
| `/admin/users` | AdminRoute | UserMgr |
| `/admin/system` | AdminRoute | SystemSettings |
| `/admin/logs` | AdminRoute | Logs |
| `*` | 无 | 重定向到 `/` |

### 8.3 首页逻辑

- 使用 `useEffect` 检测 `authStore` 中的 token；未登录走公共接口，已登录走私有接口。
- 支持常用导航视图（基于点击记录）。

### 8.4 网格布局

- `grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4 auto-rows-[120px]`。

### 8.5 NavCard

- 根据 `size` 动态分配 `col-span` 类名（sm=1, md=2, lg=3）。
- 根据 `color` 绑定 `style={{ backgroundColor: item.color }}`。
- 根据 `shape` 切换圆角：`square` → `rounded-none`，否则 `rounded-xl`。
- 卡片点击时调用 `recordClick` 上报（fire-and-forget）。

### 8.6 主题系统

- 内置 6 个主题预设：clean（简约白）、dark（暗夜黑）、warm（暖阳橙）、forest（森林绿）、aurora（极光紫）、sunset（日落橙）。
- 用户自定义主题存储在 `users.theme`（JSON 字符串），后端为 null 时使用前端默认预设。

### 8.7 交互

- 卡片 `hover:scale-105`，平滑过渡动画。
- 模态框用于添加/编辑导航卡片、分组、分类。
- 批量管理模式支持多选删除，带确认对话框。

## 9. 初始化与种子数据

- 首次启动若 `database.sqlite` 不存在，自动建表并执行 seed。
- Seed 管理员：`admin` / `123456`（须提醒用户修改）。
- Seed 公共数据：「搜索引擎」「开发工具」分组，含 Google、GitHub 等示例链接。
- 首次启动生成 RSA 密钥对（持久化存储在 `settings` 表 key='rsa_keys'）。

## 10. 系统设置

系统设置存储在 `settings` 表，key='system'，value=JSON 字符串。

| 设置项 | 说明 | 默认值 |
| --- | --- | --- |
| siteName | 站点名称 | '沐曦导航' |
| siteDescription | 站点描述 | '沐曦导航 - 简洁优雅的个人导航主页' |
| siteIcon | 站点图标 URL | '/logo.png' |
| icp | ICP 备案号 | '' |
| allowRegister | 是否允许注册 | true |
| registerMethod | 注册模式（email/invite/closed） | 'email' |
| inviteCode | 邀请码 | 'NAV2026' |
| defaultRole | 默认注册角色 | 'USER' |
| oauthProviders | 第三方 OAuth 注册配置（google/github/wechat/qq/weibo） | 全部禁用 |
| allowCustomTheme | 是否允许用户自定义主题 | true |
| allowPublicNav | 是否允许公共导航 | true |
| pageSize | 分页大小 | 20 |
| enableSearch | 是否启用搜索 | true |
| maxLoginAttempts | 最大登录失败次数 | 5 |
| lockMinutes | 锁定时长（分钟） | 30 |
| sessionHours | JWT 会话有效期（小时） | 24 |
| force2FA | 是否强制双因素认证 | false |
| maintenanceMode | 是否维护模式 | false |
| maintenanceNotice | 维护公告 | '' |
| githubEnabled | 是否显示 GitHub 开源入口 | false |
| githubUrl | GitHub 仓库地址（用于页脚跳转与版本检查） | '' |
| smtp.enabled | SMTP 是否启用 | false |
| smtp.host | SMTP 主机 | '' |
| smtp.port | SMTP 端口 | 465 |
| smtp.secure | SMTP 是否使用 SSL | true |
| smtp.user | SMTP 用户 | '' |
| smtp.pass | SMTP 密码 | '' |
| smtp.fromName | 发件人名称 | '沐曦导航' |
| smtp.fromEmail | 发件人邮箱 | '' |

## 11. 部署与静态托管

### 11.1 上传目录

- `server/uploads/avatars/`：用户头像存储。
- `server/uploads/icons/`：导航图标存储。
- 启动时自动创建目录（`fs.mkdirSync` recursive）。
- 通过 `/uploads/*` 暴露为静态资源，`maxAge: '7d'`。
- 支持 `UPLOADS_PATH` 环境变量自定义路径（Docker 部署用）。

### 11.2 前端静态资源托管（生产环境）

- 通过 `PUBLIC_DIR` 环境变量指定前端构建产物目录。
- 启用后，所有非 `/api/`、非 `/uploads/` 的 GET 请求返回 `index.html`，实现 SPA 路由回退。
- 适用于单镜像部署（前后端同容器）。

### 11.3 健康检查

- `GET /api/health` 返回 `{ status: 'ok', time: ... }`，用于部署监控。

## 12. 系统日志

### 12.1 核心模块

- 日志核心由 `server/src/logger.ts` 实现，无外部依赖（纯 Node.js `fs` + `EventEmitter`）。
- 日志格式：单行 JSON `{"ts":"...","level":"info","msg":"...","meta":{...}}`。
- 日志目录：`server/logs/`（可通过 `LOGS_PATH` 环境变量自定义）。

### 12.2 文件轮转

- 按天命名：`app-YYYY-MM-DD.log`。
- 超过 `maxFileSize`（默认 10MB）自动轮转：`app-YYYY-MM-DD-1.log`、`-2.log`...
- 超过 `retentionDays`（默认 30 天）自动清理。
- 配置存储在 `settings` 表 key='log_config'，管理员可通过后台修改。

### 12.3 实时日志流

- 内存环形缓冲最近 500 条日志，SSE 新连接时先回放缓冲。
- 通过 `EventEmitter` 实时推送新日志到已连接的 SSE 客户端。
- 每 30 秒发送心跳防止连接超时。
- 前端使用 `fetch + ReadableStream` 实现 SSE（支持 Authorization 头）。

### 12.4 请求日志中间件

- `requestLogMiddleware`：记录每个 HTTP 请求（方法、路径、状态码、时长、IP、用户）。
- 跳过静态文件（`/uploads/`、`/logo.png`、`/favicon.ico`）和健康检查（`/api/health`、`/api/settings/version*`）。
- `errorLogMiddleware`：全局错误捕获，放在所有路由之后。

## 13. 数据备份与恢复

### 13.1 导出

- 接口：`POST /api/admin/backup/export`，需 Admin 鉴权。
- 请求体：`{ password }`（至少 6 位，用于加密备份数据）。
- 收集全量数据：users、navGroups、navCategories、navItems、navItemClicks、settings。
- **排除** `rsa_keys`（私钥不导出）和 `passwordResets`（一次性令牌）。
- 使用 PBKDF2 派生密钥 + AES 加密，打包为 ZIP 文件下载。
- ZIP 工具由 `server/src/zip.ts` 实现，无外部依赖。

### 13.2 导入

- 接口：`POST /api/admin/backup/import`，需 Admin 鉴权。
- 请求体：`{ password, zip }`（zip 为 base64 编码）。
- 解压 ZIP → 读取 backup.json → 使用 password 解密 → 全量恢复数据。
- **注意**：恢复后当前管理员账号将被替换为备份中的账号，需重新登录。

## 14. 代码质量要求

- 关键模块必须含详细注释：**SQLite 连接**、**JWT 验证逻辑**、**RSA 加解密**。
- 后端使用 ES Modules，导入需带 `.js` 扩展名（TS 编译后兼容）。
- 修改现有代码时遵循「外科手术式改动」，不重构无关代码。
- 优先中文注释。

## 15. CHANGELOG.md 持续维护规范（强制）

> 本项目采用 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 规范，CHANGELOG.md 是 GitHub Release 正文的唯一数据来源。为保证发版时变更信息完整准确，**每次代码修改必须同步更新 CHANGELOG.md**。

### 15.1 [Unreleased] 区域

CHANGELOG.md 顶部「---」分隔线之后维护一个 `[Unreleased]`（未发布）区域，用于累积日常开发中的所有变更：

```markdown
## [Unreleased]

### 新增
- xxx 功能

### 变更
- xxx 逻辑调整

### 修复
- xxx 问题修复

### 移除
- 移除 xxx
```

### 15.2 每次代码修改的记录义务

Agent 完成任何代码修改后，**必须**同步在 `[Unreleased]` 对应分类下追加一条记录：

| 变更类型 | 对应分类 | 判定标准 |
| --- | --- | --- |
| 新增功能、新增接口、新增字段、新增页面 | `### 新增` | 之前不存在的代码 |
| 修改逻辑、重构、优化、配置调整 | `### 变更` | 修改已有代码的行为 |
| 修复 bug、修复异常、修复 UI 缺陷 | `### 修复` | 修复错误行为 |
| 删除功能、删除接口、删除字段 | `### 移除` | 移除已有代码 |

记录要求：
- 一条变更对应一条记录，以 `- ` 开头
- 简洁明了，说明**改了什么**（必要时说明**为什么改**）
- 示例：`- 修复登录失败锁定后无法自动解锁的问题`
- 若某分类无内容则整段省略，不留空标题

### 15.3 发版时的两模块格式

发布新版本时，`[Unreleased]` 区域转换为正式版本段落，最终版本段落包含**两个模块**：

```markdown
## [vX.Y.Z] - YYYY-MM-DD

### Git 提交记录
- abc1234 修复登录锁定逻辑
- def5678 优化首页加载性能
- ...

### 新增
- xxx 功能

### 变更
- xxx 逻辑调整

### 修复
- xxx 问题修复

### 移除
- 移除 xxx
```

| 模块 | 内容 | 来源 |
| --- | --- | --- |
| 模块一：Git 提交记录 | 自上次发版 tag 以来的所有 commit 哈希与提交信息 | `git log <上次tag>..HEAD --oneline` |
| 模块二：变更明细 | 新增 / 变更 / 修复 / 移除 分类下的具体变更步骤 | `[Unreleased]` 区域日常维护的内容 |

两个模块合并写入版本段落后，在其上方重新创建空的 `[Unreleased]` 区域（详见第 17 节发版流程）。

### 15.4 约束

- **禁止**在完成代码修改后跳过 CHANGELOG.md 更新
- **禁止**将多条不相关的变更合并为一条记录
- **禁止**在 `[Unreleased]` 区域使用版本号标题（必须保持 `## [Unreleased]`）
- **禁止**删除已发布版本的历史记录
- 若一次修改涉及多个分类，应在每个相关分类下分别追加记录

## 16. 默认凭据（仅开发环境）

- 管理员账号：`admin`
- 管理员密码：`123456`
- JWT 密钥：见 `server/.env` 的 `JWT_SECRET`（开发默认值已硬编码兜底，生产必须覆盖）。

---

## 17. 版本管理规范（强制）

### 17.1 单一来源

- **版本信息唯一来源**：[server/src/version.ts](server/src/version.ts)
- 任何版本号、发布日期、变更摘要的修改必须从此文件入手，禁止散落到其他位置
- 前端通过 `GET /api/settings/version` 读取版本信息，禁止在前端硬编码版本号

### 17.2 版本号规则

采用 [Semantic Versioning](https://semver.org/lang/zh-CN/)：`v<major>.<minor>.<patch>`

| 位 | 何时递增 |
| --- | --- |
| major | 不兼容的 API 变更（数据库 schema 重构、接口字段删除/重命名等） |
| minor | 向下兼容的功能新增（新增接口、新增字段、新增页面） |
| patch | 向下兼容的缺陷修复（bug 修复、UI 微调、文案修改） |

- 版本号始终带 `v` 前缀（如 `v1.0.0`），与 GitHub Release tag 保持一致
- 预发布版本可追加 `-alpha` / `-beta` / `-rc.1` 等后缀

### 17.3 发布新版本必须执行的步骤

每次发布新版本时，**必须**按顺序完成以下三步，缺一不可：

1. **更新 [CHANGELOG.md](CHANGELOG.md)**（合并两模块为正式版本段落）
   - 收集**模块一**：执行 `git log <上次tag>..HEAD --oneline` 获取自上次发版以来的所有提交记录
   - 收集**模块二**：读取 `[Unreleased]` 区域中的变更明细（新增/变更/修复/移除）
   - 将 `## [Unreleased]` 标题改为 `## [vX.Y.Z] - YYYY-MM-DD`
   - 在版本标题下方依次写入两个模块：
     - `### Git 提交记录`（模块一，每行格式：`- <短哈希> <提交信息>`）
     - `### 新增` / `### 变更` / `### 修复` / `### 移除`（模块二，来自 `[Unreleased]`）
   - 在版本段落上方重新创建空的 `## [Unreleased]` 区域（保留分类标题骨架）
   - 版本段标题格式**必须**严格为：`## [vX.Y.Z] - YYYY-MM-DD`
   - **格式与 release.yml 提取规则的对应关系**：
     - release.yml 使用 awk 匹配 `^## \[<tag>\]` 定位版本段开始
     - 匹配到下一个 `^## \[` 时结束提取（两个模块均在提取范围内）
     - 若标题格式不匹配（如缺少方括号、缺少 v 前缀、缺少日期），Release 正文将为默认提示
   - 格式自检正则：`^## \[v\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}$`

2. **更新 [server/src/version.ts](server/src/version.ts)**
   - 修改 `VERSION` 为新版本号（含 `v` 前缀）
   - 修改 `RELEASE_DATE` 为发布日期（ISO 日期格式 `YYYY-MM-DD`）
   - 修改 `CHANGELOG_SUMMARY` 为一句话摘要（基于 `[Unreleased]` 内容概括）

3. **发布 GitHub Release**
   - 推送 Git tag，由 [.github/workflows/release.yml](.github/workflows/release.yml) 自动创建 Release
   - Release 正文自动从 CHANGELOG.md 提取对应版本段落（含两个模块）
   - 此 Release 将作为前端「检查更新」的对比基准

### 17.4 版本对比机制

- **本地版本**：来自 [server/src/version.ts](server/src/version.ts) 的 `VERSION`
- **远端版本**：GitHub Releases 最新 tag_name（`https://api.github.com/repos/{owner}/{repo}/releases/latest`）
- **对比方式**：语义化版本比较（去除 `v` 前缀，按 `major.minor.patch` 逐段比较）
- **缓存策略**：服务端 5 分钟内存缓存，避免频繁请求 GitHub API 触发限流
- **接口**：
  - `GET /api/settings/version` 返回本地版本信息
  - `GET /api/settings/version/check` 对比 GitHub 最新版本，返回 `{ hasUpdate, isLatest, remote, local, message }`

### 17.5 GitHub 仓库配置

- 管理员在后台「系统设置 → GitHub 开源信息」中配置：
  - `githubEnabled`：是否在前端页脚显示 GitHub 入口与版本检查
  - `githubUrl`：仓库主页地址（如 `https://github.com/owner/repo`）
- 后端会自动从 `githubUrl` 解析出 `owner/repo`，拼接 GitHub API URL
- 未启用或未配置时，前端不显示 GitHub 入口与版本检查按钮

### 17.6 文件清单

涉及版本管理的文件：

| 文件 | 作用 |
| --- | --- |
| [server/src/version.ts](server/src/version.ts) | 版本信息单一来源（VERSION / RELEASE_DATE / CHANGELOG_SUMMARY） |
| [CHANGELOG.md](CHANGELOG.md) | 变更日志，含 `[Unreleased]` 未发布区域，每次代码修改必须更新，发版时转为正式版本 |
| [server/src/routes/settings.ts](server/src/routes/settings.ts) | 版本检查接口（GitHub API 代理 + 缓存 + semver 对比） |
| [client/src/store/settingsStore.ts](client/src/store/settingsStore.ts) | 前端版本状态管理 |
| [client/src/pages/Home.tsx](client/src/pages/Home.tsx) | 页脚显示版本号 + GitHub 链接 + 更新提示 |
| [client/src/pages/Admin/SystemSettings.tsx](client/src/pages/Admin/SystemSettings.tsx) | 后台 GitHub 配置入口 |
| [.github/workflows/release.yml](.github/workflows/release.yml) | 推送 tag 时自动创建 GitHub Release |

### 17.7 快速发版指令（Agent 必须遵守）

当用户对 Agent 说出以下任一指令时，Agent **必须**按本节流程自动执行完整的发版操作，**不得**仅执行其中部分步骤：

- 「提交 tag」
- 「发版」
- 「发布版本」
- 「打 tag」
- 「release vX.Y.Z」（指定具体版本号）

#### 变更信息收集（前置必执行）

Agent 在确定版本号之前，**必须**同时收集两个模块的变更信息：

**模块一：Git 提交记录**
1. 读取 `server/src/version.ts` 中的 `VERSION` 作为上次版本号（如 `v1.0.0`）
2. 执行 `git log <上次版本号>..HEAD --oneline --no-decorate` 获取自上次发版以来的所有提交
   - 上次版本的 tag 存在时：`git log v1.0.0..HEAD --oneline --no-decorate`
   - 无任何 tag 时：`git log --oneline --no-decorate`（取全部历史）
   - 每条记录格式为 `<短哈希> <提交信息>`，需转换为 `- <短哈希> <提交信息>` 写入 CHANGELOG

**模块二：变更明细**
1. 读取 CHANGELOG.md，定位 `## [Unreleased]` 标题
2. 提取其下所有分类（新增/变更/修复/移除）的记录

**汇总与确认**
1. 若 `[Unreleased]` 区域为空且 git log 也无新提交，应停止并提示用户「无任何变更，无需发版」
2. 基于模块二的记录生成一句话摘要（不超过 30 字）
3. 将两个模块的内容和摘要展示给用户，请求确认或修改：
   - 用户确认 -> 直接使用
   - 用户修改 -> 以用户修改后的内容为准，并同步更新 CHANGELOG.md 的 `[Unreleased]` 区域

#### 触发条件判定

1. Agent 先执行「变更信息收集」，获取两个模块内容并经用户确认
2. 若用户在指令中指定了版本号（如「提交 tag v1.0.1」），则以指定版本号为准
3. 若用户未指定版本号，Agent 基于变更信息**建议**版本号类型，由用户确认：
   - 含「移除」分类或重大「变更」-> 建议 **major**（v1.0.0 -> v2.0.0）
   - 含「新增」分类 -> 建议 **minor**（v1.0.0 -> v1.1.0）
   - 仅含「修复」 -> 建议 **patch**（v1.0.0 -> v1.0.1）

#### 执行流程（严格按顺序，任一步骤失败立即停止并报告）

```
步骤 0：收集变更信息（前置）
  - 模块一：执行 git log <上次版本号>..HEAD --oneline --no-decorate 获取提交记录
  - 模块二：读取 CHANGELOG.md 中的 [Unreleased] 区域，提取分类记录
  - 生成一句话摘要
  - 展示两个模块内容给用户确认或修改
  - 验证：若 [Unreleased] 为空且 git log 无输出，停止并提示「无变更」

步骤 1：确定版本号
  - 读取 server/src/version.ts 中的 VERSION 常量
  - 解析出当前 major.minor.patch
  - 基于变更信息建议版本号类型，用户确认后计算 newVersion（含 v 前缀）

步骤 2：更新 CHANGELOG.md（合并两模块为正式版本段落）
  - 将 ## [Unreleased] 标题改为 ## [vX.Y.Z] - YYYY-MM-DD
  - 在版本标题下方依次写入两个模块：
    模块一（### Git 提交记录）：
      ### Git 提交记录
      - abc1234 修复登录锁定逻辑
      - def5678 优化首页加载性能
      - ...
    模块二（### 新增/变更/修复/移除，来自 [Unreleased]）：
      ### 新增
      - xxx

      ### 修复
      - xxx
  - 在版本段落上方重新创建空的 ## [Unreleased] 区域（保留分类标题骨架）：
    ## [Unreleased]

    ### 新增

    ### 变更

    ### 修复

    ### 移除
  - 格式自检（必须通过，否则 release.yml 无法提取正文）：
    1. 新版本标题行必须严格匹配正则：^## \[v\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}$
    2. 方括号内版本号必须与 newVersion 完全一致（含 v 前缀）
    3. 日期必须与 RELEASE_DATE 一致
    4. 标题行前后各保留一个空行
    5. 新的 [Unreleased] 标题必须为 ## [Unreleased]（不含版本号）
    6. 模块一标题必须为 ### Git 提交记录，每行格式：- <短哈希> <提交信息>

步骤 3：更新 server/src/version.ts
  - 将 VERSION 改为 newVersion
  - 将 RELEASE_DATE 改为当天日期（YYYY-MM-DD，时区 Asia/Shanghai）
  - 将 CHANGELOG_SUMMARY 改为经用户确认的一句话摘要

步骤 4：Git 提交
  - git add server/src/version.ts CHANGELOG.md
  - 提交信息格式（中文）：
    release: vX.Y.Z - <一句话摘要>
  - 示例：release: v1.0.1 - 修复登录失败锁定逻辑缺陷

步骤 5：创建并推送 Git Tag
  - git tag vX.Y.Z
  - git push origin vX.Y.Z
  - 同时推送主分支提交：git push origin HEAD

步骤 6：验证与提示
  - 输出本次发版摘要：
    ✓ 版本号：vX.Y.Z
    ✓ 发布日期：YYYY-MM-DD
    ✓ Git Tag：已推送
    ✓ GitHub Release：将由 .github/workflows/release.yml 自动创建（正文含两个模块）
    ✓ Docker 镜像：Release 发布后将由 .github/workflows/docker-build.yml 自动构建
  - 提醒用户可在 GitHub 仓库 Actions 页面查看构建进度
```

#### 约束

- **禁止**跳过步骤 0（必须同时收集 Git 提交记录和 [Unreleased] 变更明细）
- **禁止**跳过步骤 2 或 3（CHANGELOG.md 和 version.ts 必须同步更新）
- **禁止**在版本段落中遗漏模块一（Git 提交记录）或模块二（变更明细）
- **禁止**在未征得用户同意的情况下递增 major 位（major 变更需明确确认）
- **禁止**修改版本号格式（必须 `v` 前缀 + 三段数字）
- **禁止**将本次发版的变更内容混入上一版本的段落中
- **禁止**使用 `git push --force` 推送 tag
- **禁止**在 CHANGELOG.md 版本标题中使用不规范的格式（如 `## v1.0.1` 或 `## [1.0.1]`），必须为 `## [v1.0.1] - YYYY-MM-DD`
- **禁止**发版后遗漏创建新的空 `[Unreleased]` 区域
- 若 Git 工作区存在未提交的其他改动，应先提示用户处理或暂存，避免污染发版提交
- 若 `[Unreleased]` 区域和 git log 均无变更记录，应停止发版并提示用户

### 17.8 GitHub Release 自动化

工作流文件：[.github/workflows/release.yml](.github/workflows/release.yml)

#### 触发条件

- 当且仅当向仓库推送 `v*` 格式的 tag 时触发（如 `v1.0.0`、`v1.0.1`）

#### 自动行为

1. 检出代码（需 `fetch-depth: 0` 以获取完整历史）
2. 从 tag 名提取版本号（如 `refs/tags/v1.0.1` → `v1.0.1`）
3. 从 [CHANGELOG.md](CHANGELOG.md) 中提取对应版本的段落作为 Release 正文
   - 提取规则：匹配 `## [vX.Y.Z] — YYYY-MM-DD` 标题到下一个 `## [` 之间的内容
   - 若未匹配到则使用默认正文（提示用户检查 CHANGELOG.md）
4. 调用 `softprops/action-gh-release@v2` 创建 GitHub Release
   - tag_name：触发本工作流的 tag
   - name：`vX.Y.Z - <CHANGELOG_SUMMARY>`（若提取不到摘要则仅用版本号）
   - body：步骤 3 提取的 CHANGELOG 段落
   - draft: false
   - prerelease: 自动判断（tag 含 `-alpha` / `-beta` / `-rc` 后缀时标记为预发布）

#### 依赖关系

- 本工作流创建 Release 后，[docker-build.yml](.github/workflows/docker-build.yml) 会因 `release: published` 事件被自动触发，开始构建并推送 Docker 镜像
- 因此推送 tag 后的完整链路为：
  ```
  git push origin vX.Y.Z
    → release.yml 触发 → 创建 GitHub Release
    → docker-build.yml 触发 → 构建并推送 Docker 镜像到阿里云 ACR
  ```

#### 失败排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| Release 未创建 | tag 名不以 `v` 开头 | 检查 tag 格式 |
| Release 正文为默认提示 | CHANGELOG.md 中未找到对应版本段落 | 检查 CHANGELOG.md 是否包含 `## [vX.Y.Z]` 标题 |
| 权限错误 | GITHUB_TOKEN 权限不足 | 工作流已配置 `contents: write`，无需额外配置 |