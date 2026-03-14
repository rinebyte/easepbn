# EasePBN

Automated PBN (Private Blog Network) management platform. Generate AI-powered articles, publish to 200+ WordPress sites, and manage everything from a single dashboard.

## Features

- **Site Management** — Add, organize, tag, and monitor 200+ WordPress sites with health checks
- **AI Article Generation** — Generate unique SEO articles via OpenAI with customizable templates
- **Automated Posting** — Schedule and publish articles to WordPress sites with rate limiting
- **Keyword Pool** — LRU keyword rotation with usage tracking to prevent duplicate content
- **Content Diversity** — Generate unique articles per site with varied writing styles
- **Backlink Injection** — Automatically weave backlinks into generated content
- **Health Monitoring** — Auto-detect offline sites every 15 minutes, disable after 3 failures
- **Queue Pipeline** — BullMQ-powered async processing with retry logic
- **Dashboard** — Real-time stats, today's progress, queue status, activity feed
- **Featured Images** — Auto-fetch from Pexels/Unsplash and upload to WordPress

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) |
| API | [Elysia](https://elysiajs.com) |
| Frontend | React 18 + Vite + Tailwind CSS |
| Database | PostgreSQL 16 + [Drizzle ORM](https://orm.drizzle.team) |
| Queue | [BullMQ](https://docs.bullmq.io) + Redis 7 |
| AI | OpenAI API (GPT-4o-mini default) |
| Auth | JWT + bcrypt |
| Encryption | AES-256-GCM (WordPress credentials at rest) |

## Project Structure

```
easepbn/
├── apps/
│   ├── api/                 # Elysia backend
│   │   ├── src/
│   │   │   ├── config/      # env, database, redis
│   │   │   ├── cron/        # scheduler, health checks
│   │   │   ├── db/schema/   # Drizzle table definitions
│   │   │   ├── middleware/   # auth, error handler
│   │   │   ├── queue/       # BullMQ queues & workers
│   │   │   ├── routes/      # API endpoints
│   │   │   └── services/    # OpenAI, WordPress, backlinks, etc.
│   │   └── drizzle/         # SQL migrations
│   └── web/                 # React frontend
│       └── src/
│           ├── api/         # Axios API layer
│           ├── components/  # Radix UI components
│           ├── pages/       # Route pages
│           └── hooks/       # Custom hooks
├── packages/shared/         # Shared types
├── docker-compose.yml       # PostgreSQL + Redis
└── .env.example             # Environment template
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [Docker](https://www.docker.com) (for PostgreSQL & Redis)
- OpenAI API key

### 1. Clone & Install

```bash
git clone <repo-url> easepbn
cd easepbn
bun install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
DATABASE_URL=postgresql://easepbn:easepbn@localhost:5432/easepbn
REDIS_URL=redis://localhost:6379
JWT_SECRET=<random-string-min-32-chars>
ENCRYPTION_KEY=<random-64-hex-chars>
OPENAI_API_KEY=sk-your-key-here
ADMIN_EMAIL=admin@easepbn.local
ADMIN_PASSWORD=your-password
API_PORT=3000
CORS_ORIGIN=http://localhost:5173
```

Generate secure keys:

```bash
# JWT_SECRET
openssl rand -base64 32

# ENCRYPTION_KEY (64 hex chars)
openssl rand -hex 32
```

### 3. Start Services

```bash
docker compose up -d
```

### 4. Run Database Setup

```bash
bun run db:migrate
bun run db:seed
```

### 5. Start Development

```bash
# Both API + Web
bun run dev

# Or separately
bun run dev:api   # http://localhost:3000
bun run dev:web   # http://localhost:5173
```

Login with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env`.

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login (returns JWT) |

### Sites
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sites` | List sites (search, status, tag, niche filters) |
| POST | `/api/sites` | Add site (auto-tests connection) |
| PUT | `/api/sites/:id` | Update site |
| DELETE | `/api/sites/:id` | Delete site |
| POST | `/api/sites/:id/test` | Test WordPress connection |
| POST | `/api/sites/bulk-test` | Test multiple sites |
| POST | `/api/sites/bulk-import` | Import sites from CSV data |
| PUT | `/api/sites/bulk-update` | Bulk update tags/niche |
| GET | `/api/sites/tags` | Get unique tags |

### Articles
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/articles` | List articles (status filter) |
| POST | `/api/articles` | Create + generate article |
| PUT | `/api/articles/:id` | Update article |
| DELETE | `/api/articles/:id` | Delete article |

### Posts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/posts` | List posts (status, site filters) |
| POST | `/api/posts` | Create post to single site |
| POST | `/api/posts/bulk` | Post to multiple sites |
| POST | `/api/posts/:id/retry` | Retry failed post |
| POST | `/api/posts/bulk-retry` | Retry all failed posts |
| POST | `/api/posts/bulk-delete` | Bulk delete posts |
| POST | `/api/posts/:id/unpublish` | Remove from WordPress |

### Schedules
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/schedules` | List schedules |
| POST | `/api/schedules` | Create schedule |
| PUT | `/api/schedules/:id` | Update schedule |
| POST | `/api/schedules/:id/toggle` | Enable/disable |
| POST | `/api/schedules/:id/run-now` | Trigger immediately |
| GET | `/api/schedules/:id/history` | Execution history |
| GET | `/api/schedules/:id/keywords` | Keyword pool |
| POST | `/api/schedules/:id/keywords/import` | Import keywords |
| POST | `/api/schedules/:id/keywords/reset` | Reset exhausted |

### Analytics
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/analytics/dashboard` | Dashboard summary |
| GET | `/api/analytics/queue-status` | Queue job counts |
| GET | `/api/analytics/logs` | Post logs (level, action filters) |
| GET | `/api/analytics/posts` | Daily post chart data |
| GET | `/api/analytics/sites` | Per-site statistics |
| GET | `/api/analytics/generation` | AI cost & token stats |
| GET | `/api/analytics/notifications` | In-app notifications |

### Templates & Backlinks
| Method | Path | Description |
|--------|------|-------------|
| GET/POST/PUT/DELETE | `/api/templates/*` | Prompt template CRUD |
| GET/POST/PUT/DELETE | `/api/backlinks/*` | Backlink rule CRUD |

## Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Admin accounts |
| `sites` | WordPress sites with encrypted credentials |
| `templates` | AI prompt templates |
| `articles` | Generated articles |
| `posts` | Article-to-site posting records |
| `schedules` | Auto-posting rules |
| `keywords` | Keyword pool with LRU rotation |
| `backlinks` | Backlink injection rules |
| `post_logs` | Audit trail for all operations |

## Queue Workers

| Queue | Concurrency | Rate Limit | Purpose |
|-------|-------------|-----------|---------|
| `article-generation` | 8 | 30/min | OpenAI article generation |
| `wordpress-posting` | 15 | 20/min | WordPress REST API posting |
| `scheduled-execution` | 5 | — | Schedule orchestration |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | Yes | — | JWT signing secret (min 32 chars) |
| `ENCRYPTION_KEY` | Yes | — | AES-256 key (64 hex chars) |
| `OPENAI_API_KEY` | Yes | — | OpenAI API key |
| `ADMIN_EMAIL` | No | `admin@easepbn.local` | Initial admin email |
| `ADMIN_PASSWORD` | No | `admin123` | Initial admin password |
| `API_PORT` | No | `3000` | API server port |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origin |
| `PEXELS_API_KEY` | No | — | Pexels API for featured images |
| `UNSPLASH_ACCESS_KEY` | No | — | Unsplash API for featured images |

## License

Private — All rights reserved.
