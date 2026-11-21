import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  OpenSourceProject,
  ProjectsResponse,
  RepoMetadata,
  RepoPlatform,
  StarTrendPoint,
  StarTrendResponse,
  TopicDetailResponse,
  V2exReply,
} from './src/types/v2ex.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD =
  process.env.NODE_ENV === 'production' ||
  (process.env.npm_lifecycle_event === 'start' && fs.existsSync(path.resolve(__dirname, 'dist')));

const V2EX_HEADERS = {
  'User-Agent': 'V2EX-OpenSource-Radar/1.0 (+https://www.v2ex.com)',
  Accept: 'application/json, application/xml, text/xml;q=0.9',
};

const REPO_CACHE_TTL_MS = 15 * 60 * 1000;
const FEED_CACHE_TTL_MS = 3 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const repoCache = new Map<string, CacheEntry<RepoMetadata>>();
const starTrendCache = new Map<string, CacheEntry<StarTrendResponse>>();
let feedCache: CacheEntry<ProjectsResponse> | null = null;
let githubRateRemaining = 60;
let githubRateResetAt = 0;

const IGNORED_GITHUB_OWNERS = new Set([
  'features',
  'sponsors',
  'settings',
  'trending',
  'topics',
  'explore',
  'marketplace',
  'login',
  'join',
  'signup',
  'orgs',
  'users',
  'search',
  'notifications',
  'about',
  'pricing',
  'site',
  'security',
  'enterprise',
  'solutions',
  'collections',
  'events',
  'customer-stories',
  'readme',
  'apps',
]);

const OPEN_SOURCE_KEYWORDS = [
  '开源',
  'open source',
  'opensource',
  '自荐',
  'mit license',
  'apache-2.0',
  'apache 2.0',
  'gpl',
  'github.com/',
  'gitee.com/',
  'gitlab.com/',
  'codeberg.org/',
];

const EXCLUDED_NODES = new Set(['jobs', 'promotions', 'deals', 'all4all', 'exchange']);

function sanitizeHttpUrl(raw: string | undefined | null, fallback = 'https://www.v2ex.com'): string {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => {
      const num = Number(code);
      return Number.isFinite(num) && num > 0 && num < 0x10ffff ? String.fromCodePoint(num) : '';
    });
}

function stripHtmlToText(html: string): string {
  if (!html) return '';
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>/gi, '\n')
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const cleanLabel = label.replace(/<[^>]+>/g, '').trim();
      const safeHref = sanitizeHttpUrl(href, '');
      if (!safeHref) return cleanLabel;
      if (cleanLabel && !cleanLabel.includes('http') && cleanLabel !== safeHref) {
        return `${cleanLabel} (${safeHref})`;
      }
      return safeHref;
    });
  const withoutTags = withBreaks.replace(/<[^>]+>/g, '');
  return decodeHtmlEntities(withoutTags)
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildExcerpt(text: string, maxLen = 160): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLen) return singleLine;
  return `${singleLine.slice(0, maxLen - 1).trimEnd()}…`;
}

function extractRepoLinks(text: string): RepoMetadata[] {
  const regex =
    /https?:\/\/(github\.com|gitee\.com|gitlab\.com|codeberg\.org)\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/gi;
  const seen = new Set<string>();
  const repos: RepoMetadata[] = [];

  for (const match of text.matchAll(regex)) {
    const host = match[1].toLowerCase();
    const owner = match[2];
    let repo = match[3].replace(/\.git$/i, '').replace(/[),.;:!?'"`]+$/g, '');

    if (!owner || !repo) continue;
    if (host === 'github.com' && IGNORED_GITHUB_OWNERS.has(owner.toLowerCase())) continue;
    if (owner.startsWith('.') || repo.startsWith('.')) continue;

    let platform: RepoPlatform = 'github';
    if (host === 'gitee.com') platform = 'gitee';
    else if (host === 'gitlab.com') platform = 'gitlab';
    else if (host === 'codeberg.org') platform = 'codeberg';

    const fullName = `${owner}/${repo}`;
    const key = `${platform}:${fullName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    repos.push({
      platform,
      fullName,
      url: `https://${host}/${fullName}`,
      stars: null,
      forks: null,
      language: null,
      license: null,
      description: null,
      pushedAt: null,
      topics: [],
      enriched: false,
    });
  }

  return repos;
}

