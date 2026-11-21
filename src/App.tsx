import { Moon, Search, SlidersHorizontal, Sun, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FilterSidebar, type SortOrder } from './components/FilterSidebar.tsx';
import { ProjectRow } from './components/ProjectRow.tsx';
import { TopBar, type NavSection } from './components/TopBar.tsx';
import { TopicDetailDrawer } from './components/TopicDetailDrawer.tsx';
import type { OpenSourceProject, ProjectsResponse, RepoPlatform } from './types/v2ex.ts';
import { formatExactTime } from './utils/format.ts';

const SAVED_STORAGE_KEY = 'v2ex_os_radar_saved_ids';
const THEME_STORAGE_KEY = 'v2ex_os_radar_theme';

export default function App() {
  const [data, setData] = useState<ProjectsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<NavSection>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState('all');
  const [onlyWithRepo, setOnlyWithRepo] = useState(true);
  const [selectedPlatform, setSelectedPlatform] = useState<'all' | RepoPlatform>('all');
  const [selectedLanguage, setSelectedLanguage] = useState('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [selectedProject, setSelectedProject] = useState<OpenSourceProject | null>(null);

  const [savedIds, setSavedIds] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : [];
    } catch {
      return [];
    }
  });

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [isDark]);

  const fetchProjects = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects${forceRefresh ? '?refresh=1' : ''}`);
      if (!res.ok) {
        throw new Error(`服务端请求失败 (${res.status})`);
      }
      const json = (await res.json()) as ProjectsResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法连接 V2EX 数据源');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects(false);
  }, [fetchProjects]);

  const toggleSave = useCallback((projectId: number) => {
    setSavedIds((prev) => {
      const exists = prev.includes(projectId);
      const next = exists ? prev.filter((id) => id !== projectId) : [...prev, projectId];
      try {
        localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);
  const allProjects = data?.projects || [];

  const nodeCounts = useMemo(() => {
    const map = new Map<string, { name: string; title: string; count: number }>();
    for (const p of allProjects) {
      const existing = map.get(p.node.name);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(p.node.name, { name: p.node.name, title: p.node.title, count: 1 });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [allProjects]);

  const availableLanguages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of allProjects) {
      for (const r of p.repos) {
        if (r.language) {
          counts.set(r.language, (counts.get(r.language) || 0) + 1);
        }
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([lang]) => lang)
      .slice(0, 10);
  }, [allProjects]);

  const handleSelectSection = useCallback((section: NavSection) => {
    setActiveSection(section);
    if (section === 'create') {
      setSelectedNode('create');
    } else if (section === 'all') {
      setSelectedNode('all');
    }
  }, []);

  const resetFilters = useCallback(() => {
    setActiveSection('all');
    setSearchQuery('');
    setSelectedNode('all');
    setOnlyWithRepo(false);
    setSelectedPlatform('all');
    setSelectedLanguage('all');
    setSortOrder('newest');
  }, []);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const list = allProjects.filter((p) => {
      if (activeSection === 'saved' && !savedSet.has(p.id)) return false;
      if (activeSection === 'hot' && !p.isHot && p.replies < 5) return false;
      if (activeSection === 'create' && p.node.name !== 'create') return false;

      if (selectedNode !== 'all' && p.node.name !== selectedNode) return false;
      if (onlyWithRepo && p.repos.length === 0) return false;

      if (selectedPlatform !== 'all') {
        const matchesPlatform = p.repos.some((r) => r.platform === selectedPlatform);
        if (!matchesPlatform) return false;
      }

      if (selectedLanguage !== 'all') {
        const matchesLang = p.repos.some((r) => r.language === selectedLanguage);
        if (!matchesLang) return false;
      }

      if (q) {
        const haystack = [
          p.title,
          p.excerpt,
          p.member.username,
          p.node.title,
          ...p.repos.map((r) => `${r.fullName} ${r.language || ''} ${r.description || ''}`),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    const sorted = [...list];
    if (sortOrder === 'replies') {
      sorted.sort((a, b) => b.replies - a.replies || b.created - a.created);
    } else if (sortOrder === 'stars') {
      sorted.sort((a, b) => {
        const starsA = a.primaryRepo?.stars ?? -1;
        const starsB = b.primaryRepo?.stars ?? -1;
        return starsB - starsA || b.created - a.created;
      });
    } else {
      sorted.sort((a, b) => b.created - a.created);
    }
    return sorted;
  }, [
    allProjects,
    activeSection,
    savedSet,
    selectedNode,
    onlyWithRepo,
    selectedPlatform,
    selectedLanguage,
    searchQuery,
    sortOrder,
  ]);

  const repoCount = useMemo(
    () => allProjects.filter((p) => p.repos.length > 0).length,
    [allProjects]
  );

  const hasActiveFilters =
    activeSection !== 'all' ||
    searchQuery.trim().length > 0 ||
    selectedNode !== 'all' ||
    onlyWithRepo !== true ||
    selectedPlatform !== 'all' ||
    selectedLanguage !== 'all' ||
    sortOrder !== 'newest';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <TopBar
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        onRefresh={() => fetchProjects(true)}
        isLoading={loading}
        savedCount={savedIds.length}
      />

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Desktop Sidebar */}
          <div className="hidden lg:block shrink-0">
            <FilterSidebar
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
              nodeCounts={nodeCounts}
              onlyWithRepo={onlyWithRepo}
              onToggleOnlyWithRepo={setOnlyWithRepo}
              selectedPlatform={selectedPlatform}
              onSelectPlatform={setSelectedPlatform}
              selectedLanguage={selectedLanguage}
              onSelectLanguage={setSelectedLanguage}
              availableLanguages={availableLanguages}
              sortOrder={sortOrder}
              onChangeSortOrder={setSortOrder}
              onResetFilters={resetFilters}
              hasActiveFilters={hasActiveFilters}
            />
          </div>

          {/* Mobile Sidebar Drawer */}
          {mobileFiltersOpen && (
            <div
              className="fixed inset-0 z-40 lg:hidden bg-slate-950/40 flex"
              onClick={(e) => {
                if (e.target === e.currentTarget) setMobileFiltersOpen(false);
              }}
            >
              <div className="w-[290px] max-w-[85vw] h-full bg-slate-50 dark:bg-slate-950 p-4 overflow-y-auto border-r border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between px-1">
                  <span className="text-sm font-semibold">筛选条件</span>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <FilterSidebar
                  selectedNode={selectedNode}
                  onSelectNode={(n) => {
                    setSelectedNode(n);
                    setMobileFiltersOpen(false);
                  }}
                  nodeCounts={nodeCounts}
                  onlyWithRepo={onlyWithRepo}
                  onToggleOnlyWithRepo={setOnlyWithRepo}
                  selectedPlatform={selectedPlatform}
                  onSelectPlatform={setSelectedPlatform}
                  selectedLanguage={selectedLanguage}
                  onSelectLanguage={setSelectedLanguage}
                  availableLanguages={availableLanguages}
                  sortOrder={sortOrder}
                  onChangeSortOrder={setSortOrder}
                  onResetFilters={resetFilters}
                  hasActiveFilters={hasActiveFilters}
                />
              </div>
            </div>
          )}

          {/* Main Workspace */}
          <div className="flex-1 min-w-0 w-full space-y-5">
            {/* Page Heading & Summary Strip */}
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div className="space-y-1">
                  <h1 className="font-display text-2xl sm:text-[26px] font-bold tracking-tight text-slate-900 dark:text-slate-100 [text-wrap:balance]">
                    V2EX 最新开源项目发现
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    实时聚合开源节点、分享创造与技术热帖，自动解析 GitHub / Gitee 仓库与社区评价。
                  </p>
                </div>
              </div>

              {/* Single-elevation 4-column metric strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800">
                <div className="p-4 space-y-1">
                  <div className="text-xs text-slate-500 dark:text-slate-400">已扫描话题</div>
                  <div className="font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {data ? data.totalScanned : '—'}
                  </div>
                </div>
                <div className="p-4 space-y-1">
                  <div className="text-xs text-slate-500 dark:text-slate-400">匹配开源项目</div>
                  <div className="font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {data ? allProjects.length : '—'}
                  </div>
                </div>
                <div className="p-4 space-y-1">
                  <div className="text-xs text-slate-500 dark:text-slate-400">附带代码仓库</div>
                  <div className="font-mono text-xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                    {data ? repoCount : '—'}
                  </div>
                </div>
                <div className="p-4 space-y-1">
                  <div className="text-xs text-slate-500 dark:text-slate-400">最近同步时间</div>
                  <div className="font-mono text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {data ? formatExactTime(data.fetchedAt) : '—'}
                  </div>
                </div>
              </div>
            </section>

            {/* Search & Toolbar */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索项目名称、GitHub 仓库（如 owner/repo）、编程语言或作者..."
                  className="w-full h-10 pl-10 pr-9 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="清空搜索"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                className="lg:hidden inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 shrink-0 cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>筛选</span>
              </button>

              <button
                type="button"
                onClick={() => setIsDark((prev) => !prev)}
                aria-label={isDark ? '切换为浅色模式' : '切换为深色模式'}
                className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>

            {/* Result Counter Line */}
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
              <span className="tabular-nums">
                当前显示 <strong className="font-semibold text-slate-900 dark:text-slate-100">{filteredProjects.length}</strong> 个开源项目
                {onlyWithRepo ? '（已开启仅看含仓库链接）' : ''}
              </span>
              {!onlyWithRepo && (
                <button
                  type="button"
                  onClick={() => setOnlyWithRepo(true)}
                  className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  仅看含仓库链接
                </button>
              )}
            </div>

            {/* Project Feed Container */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              {error ? (
                <div className="p-10 text-center space-y-3">
                  <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{error}</p>
                  <button
                    type="button"
                    onClick={() => fetchProjects(true)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-500 transition-colors cursor-pointer"
                  >
                    重新加载
                  </button>
                </div>
              ) : loading && !data ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <div key={n} className="p-5 flex gap-4 animate-pulse">
                      <div className="hidden sm:block w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-800 shrink-0" />
                      <div className="flex-1 space-y-2.5">
                        <div className="h-3 w-48 bg-slate-200 dark:bg-slate-800 rounded" />
                        <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-800 rounded" />
                        <div className="h-3 w-full bg-slate-100 dark:bg-slate-800/70 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {activeSection === 'saved'
                      ? '还没有收藏任何开源项目'
                      : '当前筛选条件下没有匹配的开源项目'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {activeSection === 'saved'
                      ? '点击任意项目右侧的书签图标，即可将项目加入收藏清单。'
                      : '尝试关闭「仅看附带代码仓库」或清空搜索关键词。'}
                  </p>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      查看全部开源项目
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {filteredProjects.map((project) => (
                    <ProjectRow
                      key={project.id}
                      project={project}
                      isSelected={selectedProject?.id === project.id}
                      isSaved={savedSet.has(project.id)}
                      onSelect={setSelectedProject}
                      onToggleSave={toggleSave}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <TopicDetailDrawer
        project={selectedProject}
        isSaved={selectedProject ? savedSet.has(selectedProject.id) : false}
        onToggleSave={toggleSave}
        onClose={() => setSelectedProject(null)}
      />
    </div>
  );
}
