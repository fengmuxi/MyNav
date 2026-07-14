# MyNav — 现代个人导航网站

一个轻量级、现代化的个人导航网站，前后端分离架构，使用单文件 SQLite 数据库，部署简单。

- **风格**：深色模式 (Dark Mode) + 毛玻璃 (Glassmorphism)
- **响应式**：移动端单列，桌面端多列
- **交互**：卡片悬停缩放、平滑过渡动画

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite + TailwindCSS + Zustand + React Router DOM + Axios |
| 后端 | Express.js + TypeScript + ES Modules (`"type": "module"`) |
| 数据库 | SQLite3（`better-sqlite3`） |
| ORM | Drizzle ORM |
| 认证 | JWT (`jsonwebtoken`) + `bcrypt` |
| 跨域 | `cors` 中间件 |

## 目录结构

```
my-nav/
├── client/          # 前端 React 项目
│   ├── src/
│   │   ├── components/{ui,nav}/
│   │   ├── pages/
│   │   ├── store/        # Zustand (authStore, navStore)
│   │   ├── api/          # Axios 实例
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
├── server/          # 后端 Express 项目
│   ├── src/
│   │   ├── db/           # SQLite 连接 & Schema (Drizzle)
│   │   ├── routes/       # auth.ts, nav.ts, admin.ts
│   │   ├── middleware/   # authMiddleware.ts, roleMiddleware.ts
│   │   ├── types/        # Express 类型扩展
│   │   └── index.ts
│   ├── drizzle.config.ts
│   └── package.json
├── database.db  # SQLite 数据文件（运行时生成）
└── README.md
```

## 环境要求

- Node.js >= 18
- npm >= 9

## 快速开始

### 1. 安装依赖

在项目根目录执行：

```bash
# 安装后端依赖
cd server
npm install

# 安装前端依赖
cd ../client
npm install
```

### 2. 配置后端环境变量（可选）

后端默认使用内置开发配置即可运行。如需自定义，在 `server/` 下创建 `.env`：

```env
PORT=3000
JWT_SECRET=your_super_secret_key_change_me
DATABASE_PATH=../database.db
```

> 生产环境**务必**修改 `JWT_SECRET` 与管理员密码。

### 3. 初始化数据库

数据库文件 `database.db` 会在后端**首次启动时自动创建**并执行建表与种子数据，无需手动初始化。

种子内容：
- 管理员账户：`admin` / `123456`（请立即修改！）
- 公共分组：「搜索引擎」「开发工具」，含 Google、GitHub 等示例链接。

如需**重置数据库**：删除根目录下的 `database.db`，重启后端即可重新生成。

### 4. 启动后端

```bash
cd server
npm run dev
```

后端默认运行在 `http://localhost:3000`，并提供 `/api/*` 接口。

### 5. 启动前端

```bash
cd client
npm run dev
```

前端默认运行在 `http://localhost:5173`，已配置 Vite 代理将 `/api` 转发到后端。

### 6. 构建生产版本

```bash
# 前端
cd client
npm run build      # 产物输出到 client/dist

# 后端
cd server
npm run build      # 产物输出到 server/dist
node dist/index.js # 运行编译后的服务
```

## 默认账号

| 字段 | 值 |
| --- | --- |
| 用户名 | `admin` |
| 密码 | `123456` |
| 角色 | `ADMIN` |

> ⚠️ 首次登录后请尽快修改默认密码。

## 主要 API

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | /api/auth/register | — | 注册（默认仅 Admin 可用） |
| POST | /api/auth/login | — | 登录，返回 `{ token, user }` |
| GET  | /api/public/nav | 否 | 公共导航数据 |
| GET  | /api/private/nav | JWT | 当前用户私有导航数据 |
| GET  | /api/admin/nav | Admin | 所有公共数据（管理视图） |
| POST | /api/admin/group | Admin | 创建分组 |
| POST | /api/admin/item | Admin | 创建卡片 |
| PUT  | /api/admin/item/:id | Admin | 更新卡片 |

## 常见问题

**Q: `better-sqlite3` 安装/编译失败？**
A: 确保已安装 Python 与 C++ 编译工具链（Windows 需 `npm i -g windows-build-tools` 或 Visual Studio Build Tools）。

**Q: 前端请求 404？**
A: 检查后端是否启动；确认 Vite 代理 `localhost:3000` 与后端端口一致。

**Q: 想清空数据重新开始？**
A: 删除根目录 `database.db`，重启后端会重新建表并 Seed。