async function fetchGitHubRepo(fullName: string): Promise<RepoMetadata | null> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) {
    return null;
  }

  const cacheKey = `github:${fullName.toLowerCase()}`;
  const cached = repoCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  if (githubRateRemaining <= 2 && Date.now() < githubRateResetAt) {
    return null;
  }

  const headers: Record<string, string> = {
    'User-Agent': 'V2EX-OpenSource-Radar/1.0',
    Accept: 'application/vnd.github+json',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://api.github.com/repos/${fullName}`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const rem = Number(res.headers.get('x-ratelimit-remaining'));
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    if (Number.isFinite(rem)) githubRateRemaining = rem;
    if (Number.isFinite(reset)) githubRateResetAt = reset * 1000;

    if (!res.ok) return null;

    const json = (await res.json()) as {
      full_name?: string;
      html_url?: string;
      stargazers_count?: number;
      forks_count?: number;
      language?: string | null;
      license?: { spdx_id?: string; name?: string } | null;
      description?: string | null;
      pushed_at?: string | null;
      topics?: string[];
    };

    const meta: RepoMetadata = {
      platform: 'github',
      fullName: json.full_name || fullName,
      url: sanitizeHttpUrl(json.html_url, `https://github.com/${fullName}`),
      stars: typeof json.stargazers_count === 'number' ? json.stargazers_count : null,
      forks: typeof json.forks_count === 'number' ? json.forks_count : null,
      language: json.language || null,
      license:
        json.license?.spdx_id && json.license.spdx_id !== 'NOASSERTION'
          ? json.license.spdx_id
          : json.license?.name || null,
      description: json.description || null,
      pushedAt: json.pushed_at || null,
      topics: Array.isArray(json.topics) ? json.topics.slice(0, 6) : [],
      enriched: true,
    };

    repoCache.set(cacheKey, {
      data: meta,
      expiresAt: Date.now() + REPO_CACHE_TTL_MS,
    });
    return meta;
  } catch {
    return null;
  }
}

interface RawV2exTopic {
  id: number;
  title: string;
  url?: string;
  content?: string;
  content_rendered?: string;
  created: number;
  last_touched?: number;
  replies?: number;
  node?: {
    name?: string;
    title?: string;
    url?: string;
  };
  member?: {
    username?: string;
    avatar_normal?: string;
    avatar_large?: string;
    url?: string;
  };
}

function parseV2exXmlFeed(xml: string, feedName: string): RawV2exTopic[] {
  const entries: RawV2exTopic[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;

  for (const match of xml.matchAll(entryRegex)) {
    const block = match[1];
    const idMatch = block.match(/\/t\/(\d+)/);
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
    const pubMatch = block.match(/<published>([\s\S]*?)<\/published>/i);
    const authorMatch = block.match(/<author>\s*<name>([\s\S]*?)<\/name>/i);
    const contentMatch = block.match(/<content[^>]*>([\s\S]*?)<\/content>/i);

    const id = idMatch ? Number(idMatch[1]) : 0;
    if (!id) continue;

    const rawTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]).trim() : '';
    const rawHtml = contentMatch ? decodeHtmlEntities(contentMatch[1]) : '';
    const plainContent = stripHtmlToText(rawHtml);
    const publishedTs = pubMatch ? Math.floor(new Date(pubMatch[1].trim()).getTime() / 1000) : Math.floor(Date.now() / 1000);
    const nodeName = feedName === 'creative.xml' ? 'create' : 'tech';
    const nodeTitle = feedName === 'creative.xml' ? '分享创造' : '技术';

    entries.push({
      id,
      title: rawTitle,
      url: linkMatch ? linkMatch[1] : `https://www.v2ex.com/t/${id}`,
      content: plainContent,
      content_rendered: rawHtml,
      created: Number.isFinite(publishedTs) ? publishedTs : Math.floor(Date.now() / 1000),
      last_touched: Number.isFinite(publishedTs) ? publishedTs : Math.floor(Date.now() / 1000),
      replies: 0,
      node: {
        name: nodeName,
        title: nodeTitle,
        url: `https://www.v2ex.com/go/${nodeName}`,
      },
      member: {
        username: authorMatch ? decodeHtmlEntities(authorMatch[1]).trim() : 'v2ex_user',
      },
    });
  }

  return entries;
}

