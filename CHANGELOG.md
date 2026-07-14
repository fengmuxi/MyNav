# 更新日志 (CHANGELOG)

本文件记录 MyNav 项目的所有版本变更。

版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/) 规范：`v<major>.<minor>.<patch>`。

每次发布新版本时，请同步执行以下三处更新：
1. 在本文件顶部追加新版本变更记录
2. 修改 `server/src/version.ts` 中的 `VERSION` / `RELEASE_DATE` / `CHANGELOG_SUMMARY`
3. 在 GitHub 仓库发布对应的 Release（tag 与 `VERSION` 保持一致）

---

## [v1.0.0] — 2026-07-14

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
