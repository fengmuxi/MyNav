# 更新日志 (CHANGELOG)

本文件记录 MyNav 项目的所有版本变更，遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 规范。

版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/) 规范：`v<major>.<minor>.<patch>`。

## 维护规则

### 日常开发（每次代码修改）

每次代码修改完成后，**必须**同步更新下方 `[Unreleased]` 区域：
1. 根据变更类型，在对应分类下追加一条记录
2. 分类：`新增` / `变更` / `修复` / `移除`
3. 记录格式：简洁明了的一句话描述，说明改了什么、为什么改

### 发布新版本

1. 收集**模块一**：`git log <上次tag>..HEAD --oneline` 获取提交记录
2. 收集**模块二**：读取下方 `[Unreleased]` 区域的变更明细
3. 将 `[Unreleased]` 标题改为 `[vX.Y.Z] - YYYY-MM-DD`
4. 在版本标题下方依次写入两个模块：`### Git 提交记录`（模块一）和 `### 新增/变更/修复/移除`（模块二）
5. 在其上方重新创建空的 `[Unreleased]` 区域
6. 修改 `server/src/version.ts` 中的 `VERSION` / `RELEASE_DATE` / `CHANGELOG_SUMMARY`
7. 提交并推送 Git tag，GitHub Actions 自动创建 Release（正文从此文件提取）

---

## [Unreleased]

### 新增

### 变更

### 修复

### 移除

---

## [v1.1.0] - 2026-07-15

### Git 提交记录
- 54550d6 实现 SRP 安全认证协议
- 07e58a4 更新agent.md内容
- 864d49c 修复部署后环境不是https无法使用rsa加密的问题
- 0ce12e8 添加日志系统
- e9d63e0 修复docker-compose
- 516c14f 修复docker镜像无法运行的bug
- 71386fa 修改docker-compose
- 040ee66 修复docker自动构建异常bug

### 新增
- 实现 SRP 安全认证协议，增强注册/登录安全性
- 添加服务端日志系统
- 补充 agent.md 日志系统、数据备份恢复、版本管理等章节
- agent.md 新增第 15 节 CHANGELOG.md 持续维护规范（[Unreleased] 机制）

### 变更
- 完善 agent.md 发版流程：双模块格式（Git 提交记录 + 变更明细）
- CHANGELOG.md 改为 Keep a Changelog 规范，新增 [Unreleased] 未发布区域
- 调整 docker-compose 配置

### 修复
- 修复部署后非 HTTPS 环境无法使用 RSA 加密的问题
- 修复 Docker 镜像无法运行的 bug
- 修复 Docker 自动构建异常 bug

---

## [v1.0.0] - 2026-07-14

### 新增
- 个人导航主页：分组、分类、卡片三级结构，支持公共/私有数据隔离
- 用户系统：注册、登录、忘记密码、个人资料、头像上传
- 安全机制：RSA 加密密码传输、bcrypt 哈希存储、登录失败锁定
- 主题系统：6 个内置预设 + 用户自定义主题
- 管理后台：用户管理、导航管理、系统设置、RSA 密钥管理
- 数据备份：用户级 AES-256-GCM 加密备份、服务器级全量备份与恢复
- 邮件通知：SMTP 配置，支持忘记密码邮件重置
- 部署方案：Docker 单镜像部署 + Docker Compose 一键启动
- CI/CD：GitHub Actions 自动构建多架构镜像并推送到阿里云 ACR

### 技术栈
- 前端：React 18 + TypeScript + Vite + TailwindCSS + Zustand + React Router DOM
- 后端：Express.js + TypeScript + ES Modules
- 数据库：SQLite3 (better-sqlite3) + Drizzle ORM
- 认证：JWT + bcrypt + RSA
