/**
 * 管理后台 - 系统日志
 * ------------------------------------------------------------------
 * 三区域布局：
 * 1. 顶部：日志配置（单文件大小 MB、保留天数）+ 清理按钮
 * 2. 中部：日志查看器（支持实时流模式 + 文件查看模式）
 * 3. 底部：日志文件列表（点击切换到文件查看模式）
 *
 * 实时流：使用 fetch + ReadableStream 实现 SSE（支持 Authorization 头）
 * 文件查看：GET /api/admin/logs/files/:filename 读取文件内容
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { AdminLayout } from '../../components/ui/AdminLayout';
import { Button } from '../../components/ui/Button';
import { toast } from '../../store/toastStore';
import { useAuthStore } from '../../store/authStore';
import api from '../../api/axios';

/** 日志条目 */
type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  meta?: Record<string, unknown>;
}

/** 日志配置 */
interface LogConfig {
  maxFileSize: number; // 字节
  retentionDays: number;
  maxFileSizeMB?: number; // PUT 返回时附带
}

/** 日志文件信息 */
interface LogFileInfo {
  filename: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
}

/** 级别颜色映射 */
const LEVEL_COLORS: Record<string, { text: string; bg: string }> = {
  info: { text: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
  warn: { text: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  error: { text: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
  debug: { text: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
};

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 格式化时间 */
function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false });
  } catch {
    return ts;
  }
}

/** 格式化日期时间 */
function formatDateTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return ts;
  }
}

