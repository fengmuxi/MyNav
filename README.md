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

## Docker 一键部署

项目提供单镜像 Docker 部署方案，前后端打包在同一个镜像中，后端托管前端静态资源，部署简单。

### 方式一：Docker Compose（推荐）

```bash
# 1. 复制环境变量配置文件
cp .env.example .env

# 2. 编辑 .env，修改 JWT_SECRET 等关键配置
# （可选，默认配置也能运行）

# 3. 构建并启动
docker compose up -d --build

# 4. 查看日志
docker compose logs -f

# 5. 停止服务
docker compose down
```

访问 `http://localhost:3000` 即可使用。

### 方式二：纯 Docker 命令

```bash
# 构建镜像
docker build -t mynav .

# 运行容器
docker run -d \
  --name mynav \
  -p 3000:3000 \
  -v ./data/database:/app/data \
  -v ./data/uploads:/app/uploads \
  -e JWT_SECRET=your-super-secret-key \
  mynav
```

### Docker 数据持久化

数据通过 Docker Volume 持久化，存放在项目根目录的 `data/` 文件夹下：

```
data/
├── database/    # SQLite 数据库文件（database.db）
└── uploads/     # 用户上传文件（头像等）
```

删除容器不会丢失数据，如需完全重置，删除 `data/` 目录即可。

### 环境变量说明

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `APP_PORT` | 对外暴露端口 | `3000` |
| `JWT_SECRET` | JWT 签名密钥（**生产环境务必修改**） | `change-me-to-a-random-secret-key` |
| `ADMIN_PASSWORD` | 管理员密码（服务器级备份加密） | 空 |
| `MAIL_HOST` | SMTP 服务器地址 | 空 |
| `MAIL_PORT` | SMTP 端口 | `587` |
| `MAIL_USER` | SMTP 用户名 | 空 |
| `MAIL_PASS` | SMTP 密码 | 空 |
| `MAIL_FROM` | 发件人显示 | 空 |

## 自动构建与发布（GitHub Actions）

项目配置了 GitHub Actions 工作流，发布 Release 时自动构建 Docker 镜像并推送到阿里云容器镜像服务（ACR）。

### 配置步骤

1. **登录阿里云控制台**，进入「容器镜像服务 ACR」，创建命名空间和镜像仓库。

2. **获取访问凭证**：ACR 实例详情 -> 访问凭证，记录「登录用户名」和「固定/临时密码」。

3. **在 GitHub 仓库中配置 Secrets**：
   Settings -> Secrets and variables -> Actions -> New repository secret

   | Secret 名称 | 说明 | 示例值 |
   | --- | --- | --- |
   | `ALIYUN_REGISTRY` | 镜像仓库地址 | `registry.cn-hangzhou.aliyuncs.com` |
   | `ALIYUN_NAMESPACE` | 命名空间 | `your-namespace` |
   | `ALIYUN_REPOSITORY` | 仓库名（可选，默认使用仓库名） | `mynav` |
   | `ALIYUN_USERNAME` | 阿里云登录用户名 | `your_aliyun_username` |
   | `ALIYUN_PASSWORD` | 阿里云登录密码 | `your_password` |

4. **触发构建**：
   - **自动触发**：在 GitHub 仓库发布一个 Release（Create a new release），工作流会自动运行。
   - **手动触发**：进入 Actions -> Build and Push Docker Image -> Run workflow，输入标签后运行。

5. **使用构建好的镜像**：

   ```bash
   # 从阿里云拉取镜像（替换为你的仓库地址）
   docker pull registry.cn-hangzhou.aliyuncs.com/your-namespace/mynav:latest

   # 运行容器
   docker run -d \
     --name mynav \
     -p 3000:3000 \
     -v ./data/database:/app/data \
     -v ./data/uploads:/app/uploads \
     -e JWT_SECRET=your-super-secret-key \
     registry.cn-hangzhou.aliyuncs.com/your-namespace/mynav:latest
   ```

### 工作流特性

- **多架构支持**：同时构建 `linux/amd64` 和 `linux/arm64` 镜像
- **智能标签**：Release 自动打 `latest`、`v1.0.0`、`v1.0` 标签
- **构建缓存**：使用 GitHub Actions 缓存加速重复构建
- **手动触发**：支持 `workflow_dispatch` 手动运行并指定标签

## 常见问题

**Q: `better-sqlite3` 安装/编译失败？**
A: 确保已安装 Python 与 C++ 编译工具链（Windows 需 `npm i -g windows-build-tools` 或 Visual Studio Build Tools）。

**Q: 前端请求 404？**
A: 检查后端是否启动；确认 Vite 代理 `localhost:3000` 与后端端口一致。

**Q: 想清空数据重新开始？**
A: 删除根目录 `database.db`（开发环境）或 `data/database/database.db`（Docker 部署），重启后端会重新建表并 Seed。

**Q: Docker 构建失败，提示 better-sqlite3 编译错误？**
A: Dockerfile 中已包含 `python3 make g++` 等编译依赖。如果在 ARM 架构（如 Apple Silicon）上构建，确保使用支持的基础镜像。
