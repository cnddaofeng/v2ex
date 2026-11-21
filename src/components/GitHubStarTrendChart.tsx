import { TrendingUp } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { StarTrendPoint, StarTrendResponse } from '../types/v2ex.ts';

interface GitHubStarTrendChartProps {
  fullName: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: StarTrendPoint }>;
}

function StarTrendTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0 || !payload[0].payload) {
    return null;
  }
  const point = payload[0].payload;
  return (
    <div className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md text-xs space-y-1">
      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
        {point.date}
      </div>
      <div className="flex items-center justify-between gap-4 font-mono tabular-nums">
        <span className="text-slate-600 dark:text-slate-300">累计 Stars</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">
          {point.totalStars.toLocaleString()}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 font-mono tabular-nums">
        <span className="text-slate-600 dark:text-slate-300">当日新增</span>
        <span
          className={
            point.newStars > 0
              ? 'font-semibold text-emerald-600 dark:text-emerald-400'
              : 'text-slate-400 dark:text-slate-500'
          }
        >
          +{point.newStars}
        </span>
      </div>
    </div>
  );
}

export function GitHubStarTrendChart({ fullName }: GitHubStarTrendChartProps) {
  const gradientId = useId().replace(/:/g, '');
  const [trend, setTrend] = useState<StarTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/repo/star-trend?fullName=${encodeURIComponent(fullName)}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`趋势数据暂不可用 (${res.status})`);
        }
        return (await res.json()) as StarTrendResponse;
      })
      .then((json) => {
        if (!cancelled) {
          setTrend(json);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '无法加载 Star 趋势');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fullName, reloadTick]);

  const minStars = trend
    ? Math.min(...trend.points.map((p) => p.totalStars))
    : 0;
  const maxStars = trend
    ? Math.max(...trend.points.map((p) => p.totalStars))
    : 0;
  const domainMin = minStars === maxStars ? Math.max(0, minStars - 1) : Math.max(0, minStars);
  const domainMax = minStars === maxStars ? maxStars + 1 : maxStars;

  return (
    <div className="pt-3 mt-3 border-t border-slate-200/80 dark:border-slate-800 space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
          <TrendingUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>近 30 天 Star 增长趋势</span>
        </span>

        {trend && !loading && (
          <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
            {trend.truncated && trend.coveredSince
              ? `近期记录起自 ${trend.coveredSince.slice(0, 10)} · `
              : ''}
            <strong
              className={
                trend.addedLast30Days > 0
                  ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                  : 'font-medium text-slate-500 dark:text-slate-400'
              }
            >
              +{trend.addedLast30Days.toLocaleString()}
            </strong>
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-[88px] w-full rounded-lg bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
      ) : error ? (
        <div className="h-[72px] w-full rounded-lg border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-between px-3 text-xs text-slate-500 dark:text-slate-400">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setReloadTick((n) => n + 1)}
            className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer shrink-0"
          >
            重试
          </button>
        </div>
      ) : trend && trend.points.length > 0 ? (
        <div className="h-[88px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend.points} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id={`starFill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                hide
              />
              <YAxis
                domain={[domainMin, domainMax]}
                hide
              />
              <Tooltip
                content={<StarTrendTooltip />}
                cursor={{ stroke: '#94A3B8', strokeWidth: 1, strokeDasharray: '3 3' }}
              />
              <Area
                type="monotone"
                dataKey="totalStars"
                stroke="#2563EB"
                strokeWidth={1.75}
                fill={`url(#starFill-${gradientId})`}
                isAnimationActive={false}
                activeDot={{ r: 3.5, strokeWidth: 1.5, stroke: '#FFFFFF', fill: '#2563EB' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[64px] flex items-center text-xs text-slate-400 dark:text-slate-500">
          近 30 天暂无新增 Star 记录
        </div>
      )}
    </div>
  );
}
