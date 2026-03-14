// ===== Site Types =====
export type SiteStatus = "active" | "inactive" | "error";

export interface Site {
  id: string;
  url: string;
  name: string;
  username: string;
  status: SiteStatus;
  lastHealthCheck: string | null;
  maxPostsPerDay: number;
  postsToday: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSiteInput {
  url: string;
  name: string;
  username: string;
  applicationPassword: string;
  maxPostsPerDay?: number;
}

export interface UpdateSiteInput {
  url?: string;
  name?: string;
  username?: string;
  applicationPassword?: string;
  maxPostsPerDay?: number;
}

// ===== Template Types =====
export interface Template {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  userPromptTemplate: string;
  variables: string[];
  model: string;
  maxTokens: number;
  temperature: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  systemPrompt: string;
  userPromptTemplate: string;
  variables?: string[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  isDefault?: boolean;
}

// ===== Article Types =====
export type ArticleStatus = "draft" | "generating" | "generated" | "failed";

export interface Article {
  id: string;
  title: string;
  content: string;
  excerpt: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  focusKeyword: string | null;
  tags: string[];
  templateId: string | null;
  status: ArticleStatus;
  generationTokens: number | null;
  generationCost: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateArticleInput {
  templateId: string;
  keyword: string;
  variables?: Record<string, string>;
}

export interface BulkGenerateInput {
  templateId: string;
  keywords: string[];
  variables?: Record<string, string>;
}

// ===== Post Types =====
export type PostStatus = "pending" | "posting" | "posted" | "failed";

export interface Post {
  id: string;
  articleId: string;
  siteId: string;
  status: PostStatus;
  wpPostId: number | null;
  wpPostUrl: string | null;
  wpCategoryIds: number[];
  wpTagIds: number[];
  retryCount: number;
  maxRetries: number;
  errorMessage: string | null;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  article?: Article;
  site?: Site;
}

export interface CreatePostInput {
  articleId: string;
  siteId: string;
  categoryNames?: string[];
  tagNames?: string[];
}

export interface BulkPostInput {
  articleId: string;
  siteIds: string[];
  categoryNames?: string[];
  tagNames?: string[];
}

// ===== Schedule Types =====
export type ScheduleFrequency = "hourly" | "daily" | "weekly" | "custom";

export interface Schedule {
  id: string;
  name: string;
  enabled: boolean;
  frequency: ScheduleFrequency;
  cronExpression: string;
  templateId: string;
  keywords: string[];
  targetSiteIds: string[];
  categoryNames: string[];
  tagNames: string[];
  postsPerExecution: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  totalRuns: number;
  totalArticlesGenerated: number;
  totalPostsCreated: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduleInput {
  name: string;
  frequency: ScheduleFrequency;
  cronExpression?: string;
  templateId: string;
  keywords: string[];
  targetSiteIds: string[];
  categoryNames?: string[];
  tagNames?: string[];
  postsPerExecution?: number;
}

// ===== Post Log Types =====
export type LogLevel = "info" | "warn" | "error";
export type LogAction =
  | "site_test"
  | "site_health_check"
  | "article_generate"
  | "wp_post_create"
  | "wp_post_retry"
  | "schedule_run"
  | "schedule_error";

export interface PostLog {
  id: string;
  action: LogAction;
  level: LogLevel;
  message: string;
  siteId: string | null;
  articleId: string | null;
  postId: string | null;
  scheduleId: string | null;
  durationMs: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ===== Analytics Types =====
export interface DashboardStats {
  totalSites: number;
  activeSites: number;
  totalArticles: number;
  totalPosts: number;
  successfulPosts: number;
  failedPosts: number;
  activeSchedules: number;
  totalGenerationCost: number;
}

export interface PostAnalytics {
  date: string;
  posted: number;
  failed: number;
}

// ===== Auth Types =====
export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
  };
}

// ===== API Response =====
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}
