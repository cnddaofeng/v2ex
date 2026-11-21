export function formatRelativeTime(unixSeconds: number): string {
  if (!unixSeconds) return '未知时间';
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (diffSec < 60) return '刚刚';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} 天前`;
  const date = new Date(unixSeconds * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatExactTime(isoOrUnix: string | number): string {
  const date = typeof isoOrUnix === 'number' ? new Date(isoOrUnix * 1000) : new Date(isoOrUnix);
  if (Number.isNaN(date.getTime())) return '—';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function formatFullDateTime(unixSeconds: number): string {
  if (!unixSeconds) return '—';
  const date = new Date(unixSeconds * 1000);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatCompactNumber(num: number): string {
  if (num >= 10000) return `${(num / 1000).toFixed(1)}k`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return String(num);
}

export function isSafeHttpUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export interface TextSegment {
  type: 'text' | 'link';
  value: string;
}

export function splitTextWithLinks(text: string): TextSegment[] {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]()]+)/g;
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(urlRegex)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, idx) });
    }
    const rawUrl = match[0].replace(/[.,;:!?'"`]+$/g, '');
    if (isSafeHttpUrl(rawUrl)) {
      segments.push({ type: 'link', value: rawUrl });
    } else {
      segments.push({ type: 'text', value: match[0] });
    }
    lastIndex = idx + rawUrl.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}