function classifyTopic(
  raw: RawV2exTopic,
  isHot: boolean,
  sourceFeeds: string[]
): OpenSourceProject | null {
  const nodeName = raw.node?.name || 'v2ex';
  const title = (raw.title || '').trim();
  const plainContent = raw.content?.trim() || stripHtmlToText(raw.content_rendered || '');
  const combinedText = `${title}\n${plainContent}\n${raw.content_rendered || ''}`;
  const lower = combinedText.toLowerCase();

  const repos = extractRepoLinks(combinedText);
  const hasRepo = repos.length > 0;
  const hasKeyword = OPEN_SOURCE_KEYWORDS.some((kw) => lower.includes(kw));
  const titleHasOs = /开源|open\s*source|github|gitee|自荐|源码/i.test(title);

  if (EXCLUDED_NODES.has(nodeName) && !titleHasOs) {
    return null;
  }

  let matchReason: 'node' | 'repo' | 'keyword' | null = null;
  if (nodeName === 'opensource') {
    matchReason = 'node';
  } else if (hasRepo) {
    matchReason = 'repo';
  } else if (titleHasOs || (nodeName === 'create' && hasKeyword) || (nodeName === 'github' && hasKeyword)) {
    matchReason = 'keyword';
  }

  if (!matchReason) return null;

  const username = raw.member?.username || 'anonymous';
  const avatarRaw = raw.member?.avatar_large || raw.member?.avatar_normal || '';

  return {
    id: raw.id,
    title,
    url: sanitizeHttpUrl(raw.url, `https://www.v2ex.com/t/${raw.id}`),
    excerpt: buildExcerpt(plainContent || title),
    content: plainContent || title,
    created: raw.created || 0,
    lastTouched: raw.last_touched || raw.created || 0,
    replies: typeof raw.replies === 'number' ? raw.replies : 0,
    node: {
      name: nodeName,
      title: raw.node?.title || nodeName,
      url: sanitizeHttpUrl(raw.node?.url, `https://www.v2ex.com/go/${nodeName}`),
    },
    member: {
      username,
      avatar: sanitizeHttpUrl(avatarRaw, ''),
      url: sanitizeHttpUrl(raw.member?.url, `https://www.v2ex.com/u/${encodeURIComponent(username)}`),
    },
    repos,
    primaryRepo: repos[0] || null,
    isHot,
    sourceFeeds,
    matchReason,
  };
}

