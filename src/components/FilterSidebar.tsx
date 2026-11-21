import type { RepoPlatform } from '../types/v2ex.ts';

export type SortOrder = 'newest' | 'replies' | 'stars';

interface NodeCount {
  name: string;
  title: string;
  count: number;
}

interface FilterSidebarProps {
  selectedNode: string;
  onSelectNode: (node: string) => void;
  nodeCounts: NodeCount[];
  onlyWithRepo: boolean;
  onToggleOnlyWithRepo: (val: boolean) => void;
  selectedPlatform: 'all' | RepoPlatform;
  onSelectPlatform: (platform: 'all' | RepoPlatform) => void;
  selectedLanguage: string;
  onSelectLanguage: (lang: string) => void;
  availableLanguages: string[];
  sortOrder: SortOrder;
  onChangeSortOrder: (sort: SortOrder) => void;
  onResetFilters: () => void;
  hasActiveFilters: boolean;
}

export function FilterSidebar({
  selectedNode,
  onSelectNode,
  nodeCounts,
  onlyWithRepo,
  onToggleOnlyWithRepo,
  selectedPlatform,
  onSelectPlatform,
  selectedLanguage,
  onSelectLanguage,
  availableLanguages,
  sortOrder,
  onChangeSortOrder,
  onResetFilters,
  hasActiveFilters,
}: FilterSidebarProps) {
  const platforms: Array<{ id: 'all' | RepoPlatform; label: string }> = [
    { id: 'all', label: '全部平台' },
    { id: 'github', label: 'GitHub' },
    { id: 'gitee', label: 'Gitee' },
    { id: 'gitlab', label: 'GitLab' },
    { id: 'codeberg', label: 'Codeberg' },
  ];

  const sortOptions: Array<{ id: SortOrder; label: string }> = [
    { id: 'newest', label: '最新发布' },
    { id: 'replies', label: '讨论最多' },
    { id: 'stars', label: 'GitHub Star 最多' },
  ];

  return (
    <aside className="w-full lg:w-[256px] shrink-0 space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100 tracking-wide">
            筛选与排序
          </h2>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer whitespace-nowrap shrink-0"
            >
              重置
            </button>
          )}
        </div>

        {/* Sort Order */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">排序方式</p>
          <div className="flex flex-col gap-1">
            {sortOptions.map((opt) => {
              const active = sortOrder === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeSortOrder(opt.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800" />

        {/* Repo Switch */}
        <div className="space-y-2.5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">项目完整度</p>
          <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              仅看附带代码仓库
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={onlyWithRepo}
              onClick={() => onToggleOnlyWithRepo(!onlyWithRepo)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                onlyWithRepo ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  onlyWithRepo ? 'translate-x-4.5' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800" />

        {/* Node Filter */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">V2EX 节点</p>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => onSelectNode('all')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                selectedNode === 'all'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className="truncate">全部节点</span>
              <span className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-slate-500">
                {nodeCounts.reduce((acc, n) => acc + n.count, 0)}
              </span>
            </button>
            {nodeCounts.map((node) => {
              const active = selectedNode === node.name;
              return (
                <button
                  key={node.name}
                  type="button"
                  onClick={() => onSelectNode(node.name)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                    active
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="truncate">{node.title}</span>
                  <span className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-slate-500">
                    {node.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800" />

        {/* Platform Filter */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">代码托管平台</p>
          <div className="flex flex-wrap gap-1.5">
            {platforms.map((p) => {
              const active = selectedPlatform === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectPlatform(p.id)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-slate-900 dark:bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Language Filter */}
        {availableLanguages.length > 0 && (
          <>
            <div className="border-t border-slate-100 dark:border-slate-800" />
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">主要语言</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onSelectLanguage('all')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    selectedLanguage === 'all'
                      ? 'bg-slate-900 dark:bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  全部
                </button>
                {availableLanguages.map((lang) => {
                  const active = selectedLanguage === lang;
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => onSelectLanguage(lang)}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-slate-900 dark:bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {lang}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
