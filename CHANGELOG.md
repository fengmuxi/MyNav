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

## [v1.3.0] - 2026-07-15

### Git 提交记录
- cbe2fc3 feat: 卡片支持修改分组分类、图标上传与链接自动获取标题

### 新增
- 首页和我的导航页面的卡片编辑 Modal 新增分组选择器和分类选择器（联动），支持修改卡片所属分组和分类
- 我的导航页面创建卡片表单新增图标文件上传功能（与首页一致，通过 FileReader → base64 → POST /user/nav/icon 上传）
- 我的导航页面创建卡片表单新增链接失焦自动获取网页标题功能（GET /util/meta）
- 我的导航页面编辑 Modal 新增图标文件上传和链接失焦自动获取标题功能
- 我的导航页面新建卡片 Modal 新增内联快速创建分组和快速创建分类功能（输入名称 + 按钮），与首页保持一致
- 新增 isLightColor 工具函数，根据卡片背景色亮度自动选择文字颜色（浅色背景用深色文字，深色背景用白色文字）

### 变更
- 后端 PUT /api/user/nav/item/:id 接口新增 groupId 字段支持，允许更新卡片所属分组
- 后端 PUT 接口增加分组变更联动逻辑：更换分组时自动清空原分类（防止跨分组引用无效分类），更换分组+分类时校验分类属于新分组
- 首页和我的导航页面的 onUpdateItem 请求体新增 groupId 和 categoryId 字段
- 我的导航页面创建卡片表单的图标输入从文本框（emoji/文字）改为文件上传组件，与首页保持一致
- 首页和我的导航页面创建卡片的默认颜色从 #ffffff 改为 #4F6EF7

### 修复
- 修复我的导航页面卡片信息显示空白的问题：默认颜色为 #ffffff 导致白底白字不可见，改为 #4F6EF7 并增加对比度感知文字颜色逻辑
- 修复首页和我的导航页面卡片编辑 Modal 无法修改分组和分类的问题

### 移除

---

## [v1.2.0] - 2026-07-15

### Git 提交记录
- a807810 feat: 实现邮箱验证码登录与邮件系统全流程
- 35f3dff feat(db): 实现数据库版本化迁移系统并重构初始化逻辑
- 8d8b2c9 发布v1.1.0版本

### 新增
- 新增 HTML 邮件模板系统（server/src/mailTemplates.ts），对齐项目 Clean & Minimal 设计风格，使用 table 布局兼容主流邮件客户端，内联 Logo + 品牌色顶栏 + 卡片内容 + 底部版权
- 新增登录验证码专属邮件模板，与注册验证码邮件文案区分（登录 vs 注册场景）
- 新增 SMTP 测试邮件专属模板，包含站点名称、发送时间、邮件类型标签等诊断信息
- 新增通用异常路由页面组件（client/src/pages/ErrorPage.tsx），覆盖 404/403/500/502/503 五种常见 HTTP 异常状态
- 每个错误码配备独立 SVG 插画与主题色（罗盘/锁/齿轮/云/扳手），支持深色主题自动适配
- 注册独立异常路由（/403 /500 /502 /503 /404），未匹配路径统一兜底为 404 页面
- 新增数据库版本化迁移系统（migrations.ts），维护 schema_migrations 表追踪数据库版本号，启动时自动检查并执行未应用的迁移，确保旧版数据库兼容升级
- CREATE TABLE 语句补全 users 表全部字段（display_name/email/bio/avatar/status/failed_login_attempts/locked_until），新库直接创建最新完整结构
- agent.md 新增 4.1 数据库迁移与版本管理规范，约束后续数据库结构修改必须追加版本化迁移
- 新增注册邮箱验证功能：填写邮箱时发送 6 位验证码验证邮箱真实性，5 分钟有效，60 秒发送冷却，SMTP 未配置时开发模式直接返回验证码
- 新增邮箱验证码登录功能：用户可通过已绑定邮箱接收验证码进行无密码登录，支持失败锁定保护，登录页 Tab 切换密码/邮箱登录模式
- 新增后台 SMTP 配置测试邮件功能：系统设置页面添加测试邮件输入框和发送按钮，可在保存配置前验证 SMTP 配置有效性

### 变更
- 重构 mailer.ts：抽取公共方法（createTransporter / isSmtpReady / buildFrom），消除重复代码，4 种邮件函数各自调用对应模板
- 登录验证码路由从复用 sendVerificationCodeEmail 改为调用专属 sendLoginCodeEmail，邮件标题与文案与注册场景区分
- 测试邮件路由从复用 sendPasswordResetEmail 改为调用专属 sendTestEmail，不再发送模拟重置链接，改为发送真实测试诊断邮件
- mailer 邮件函数返回类型扩展为 SendMailResultWithReason，新增 reason 字段区分失败原因（smtp_disabled / no_nodemailer / send_failed），便于上层精准提示
- isSmtpReady 检查补全 pass 字段，避免仅启用 SMTP 但缺少密码时仍进入发送流程
- sendTestEmail 增加 SMTP 配置完整性前置校验，未配置时直接返回 smtp_disabled 错误，不再返回 devLink 兜底（测试邮件需走真实链路）
- 集成 logger 模块记录邮件发送全流程日志（info/warn/error 三级），便于运维排查
- 优化 AdminRoute 路由守卫：已登录但无管理员权限时从跳转登录页改为展示 403 异常页面，提升用户体验
- 兜底路由从强制跳转首页改为渲染 404 异常页面，使未匹配路径具备明确错误提示
- 重构 index.ts 数据库初始化逻辑：移除 ad-hoc 增量迁移代码，改用 runMigrations() 版本化迁移引擎统一管理
- 统一所有邮箱写入路径的归一化处理（toLowerCase + trim），消除大小写差异导致的重复绑定漏洞
- 完善 passwordResetTemplate 密码重置邮件模板：新增钥匙圆形图标、用户名问候语、请求/过期时间信息表、3 步操作指引列表、黄色安全警告提示框，同时 sendPasswordResetEmail 与 auth 路由传递 username 参数到模板

### 修复
- 修复管理员后台创建用户未计算 SRP verifier 导致 HTTP 环境下无法登录的问题
- 修复管理员重置用户密码未同步更新 SRP verifier 导致改密后 SRP 登录失效的问题
- 修复用户自助修改密码未同步更新 SRP verifier 的问题
- 修复管理员备份导入恢复用户数据时遗漏 srpSalt/srpVerifier 字段的问题
- 修复管理员创建用户、更新用户、用户自助更新资料、用户备份恢复四处邮箱写入缺少唯一性检查导致重复绑定的问题
- 修复 SMTP 发送时因发件人邮箱与认证用户不一致导致的 553 错误：buildFrom 增加三级回退策略（一致 > 同域 > 回退 user），自动避免 553 错误
- 修复 SMTP 错误信息不友好问题：新增 translateSmtpError 函数，将 535/550/553/554/421 等常见错误码转换为中文排查提示，前端展示给管理员
- 修复测试邮件失败时无法跳转日志排查问题：检测到 553 错误时弹出排查步骤提示框，确认后自动打开后端日志页面

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
- 精简 agent.md：合并相近章节、压缩冗长描述，从 735 行精简至 207 行，保留全部强制约束（CHANGELOG 维护与发版流程）
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
