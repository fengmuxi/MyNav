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
│   │   │   ├── Admin/     # NavMgr, SystemSettings, UserMgr
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
│   │   ├── routes/        # auth.ts, nav.ts, user.ts, admin.ts, settings.ts
│   │   ├── middleware/    # authMiddleware.ts, roleMiddleware.ts, maintenanceMiddleware.ts
│   │   ├── types/         # express.d.ts
│   │   ├── crypto.ts      # RSA 密钥生成与加解密
│   │   ├── mailer.ts      # SMTP 邮件发送
│   │   ├── settings.ts    # 系统设置读写
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

## 6. 中间件规则

- `authMiddleware`：从 `Authorization: Bearer <token>` 解析 JWT，验证后将 `user` 挂载到 `req.user`。过期/无效 token 返回 401。
- `roleMiddleware`：检查 `req.user.role === 'ADMIN'`，否则返回 403。
- `maintenanceMiddleware`：检查系统设置 `maintenance.enabled`，若启用则返回 503 维护模式响应。

## 7. 安全规则

### 7.1 密码传输

- 前端通过 RSA 公钥加密密码后传输（GET `/api/auth/public-key` 获取公钥）。
- 后端使用 RSA 私钥解密后，再与 bcrypt 哈希比对。
- RSA 密钥对由 `server/src/crypto.ts` 管理，支持管理员重新生成。

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
- 首次启动生成 RSA 密钥对（存储在内存，重启后重新生成）。

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

## 12. 代码质量要求

- 关键模块必须含详细注释：**SQLite 连接**、**JWT 验证逻辑**、**RSA 加解密**。
- 后端使用 ES Modules，导入需带 `.js` 扩展名（TS 编译后兼容）。
- 修改现有代码时遵循「外科手术式改动」，不重构无关代码。
- 优先中文注释。

## 13. 默认凭据（仅开发环境）

- 管理员账号：`admin`
- 管理员密码：`123456`
- JWT 密钥：见 `server/.env` 的 `JWT_SECRET`（开发默认值已硬编码兜底，生产必须覆盖）。