async function fetchJsonSafe<T>(url: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { headers: V2EX_HEADERS, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchTextSafe(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { headers: V2EX_HEADERS, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function scanOpenSourceProjects(forceRefresh: boolean): Promise<ProjectsResponse> {
  if (!forceRefresh && feedCache && feedCache.expiresAt > Date.now()) {
    return { ...feedCache.data, fromCache: true };
  }

  const jsonEndpoints: Array<{ key: string; url: string }> = [
    { key: 'opensource', url: 'https://www.v2ex.com/api/topics/show.json?node_name=opensource' },
    { key: 'create', url: 'https://www.v2ex.com/api/topics/show.json?node_name=create' },
    { key: 'github', url: 'https://www.v2ex.com/api/topics/show.json?node_name=github' },
    { key: 'programmer', url: 'https://www.v2ex.com/api/topics/show.json?node_name=programmer' },
    { key: 'share', url: 'https://www.v2ex.com/api/topics/show.json?node_name=share' },
    { key: 'latest', url: 'https://www.v2ex.com/api/topics/latest.json' },
    { key: 'hot', url: 'https://www.v2ex.com/api/topics/hot.json' },
  ];

  const xmlEndpoints: Array<{ key: string; url: string }> = [
    { key: 'creative.xml', url: 'https://www.v2ex.com/feed/tab/creative.xml' },
    { key: 'tech.xml', url: 'https://www.v2ex.com/feed/tab/tech.xml' },
  ];

  const [jsonResults, xmlResults] = await Promise.all([
    Promise.all(
      jsonEndpoints.map(async (ep) => ({
        key: ep.key,
        items: (await fetchJsonSafe<RawV2exTopic[]>(ep.url)) || [],
      }))
    ),
    Promise.all(
      xmlEndpoints.map(async (ep) => {
        const text = await fetchTextSafe(ep.url);
        return {
          key: ep.key,
          items: text ? parseV2exXmlFeed(text, ep.key) : [],
        };
      })
    ),
  ]);

  const topicMap = new Map<
    number,
    { raw: RawV2exTopic; isHot: boolean; sources: Set<string> }
  >();
  let totalScanned = 0;

  // Process rich JSON endpoints first so JSON metadata (replies, exact node, avatar) takes precedence
  for (const batch of jsonResults) {
    if (!Array.isArray(batch.items)) continue;
    for (const item of batch.items) {
      if (!item || typeof item.id !== 'number') continue;
      totalScanned += 1;
      const existing = topicMap.get(item.id);
      if (existing) {
        existing.sources.add(batch.key);
        if (batch.key === 'hot') existing.isHot = true;
      } else {
        topicMap.set(item.id, {
          raw: item,
          isHot: batch.key === 'hot',
          sources: new Set([batch.key]),
        });
      }
    }
  }

  for (const batch of xmlResults) {
    for (const item of batch.items) {
      totalScanned += 1;
      const existing = topicMap.get(item.id);
      if (existing) {
        existing.sources.add(batch.key);
      } else {
        topicMap.set(item.id, {
          raw: item,
          isHot: false,
          sources: new Set([batch.key]),
        });
      }
    }
  }

  const projects: OpenSourceProject[] = [];
  for (const entry of topicMap.values()) {
    const classified = classifyTopic(entry.raw, entry.isHot, [...entry.sources]);
    if (classified) {
      projects.push(classified);
    }
  }

  projects.sort((a, b) => b.created - a.created);

  // Enrich primary GitHub repositories for the newest projects (within rate-limit budget)
  const reposToEnrich: string[] = [];
  const seenRepos = new Set<string>();
  for (const project of projects) {
    for (const repo of project.repos) {
      if (repo.platform === 'github') {
        const lower = repo.fullName.toLowerCase();
        if (!seenRepos.has(lower)) {
          seenRepos.add(lower);
          reposToEnrich.push(repo.fullName);
        }
      }
    }
  }

  const enrichedMap = new Map<string, RepoMetadata>();
  const enrichTargets = reposToEnrich.slice(0, 16);
  await Promise.all(
    enrichTargets.map(async (fullName) => {
      const meta = await fetchGitHubRepo(fullName);
      if (meta) {
        enrichedMap.set(fullName.toLowerCase(), meta);
      }
    })
  );

  for (const project of projects) {
    project.repos = project.repos.map((repo) => {
      if (repo.platform === 'github') {
        const hit = enrichedMap.get(repo.fullName.toLowerCase());
        if (hit) return hit;
        const cached = repoCache.get(`github:${repo.fullName.toLowerCase()}`);
        if (cached && cached.expiresAt > Date.now()) return cached.data;
      }
      return repo;
    });
    project.primaryRepo = project.repos[0] || null;
  }

  const response: ProjectsResponse = {
    projects,
    fetchedAt: new Date().toISOString(),
    totalScanned,
    endpointsScanned: jsonEndpoints.length + xmlEndpoints.length,
    fromCache: false,
  };

  if (projects.length > 0) {
    feedCache = {
      data: response,
      expiresAt: Date.now() + FEED_CACHE_TTL_MS,
    };
  }

  return response;
}

async function createApp() {
  const app = express();

  app.get('/api/projects', async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === '1';
      const data = await scanOpenSourceProjects(forceRefresh);
      res.json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch V2EX topics';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/topics/:id', async (req, res) => {
    const idParam = req.params.id;
    if (!/^\d{1,10}$/.test(idParam)) {
      res.status(400).json({ error: 'Invalid topic ID' });
      return;
    }

    try {
      const [topicList, repliesList] = await Promise.all([
        fetchJsonSafe<RawV2exTopic[]>(`https://www.v2ex.com/api/topics/show.json?id=${idParam}`),
        fetchJsonSafe<
          Array<{
            id: number;
            content: string;
            content_rendered?: string;
            created: number;
            member?: {
              username?: string;
              avatar_normal?: string;
              avatar_large?: string;
              url?: string;
            };
          }>
        >(`https://www.v2ex.com/api/replies/show.json?topic_id=${idParam}`),
      ]);

      const rawTopic = Array.isArray(topicList) ? topicList[0] : null;
      if (!rawTopic) {
        res.status(404).json({ error: 'Topic not found' });
        return;
      }

      const plainContent = rawTopic.content?.trim() || stripHtmlToText(rawTopic.content_rendered || '');
      const repos = extractRepoLinks(`${rawTopic.title}\n${plainContent}\n${rawTopic.content_rendered || ''}`);

      const enrichedRepos = await Promise.all(
        repos.map(async (repo) => {
          if (repo.platform === 'github') {
            const meta = await fetchGitHubRepo(repo.fullName);
            if (meta) return meta;
          }
          return repo;
        })
      );

      const username = rawTopic.member?.username || 'anonymous';
      const project: OpenSourceProject = {
        id: rawTopic.id,
        title: (rawTopic.title || '').trim(),
        url: sanitizeHttpUrl(rawTopic.url, `https://www.v2ex.com/t/${rawTopic.id}`),
        excerpt: buildExcerpt(plainContent || rawTopic.title || ''),
        content: plainContent || rawTopic.title || '',
        created: rawTopic.created || 0,
        lastTouched: rawTopic.last_touched || rawTopic.created || 0,
        replies: typeof rawTopic.replies === 'number' ? rawTopic.replies : 0,
        node: {
          name: rawTopic.node?.name || 'v2ex',
          title: rawTopic.node?.title || rawTopic.node?.name || 'V2EX',
          url: sanitizeHttpUrl(rawTopic.node?.url, 'https://www.v2ex.com'),
        },
        member: {
          username,
          avatar: sanitizeHttpUrl(rawTopic.member?.avatar_large || rawTopic.member?.avatar_normal, ''),
          url: sanitizeHttpUrl(rawTopic.member?.url, `https://www.v2ex.com/u/${encodeURIComponent(username)}`),
        },
        repos: enrichedRepos,
        primaryRepo: enrichedRepos[0] || null,
        isHot: false,
        sourceFeeds: ['detail'],
        matchReason: 'repo',
      };

      const replies: V2exReply[] = Array.isArray(repliesList)
        ? repliesList.slice(0, 60).map((r) => {
            const rUser = r.member?.username || 'anonymous';
            return {
              id: r.id,
              content: r.content?.trim() || stripHtmlToText(r.content_rendered || ''),
              created: r.created || 0,
              member: {
                username: rUser,
                avatar: sanitizeHttpUrl(r.member?.avatar_large || r.member?.avatar_normal, ''),
                url: sanitizeHttpUrl(r.member?.url, `https://www.v2ex.com/u/${encodeURIComponent(rUser)}`),
              },
            };
          })
        : [];

      const payload: TopicDetailResponse = {
        project,
        replies,
        fetchedAt: new Date().toISOString(),
      };
      res.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch topic details';
      res.status(502).json({ error: message });
    }
  });

  app.get('/api/repo', async (req, res) => {
    const fullName = typeof req.query.fullName === 'string' ? req.query.fullName.trim() : '';
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) {
      res.status(400).json({ error: 'Invalid repository fullName' });
      return;
    }

    const meta = await fetchGitHubRepo(fullName);
    if (!meta) {
      res.status(404).json({ error: 'Repository metadata unavailable' });
      return;
    }
    res.json(meta);
  });

  app.get('/api/repo/star-trend', async (req, res) => {
    const fullName = typeof req.query.fullName === 'string' ? req.query.fullName.trim() : '';
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) {
      res.status(400).json({ error: 'Invalid repository fullName' });
      return;
    }

    const cacheKey = `trend:${fullName.toLowerCase()}`;
    const cached = starTrendCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    try {
      const meta = await fetchGitHubRepo(fullName);
      if (!meta) {
        res.status(404).json({ error: '无法获取仓库信息' });
        return;
      }

      const currentStars = meta.stars ?? 0;
      const now = new Date();
      const dayKeys: string[] = [];
      const dailyNewMap = new Map<string, number>();

      for (let i = 29; i >= 0; i -= 1) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
        const key = d.toISOString().slice(0, 10);
        dayKeys.push(key);
        dailyNewMap.set(key, 0);
      }

      const windowStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29);
      let truncated = false;
      let coveredSince: string | null = null;

      const headers: Record<string, string> = {
        'User-Agent': 'V2EX-OpenSource-Radar/1.0',
        Accept: 'application/vnd.github+json',
      };
      if (process.env.GITHUB_TOKEN) {
        headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      }

      let usedStargazers = false;
      if (process.env.GITHUB_TOKEN && currentStars > 0) {
        const perPage = 100;
        const lastPage = Math.max(1, Math.ceil(currentStars / perPage));
        const starHeaders = { ...headers, Accept: 'application/vnd.github.star+json' };
        let earliestMs = Date.now();

        for (let page = lastPage; page >= Math.max(1, lastPage - 9); page -= 1) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(
            `https://api.github.com/repos/${fullName}/stargazers?per_page=${perPage}&page=${page}`,
            { headers: starHeaders, signal: controller.signal }
          );
          clearTimeout(timer);
          if (!resp.ok) break;
          const items = (await resp.json()) as Array<{ starred_at?: string }>;
          if (!Array.isArray(items) || items.length === 0) break;

          usedStargazers = true;
          for (const item of items) {
            if (!item.starred_at) continue;
            const ts = Date.parse(item.starred_at);
            if (!Number.isFinite(ts)) continue;
            if (ts < earliestMs) {
              earliestMs = ts;
              coveredSince = item.starred_at;
            }
            if (ts >= windowStartMs) {
              const dayKey = item.starred_at.slice(0, 10);
              if (dailyNewMap.has(dayKey)) {
                dailyNewMap.set(dayKey, (dailyNewMap.get(dayKey) || 0) + 1);
              }
            }
          }
          if (earliestMs < windowStartMs) break;
        }
      }

      let lastEventStatus: number | null = null;
      if (!usedStargazers) {
        let earliestEventMs = Date.now();
        let reachedLimit = false;

        for (let page = 1; page <= 3; page += 1) {
          if (githubRateRemaining <= 1 && Date.now() < githubRateResetAt) {
            reachedLimit = true;
            break;
          }
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(
            `https://api.github.com/repos/${fullName}/events?per_page=100&page=${page}`,
            { headers, signal: controller.signal }
          );
          clearTimeout(timer);

          const rem = Number(resp.headers.get('x-ratelimit-remaining'));
          const reset = Number(resp.headers.get('x-ratelimit-reset'));
          if (Number.isFinite(rem)) githubRateRemaining = rem;
          if (Number.isFinite(reset)) githubRateResetAt = reset * 1000;

          lastEventStatus = resp.status;
          if (!resp.ok) {
            console.warn(`GitHub events returned ${resp.status} for ${fullName} page ${page}`);
            break;
          }
          const events = (await resp.json()) as Array<{ type?: string; created_at?: string }>;
          if (!Array.isArray(events) || events.length === 0) break;

          for (const ev of events) {
            if (!ev.created_at) continue;
            const ts = Date.parse(ev.created_at);
            if (!Number.isFinite(ts)) continue;
            if (ts < earliestEventMs) {
              earliestEventMs = ts;
              coveredSince = ev.created_at;
            }
            if (ev.type === 'WatchEvent' && ts >= windowStartMs) {
              const dayKey = ev.created_at.slice(0, 10);
              if (dailyNewMap.has(dayKey)) {
                dailyNewMap.set(dayKey, (dailyNewMap.get(dayKey) || 0) + 1);
              }
            }
          }

          if (earliestEventMs < windowStartMs) {
            break;
          }
          if (page === 3 && earliestEventMs > windowStartMs) {
            reachedLimit = true;
          }
        }
        truncated = reachedLimit;
      }

      if (coveredSince === null && lastEventStatus !== null && lastEventStatus >= 400) {
        res.status(502).json({
          error:
            lastEventStatus === 403 || lastEventStatus === 429
              ? 'GitHub API 公开接口已达限流阈值，请稍后再试'
              : `GitHub 事件接口返回 ${lastEventStatus}`,
        });
        return;
      }

      const points: StarTrendPoint[] = new Array(dayKeys.length);
      let runningTotal = currentStars;
      let addedLast30Days = 0;

      for (let i = dayKeys.length - 1; i >= 0; i -= 1) {
        const key = dayKeys[i];
        const newStars = dailyNewMap.get(key) || 0;
        addedLast30Days += newStars;
        points[i] = {
          date: key,
          label: key.slice(5),
          newStars,
          totalStars: runningTotal,
        };
        runningTotal = Math.max(0, runningTotal - newStars);
      }

      const payload: StarTrendResponse = {
        fullName: meta.fullName,
        currentStars,
        addedLast30Days,
        points,
        truncated,
        coveredSince,
        fetchedAt: new Date().toISOString(),
      };

      if (coveredSince !== null || currentStars === 0) {
        starTrendCache.set(cacheKey, {
          data: payload,
          expiresAt: Date.now() + REPO_CACHE_TTL_MS,
        });
      }

      res.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法加载 Star 趋势数据';
      res.status(502).json({ error: message });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`V2EX Open Source Radar server listening on http://0.0.0.0:${PORT}`);
  });
}

createApp();
