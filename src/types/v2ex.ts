export type RepoPlatform = 'github' | 'gitee' | 'gitlab' | 'codeberg';

export interface RepoMetadata {
  platform: RepoPlatform;
  fullName: string;
  url: string;
  stars: number | null;
  forks: number | null;
  language: string | null;
  license: string | null;
  description: string | null;
  pushedAt: string | null;
  topics: string[];
  enriched: boolean;
}

export interface V2exNodeInfo {
  name: string;
  title: string;
  url: string;
}

export interface V2exMemberInfo {
  username: string;
  avatar: string;
  url: string;
}

export interface OpenSourceProject {
  id: number;
  title: string;
  url: string;
  excerpt: string;
  content: string;
  created: number;
  lastTouched: number;
  replies: number;
  node: V2exNodeInfo;
  member: V2exMemberInfo;
  repos: RepoMetadata[];
  primaryRepo: RepoMetadata | null;
  isHot: boolean;
  sourceFeeds: string[];
  matchReason: 'node' | 'repo' | 'keyword';
}

export interface ProjectsResponse {
  projects: OpenSourceProject[];
  fetchedAt: string;
  totalScanned: number;
  endpointsScanned: number;
  fromCache: boolean;
}

export interface V2exReply {
  id: number;
  content: string;
  created: number;
  member: V2exMemberInfo;
}

export interface TopicDetailResponse {
  project: OpenSourceProject;
  replies: V2exReply[];
  fetchedAt: string;
}

export interface StarTrendPoint {
  date: string;
  label: string;
  newStars: number;
  totalStars: number;
}

export interface StarTrendResponse {
  fullName: string;
  currentStars: number;
  addedLast30Days: number;
  points: StarTrendPoint[];
  truncated: boolean;
  coveredSince: string | null;
  fetchedAt: string;
}

