import { Bookmark, ExternalLink, GitFork, MessageSquare, Star } from 'lucide-react';
import { useState } from 'react';
import type { OpenSourceProject } from '../types/v2ex.ts';
import { formatCompactNumber, formatRelativeTime } from '../utils/format.ts';

interface ProjectRowProps {
  project: OpenSourceProject;
  isSelected: boolean;
  isSaved: boolean;
  onSelect: (project: OpenSourceProject) => void;
  onToggleSave: (projectId: number) => void;
}

export function ProjectRow({
  project,
  isSelected,
  isSaved,
  onSelect,
  onToggleSave,
}: ProjectRowProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const repo = project.primaryRepo;

  return (
    <article
      className={`group relative px-5 py-4 transition-colors border-b border-slate-100 dark:border-slate-800/80 last:border-b-0 ${
        isSelected
          ? 'bg-blue-50/60 dark:bg-blue-950/30'
          : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/40'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Author Avatar with resilient fallback */}
        <div className="hidden sm:flex shrink-0 mt-0.5">
          {project.member.avatar && !avatarFailed ? (
            <img
              src={project.member.avatar}
              alt={`${project.member.username} avatar`}
              referrerPolicy="no-referrer"
              onError={() => setAvatarFailed(true)}
              className="w-9 h-9 rounded-lg object-cover bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700"
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-600 dark:text-slate-300">
              {project.member.username.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {/* Unboxed metadata line (Zero-Pill discipline) */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {project.node.title}
            </span>
            <span aria-hidden="true">·</span>
            <span>@{project.member.username}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{formatRelativeTime(project.created)}</span>
            {project.isHot && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-amber-700 dark:text-amber-400">热门讨论</span>
              </>
            )}
          </div>

          {/* Title */}
          <h3 className="text-[15px] leading-snug font-semibold text-slate-900 dark:text-slate-100">
            <button
              type="button"
              onClick={() => onSelect(project)}
              className="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer focus-visible:outline-none focus-visible:underline"
            >
              {project.title}
            </button>
          </h3>

          {/* Excerpt */}
          {project.excerpt && project.excerpt !== project.title && (
            <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-400 line-clamp-2">
              {repo?.description && project.excerpt.length < 40
                ? `${repo.description} — ${project.excerpt}`
                : project.excerpt}
            </p>
          )}

          {/* Inline Repository Metadata & Actions */}
          <div className="pt-1 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {repo ? (
                <>
                  <a
                    href={repo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <span>{repo.fullName}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                  {project.repos.length > 1 && (
                    <span className="text-slate-400 dark:text-slate-500 tabular-nums">
                      +{project.repos.length - 1} 个仓库
                    </span>
                  )}
                  {repo.language && (
                    <>
                      <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                        /
                      </span>
                      <span className="text-slate-600 dark:text-slate-300 font-medium">
                        {repo.language}
                      </span>
                    </>
                  )}
                  {repo.license && (
                    <>
                      <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                        /
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                        {repo.license}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <span className="text-slate-400 dark:text-slate-500">
                  开源讨论帖 · 点击查看正文链接
                </span>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 shrink-0">
              {repo && repo.stars !== null && (
                <span
                  className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-700 dark:text-slate-300"
                  title="GitHub Stars"
                >
                  <Star className="w-3.5 h-3.5 text-amber-500" />
                  {formatCompactNumber(repo.stars)}
                </span>
              )}
              {repo && repo.forks !== null && repo.forks > 0 && (
                <span
                  className="hidden sm:inline-flex items-center gap-1 font-mono tabular-nums"
                  title="GitHub Forks"
                >
                  <GitFork className="w-3.5 h-3.5" />
                  {formatCompactNumber(repo.forks)}
                </span>
              )}
              <button
                type="button"
                onClick={() => onSelect(project)}
                className="inline-flex items-center gap-1 font-mono tabular-nums hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
                title="查看评论与详情"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {project.replies}
              </button>
              <button
                type="button"
                onClick={() => onToggleSave(project.id)}
                aria-label={isSaved ? '取消收藏' : '收藏项目'}
                className={`p-1 rounded transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  isSaved
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
