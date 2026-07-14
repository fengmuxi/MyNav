/**
 * 系统版本信息（单一来源 Single Source of Truth）
 * ------------------------------------------------------------------
 * - 每次发布新版本时，必须同步更新此文件的 VERSION / RELEASE_DATE / CHANGELOG
 * - 同时在项目根目录 CHANGELOG.md 中追加对应版本的详细变更记录
 * - 前端通过 GET /api/settings/version 读取此处的版本信息
 * - GitHub 版本对比接口 GET /api/settings/version/check 会将此处的 VERSION
 *   与 GitHub Releases 最新 tag_name 进行 semver 比较
 *
 * 版本号规则（语义化版本 Semantic Versioning）：
 *   v<major>.<minor>.<patch>   例如 v1.0.0
 *   - major: 不兼容的 API 变更
 *   - minor: 向下兼容的功能新增
 *   - patch: 向下兼容的缺陷修复
 */

/** 当前本地版本号（保持与 GitHub Release tag 一致，含 v 前缀） */
export const VERSION = 'v1.0.0';

/** 当前版本发布日期（ISO 字符串，仅日期部分） */
export const RELEASE_DATE = '2026-07-14';

/** 当前版本变更摘要（一句话简述，详细记录见 CHANGELOG.md） */
export const CHANGELOG_SUMMARY = '初始版本：导航管理、用户系统、主题切换、Docker 部署、数据备份';

/** 版本信息对象（用于 API 响应） */
export interface VersionInfo {
  version: string;
  releaseDate: string;
  changelogSummary: string;
}

/** 获取当前版本信息 */
export function getVersionInfo(): VersionInfo {
  return {
    version: VERSION,
    releaseDate: RELEASE_DATE,
    changelogSummary: CHANGELOG_SUMMARY,
  };
}