export default function Logs() {
  // 配置相关
  const [config, setConfig] = useState<LogConfig>({ maxFileSize: 5 * 1024 * 1024, retentionDays: 30 });
  const [maxSizeMB, setMaxSizeMB] = useState('5');
  const [retentionDays, setRetentionDays] = useState('30');
  const [saving, setSaving] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);

  // 日志查看相关
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [mode, setMode] = useState<'live' | 'file'>('live');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [files, setFiles] = useState<LogFileInfo[]>([]);
  const [loadingFile, setLoadingFile] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  // 日志级别筛选：选中的级别集合，默认全部显示
  const [levelFilter, setLevelFilter] = useState<Set<LogLevel>>(new Set(['info', 'warn', 'error', 'debug']));

  const logContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { token } = useAuthStore();

  /** 滚动到底部 */
  const scrollToBottom = useCallback(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [autoScroll]);

  /** 切换级别筛选 */
  const toggleLevel = useCallback((level: LogLevel) => {
    setLevelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      // 如果全部取消选中，恢复全部（避免空白）
      if (next.size === 0) {
        next.add('info');
        next.add('warn');
        next.add('error');
        next.add('debug');
      }
      return next;
    });
  }, []);

  /** 一键全选 / 全不选 */
  const toggleAllLevels = useCallback(() => {
    setLevelFilter((prev) => {
      if (prev.size === 4) return new Set();
      return new Set(['info', 'warn', 'error', 'debug']);
    });
  }, []);

  /** 按级别过滤后的日志 */
  const filteredLogs = logs.filter((entry) => levelFilter.has(entry.level));

  /** 添加日志条目（限制最多 1000 条防止内存溢出） */
  const appendLogs = useCallback((entries: LogEntry[]) => {
    setLogs((prev) => {
      const combined = [...prev, ...entries];
      return combined.length > 1000 ? combined.slice(-1000) : combined;
    });
  }, []);

  /** 加载日志配置 */
  const fetchConfig = useCallback(async () => {
    try {
      const { data } = await api.get<LogConfig>('/admin/logs/config');
      setConfig(data);
      setMaxSizeMB(String(Math.round(data.maxFileSize / (1024 * 1024))));
      setRetentionDays(String(data.retentionDays));
    } catch {
      // 使用默认值
    }
  }, []);

  /** 加载日志文件列表 */
  const fetchFiles = useCallback(async () => {
    try {
      const { data } = await api.get<{ files: LogFileInfo[] }>('/admin/logs/files');
      setFiles(data.files || []);
    } catch {
      // 忽略
    }
  }, []);

  /** 启动实时日志流（使用 fetch + ReadableStream） */
  const startLiveStream = useCallback(() => {
    // 停止之前的连接
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    fetch('/api/admin/logs/stream', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('SSE 连接失败');
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || ''; // 保留最后不完整的部分

          for (const line of lines) {
            if (line.startsWith(': ')) continue; // 心跳注释
            if (line.startsWith('data: ')) {
              try {
                const entry: LogEntry = JSON.parse(line.slice(6));
                appendLogs([entry]);
              } catch {
                // 忽略解析失败
              }
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('[Logs] SSE 连接错误:', err);
        }
      });
  }, [token, appendLogs]);

  /** 停止实时日志流 */
  const stopLiveStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  /** 切换到实时模式 */
  const switchToLive = useCallback(() => {
    stopLiveStream();
    setMode('live');
    setSelectedFile(null);
    setLogs([]);
    // 延迟启动，等 state 更新
    setTimeout(() => startLiveStream(), 100);
  }, [stopLiveStream, startLiveStream]);

  /** 切换到文件查看模式 */
  const viewFile = useCallback(async (filename: string) => {
    stopLiveStream();
    setMode('file');
    setSelectedFile(filename);
    setLoadingFile(true);
    setLogs([]);

    try {
      const { data } = await api.get<{ content: string }>(`/admin/logs/files/${filename}`, {
        params: { lines: 500 },
      });
      // 解析每行 JSON
      const entries: LogEntry[] = [];
      for (const line of data.content.split('\n').filter(Boolean)) {
        try {
          entries.push(JSON.parse(line));
        } catch {
          // 跳过无法解析的行
        }
      }
      setLogs(entries);
    } catch {
      toast.error('加载日志文件失败');
    } finally {
      setLoadingFile(false);
    }
  }, [stopLiveStream]);

  /** 保存配置 */
  const saveConfig = async () => {
    const sizeMB = Number(maxSizeMB);
    const days = Number(retentionDays);
    if (isNaN(sizeMB) || sizeMB < 1 || sizeMB > 100) {
      toast.error('文件大小需在 1-100 MB 之间');
      return;
    }
    if (isNaN(days) || days < 1 || days > 365) {
      toast.error('保留天数需在 1-365 天之间');
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.put<LogConfig>('/admin/logs/config', {
        maxFileSize: sizeMB,
        retentionDays: days,
      });
      setConfig(data);
      toast.success('日志配置已保存');
    } catch {
      toast.error('保存配置失败');
    } finally {
      setSaving(false);
    }
  };

  /** 手动清理过期日志 */
  const cleanupLogs = async () => {
    setCleaningUp(true);
    try {
      const { data } = await api.post<{ deleted: number }>('/admin/logs/cleanup');
      toast.success(`已清理 ${data.deleted} 个过期日志文件`);
      fetchFiles();
    } catch {
      toast.error('清理失败');
    } finally {
      setCleaningUp(false);
    }
  };

  // 初始化加载
  useEffect(() => {
    fetchConfig();
    fetchFiles();
    startLiveStream();

    return () => {
      stopLiveStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 日志更新时滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [filteredLogs, scrollToBottom]);

  return (
    <AdminLayout pageName="系统日志">
      {/* ====== 顶部：日志配置 ====== */}
      <div
        className="rounded-lg border p-4 sm:p-5"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
      >
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          日志配置
        </h3>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              单文件大小 (MB)
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={maxSizeMB}
              onChange={(e) => setMaxSizeMB(e.target.value)}
              className="w-32 h-9 px-3 text-sm border rounded-md outline-none transition-all"
              style={{
                borderColor: 'var(--border-default)',
                background: 'var(--bg-page)',
                color: 'var(--text-primary)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-primary)';
                e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-50)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              保留天数
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              className="w-32 h-9 px-3 text-sm border rounded-md outline-none transition-all"
              style={{
                borderColor: 'var(--border-default)',
                background: 'var(--bg-page)',
                color: 'var(--text-primary)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-primary)';
                e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-primary-50)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>
          <Button size="sm" onClick={saveConfig} disabled={saving}>
            {saving ? '保存中...' : '保存配置'}
          </Button>
          <Button size="sm" variant="outline" onClick={cleanupLogs} disabled={cleaningUp}>
            {cleaningUp ? '清理中...' : '清理过期日志'}
          </Button>
          <div className="ml-auto text-xs" style={{ color: 'var(--text-tertiary)' }}>
            当前配置：{Math.round(config.maxFileSize / (1024 * 1024))} MB / 文件，保留 {config.retentionDays} 天
          </div>
        </div>
      </div>

      {/* ====== 中部：日志查看器 ====== */}
      <div
        className="rounded-lg border flex flex-col"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', minHeight: '400px' }}
      >
        {/* 日志查看器标题栏 */}
        <div
          className="flex items-center justify-between px-4 py-2 border-b"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <div className="flex items-center gap-3">
            {mode === 'live' ? (
              <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                实时日志
              </span>
            ) : (
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {selectedFile}
              </span>
            )}
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {filteredLogs.length}/{logs.length} 条
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* 级别筛选按钮 */}
            <div className="flex items-center gap-1 mr-1">
              <span className="text-xs mr-0.5" style={{ color: 'var(--text-tertiary)' }}>级别</span>
              {(['error', 'warn', 'info', 'debug'] as LogLevel[]).map((lv) => {
                const active = levelFilter.has(lv);
                const colors = LEVEL_COLORS[lv];
                return (
                  <button
                    key={lv}
                    onClick={() => toggleLevel(lv)}
                    className="px-2 h-6 rounded text-xs font-semibold uppercase transition-all"
                    style={{
                      color: active ? '#fff' : 'var(--text-tertiary)',
                      background: active ? colors.text : 'var(--bg-page)',
                      border: `1px solid ${active ? colors.text : 'var(--border-default)'}`,
                      opacity: active ? 1 : 0.5,
                    }}
                  >
                    {lv}
                  </button>
                );
              })}
              <button
                onClick={toggleAllLevels}
                className="px-2 h-6 rounded text-xs font-medium transition-all"
                style={{
                  color: levelFilter.size === 4 ? 'var(--color-primary)' : 'var(--text-tertiary)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-page)',
                }}
              >
                {levelFilter.size === 4 ? '全选' : '全不选'}
              </button>
            </div>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-tertiary)' }}>
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              自动滚动
            </label>
            {mode === 'file' && (
              <Button size="sm" variant="outline" onClick={switchToLive}>
                返回实时
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLogs([])}
            >
              清空显示
            </Button>
          </div>
        </div>

        {/* 日志内容区 */}
        <div
          ref={logContainerRef}
          className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5"
          style={{ background: 'var(--bg-page)', maxHeight: '500px' }}
        >
          {loadingFile && (
            <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
              加载中...
            </div>
          )}
          {!loadingFile && filteredLogs.length === 0 && (
            <div className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>
              {logs.length > 0 ? '当前级别筛选下无匹配日志' : mode === 'live' ? '等待日志...' : '无日志内容'}
            </div>
          )}
          {filteredLogs.map((entry, i) => {
            const colors = LEVEL_COLORS[entry.level] || LEVEL_COLORS.info;
            return (
              <div
                key={i}
                className="flex items-start gap-2 px-2 py-1 rounded"
                style={{ background: colors.bg }}
              >
                <span className="flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                  {formatTime(entry.ts)}
                </span>
                <span
                  className="flex-shrink-0 font-semibold uppercase"
                  style={{ color: colors.text, minWidth: '40px' }}
                >
                  {entry.level}
                </span>
                <span className="flex-1 break-all" style={{ color: 'var(--text-primary)' }}>
                  {entry.msg}
                </span>
                {entry.meta && Object.keys(entry.meta).length > 0 && (
                  <span
                    className="flex-shrink-0 text-xs"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {JSON.stringify(entry.meta)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ====== 底部：日志文件列表 ====== */}
      <div
        className="rounded-lg border p-4"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            日志文件
          </h3>
          <Button size="sm" variant="ghost" onClick={fetchFiles}>
            刷新列表
          </Button>
        </div>
        {files.length === 0 ? (
          <div className="text-center py-6 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            暂无日志文件
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {files.map((file) => {
              const active = selectedFile === file.filename && mode === 'file';
              return (
                <button
                  key={file.filename}
                  onClick={() => viewFile(file.filename)}
                  className="text-left p-3 rounded-md border transition-all hover:shadow-sm"
                  style={{
                    borderColor: active ? 'var(--color-primary)' : 'var(--border-default)',
                    background: active ? 'var(--color-primary-50)' : 'var(--bg-page)',
                  }}
                >
                  <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {file.filename}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    <span>{formatSize(file.size)}</span>
                    <span>·</span>
                    <span>{formatDateTime(file.modifiedAt)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
