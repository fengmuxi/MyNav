# ============================================================
#  MyNav 单镜像部署 Dockerfile
#  多阶段构建：前端构建 + 后端构建 + 生产运行
#  后端通过 PUBLIC_DIR 环境变量托管前端静态资源
# ============================================================

# ---------- 阶段 1：前端构建
FROM node:20-alpine AS client-builder

WORKDIR /app/client

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

RUN apk add --no-cache python3 make g++

COPY server/package*.json ./
RUN npm ci

COPY server/tsconfig.json ./
COPY server/src ./src
COPY server/drizzle.config.ts ./

RUN npm run build

# ---------- 阶段 3：生产镜像
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache python3 make g++

# 安装后端生产依赖
COPY server/package*.json ./
RUN npm ci --omit=dev

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

# 创建数据目录
RUN mkdir -p /app/data /app/uploads

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

# 启动命令
CMD ["node", "dist/index.js"]
