import { Bookmark, ExternalLink, GitFork, MessageSquare, Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { OpenSourceProject, TopicDetailResponse } from '../types/v2ex.ts';
import {
  formatCompactNumber,
  formatFullDateTime,
  formatRelativeTime,
  splitTextWithLinks,
} from '../utils/format.ts';
import { GitHubStarTrendChart } from './GitHubStarTrendChart.tsx';

interface TopicDetailDrawerProps {
  project: OpenSourceProject | null;
  isSaved: boolean;
  onToggleSave: (id: number) => void;
  onClose: () => void;
}

function SafeRichText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300 break-words">
      {lines.map((line, lineIdx) => {
        if (!line.trim()) {
          return <div key={lineIdx} className="h-1" />;
        }
        const segments = splitTextWithLinks(line);
        return (
          <p key={lineIdx}>
            {segments.map((seg, segIdx) =>
              seg.type === 'link' ? (
                <a
                  key={segIdx}
                  href={seg.value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                >
                  {seg.value}
                </a>
              ) : (
                <span key={segIdx}>{seg.value}</span>
              )
            )}
          </p>
        );
      })}
    </div>
  );
}

export function TopicDetailDrawer({
  project,
  isSaved,
  onToggleSave,
  onClose,
}: TopicDetailDrawerProps) {
  const [detail, setDetail] = useState<TopicDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/topics/${project.id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`加载失败 (${res.status})`);
        return (await res.json()) as TopicDetailResponse;
      })
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '无法加载主题详情');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [project?.id]);

  useEffect(() => {
    if (!project) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [project, onClose]);

  if (!project) return null;

  const activeProject = detail?.project || project;
  const replies = detail?.replies || [];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={activeProject.title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl overflow-hidden">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
              {activeProject.node.title}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums truncate">#{activeProject.id}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums whitespace-nowrap">
              {formatFullDateTime(activeProject.created)}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onToggleSave(activeProject.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                isSaved
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500 bg-blue-50/70 dark:bg-blue-950/40'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}`} />
              <span>{isSaved ? '已收藏' : '收藏'}</span>
            </button>
            <a
              href={activeProject.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors whitespace-nowrap"
            >
              <span>V2EX 原帖</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭详情面板"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Title & Author */}
          <div className="space-y-3">
            <h2 className="font-display text-xl font-bold leading-snug text-slate-900 dark:text-slate-100">
              {activeProject.title}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>作者 @{activeProject.member.username}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatRelativeTime(activeProject.created)}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{activeProject.replies} 条回复</span>
            </div>
          </div>

          {/* Enriched Repositories */}
          {activeProject.repos.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                关联代码仓库 ({activeProject.repos.length})
              </h3>
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/70 dark:bg-slate-950/50">
                {activeProject.repos.map((repo) => (
                  <div key={repo.url} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <a
                        href={repo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline break-all"
                      >
                        <span>{repo.fullName}</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 shrink-0 uppercase">
                        {repo.platform}
                      </span>
                    </div>

                    {repo.description && (
                      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {repo.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      {repo.language && (
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {repo.language}
                        </span>
                      )}
                      {repo.stars !== null && (
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          <Star className="w-3.5 h-3.5 text-amber-500" />
                          {formatCompactNumber(repo.stars)} stars
                        </span>
                      )}
                      {repo.forks !== null && (
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                          <GitFork className="w-3.5 h-3.5" />
                          {formatCompactNumber(repo.forks)} forks
                        </span>
                      )}
                      {repo.license && (
                        <span className="font-mono">{repo.license}</span>
                      )}
                    </div>

                    {repo.platform === 'github' && (
                      <GitHubStarTrendChart fullName={repo.fullName} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Post Body */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-5">
            <SafeRichText text={activeProject.content} />
          </div>

          {/* Community Replies */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                <span>社区讨论</span>
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                {loading ? '同步中...' : `显示 ${replies.length} 条`}
              </span>
            </div>

            {error && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
            )}

            {loading && replies.length === 0 ? (
              <div className="space-y-3">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="h-16 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse"
                  />
                ))}
              </div>
            ) : replies.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                暂无社区回复，点击右上角「V2EX 原帖」参与讨论。
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
                {replies.map((reply, idx) => (
                  <div key={reply.id} className="p-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        @{reply.member.username}
                      </span>
                      <span className="font-mono tabular-nums">
                        #{idx + 1} · {formatRelativeTime(reply.created)}
                      </span>
                    </div>
                    <SafeRichText text={reply.content} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
