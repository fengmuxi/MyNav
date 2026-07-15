# ============================================================
#  MyNav 单镜像部署 Dockerfile
#  多阶段构建：前端构建 + 后端构建 + 生产运行
#  后端通过 PUBLIC_DIR 环境变量托管前端静态资源
# ============================================================

# ---------- 阶段 1：前端构建
FROM node:20-alpine AS client-builder

WORKDIR /app/client

# 配置国内 npm 镜像源加速
RUN npm config set registry https://registry.npmmirror.com

COPY client/package*.json ./
RUN npm ci

COPY client/index.html ./
COPY client/postcss.config.js ./
COPY client/tailwind.config.js ./
COPY client/tsconfig.json ./
COPY client/tsconfig.node.json ./
COPY client/vite.config.ts ./
COPY client/src ./src
COPY client/public ./public

RUN npm run build

# ---------- 阶段 2：后端构建
FROM node:20-alpine AS server-builder

WORKDIR /app/server

# 配置国内 npm 镜像源 + 安装构建工具
# - npm_config_registry: npm 包镜像
# - npm_config_disturl: node-gyp 下载 Node headers 的镜像（编译原生模块必需）
ENV npm_config_registry=https://registry.npmmirror.com
ENV npm_config_disturl=https://npmmirror.com/mirrors/node
RUN apk add --no-cache python3 make g++ linux-headers

COPY server/package.json ./
RUN rm -f package-lock.json && npm install

COPY server/tsconfig.json ./
COPY server/src ./src
COPY server/drizzle.config.ts ./

RUN npm run build

# ---------- 阶段 3：生产镜像
FROM node:20-alpine AS production

WORKDIR /app

# 安装运行时所需的构建工具（better-sqlite3 是原生 C++ 模块，需要从源码编译）
# - python3：node-gyp 需要
# - make g++ linux-headers：编译 C++ 原生模块
# - libc6-compat：alpine 兼容 glibc 库的预编译 binary
# - dumb-init：正确处理 PID 1 信号转发（容器场景下必需）
ENV npm_config_registry=https://registry.npmmirror.com
ENV npm_config_disturl=https://npmmirror.com/mirrors/node
RUN apk add --no-cache python3 make g++ linux-headers libc6-compat dumb-init

# 安装后端生产依赖（bcryptjs 是纯 JS，仅 better-sqlite3 需要编译）
COPY server/package.json ./
RUN rm -f package-lock.json && npm install --omit=dev

# 复制后端编译产物
COPY --from=server-builder /app/server/dist ./dist

# 复制前端构建产物
COPY --from=client-builder /app/client/dist ./public

# 环境变量默认值
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/database.db
ENV UPLOADS_PATH=/app/uploads
ENV PUBLIC_DIR=/app/public
ENV LOGS_PATH=/app/logs

# 创建数据目录
RUN mkdir -p /app/data /app/uploads /app/logs

# 暴露端口
EXPOSE 3000

# 健康检查：使用 wget 避免 Node 启动开销
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/health || exit 1

# 启动命令：使用 dumb-init 正确处理 PID 1 信号（Ctrl+C、SIGTERM 等）
CMD ["dumb-init", "node", "dist/index.js"]
