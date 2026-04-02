# Usage Analytics API — Fidant.AI

Full-stack usage analytics: a Next.js API endpoint + React UI for displaying daily turn consumption per user.

---

## Stack

- **Next.js 15** (App Router) — API routes + React Server/Client Components
- **Prisma 5** — ORM + migrations (PostgreSQL)
- **Recharts** — bar chart visualization
- **Tailwind CSS** — styling
- **TypeScript** (strict mode)

---

## Getting started

### 1. Prerequisites

- Node.js ≥ 20
- PostgreSQL instance (local or remote)

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set your database URL:

```
DATABASE_URL="postgresql://user:password@localhost:5432/usage_analytics"
AUTH_SECRET="your-random-secret-min-32-chars"
```

### 4. Run migrations

```bash
npx prisma migrate deploy
```

This applies both migrations:
- `0001_init` — creates `users` and `daily_usage_events` tables
- `0002_add_daily_usage_cache` — creates the `daily_usage_cache` table

### 5. Generate Prisma client

```bash
npm run db:generate
```

### 6. (Optional) Seed sample data

```bash
npm run db:seed
```

### 7. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## API

### `GET /api/usage/stats?days=7`

Returns usage statistics for the authenticated user.

**Auth:** Pass `x-user-id: <id>` header (stand-in for a real session token — see Assumptions below).

**Query params:**

| Param | Type | Default | Constraints |
|-------|------|---------|-------------|
| `days` | integer | `7` | 1–90 |

**Response:**

```json
{
  "plan": "starter",
  "daily_limit": 30,
  "period": { "from": "2026-03-27", "to": "2026-04-02" },
  "days": [
    { "date": "2026-04-02", "committed": 12, "reserved": 2, "limit": 30, "utilization": 0.4 }
  ],
  "summary": {
    "total_committed": 87,
    "avg_daily": 12.4,
    "peak_day": { "date": "2026-03-30", "count": 28 },
    "current_streak": 5
  }
}
```

**Errors:**

| Status | Reason |
|--------|--------|
| `401` | Missing or invalid `x-user-id` |
| `400` | `days` out of range or not a number |

---

## Caching strategy

The stats endpoint uses a two-layer approach:

1. **Cache hit** (`daily_usage_cache`): historical days (before today) are served from precomputed rows if `computed_at` is within the TTL (5 min). Today is always recomputed live.
2. **Cache miss**: falls back to scanning `daily_usage_events`, then writes results to the cache table in the background (fire-and-forget).

This means the first request after a cold start is slightly slower; subsequent requests for the same historical window are fast.

---

## Assumptions

- **Auth**: A real deployment would verify a signed JWT or session cookie. The `x-user-id` header is a deliberate stand-in to keep the assignment self-contained without requiring a full auth stack. The `lib/auth.ts` module is the single place to swap this out.
- **Timezones**: All date keys (`YYYY-MM-DD`) are computed in UTC. If per-user timezone support is needed, `date_key` generation should use the user's timezone offset.
- **`reserved` in cache**: The cache stores `reserved_count` at computation time. Because stale-reservation filtering is time-dependent, cached `reserved` values for historical days may be slightly off (reservations that were active when cached but later expired). This is acceptable since `reserved` is informational only and doesn't affect `committed` counts.
- **Plan limits**: Defined as a static map in `lib/constants.ts`. In production these would likely live in the DB alongside the plan definition.

---

## What I'd do differently with more time

- **Real auth**: Replace the `x-user-id` header with JWT verification (e.g. `jose`) or NextAuth.
- **Background cache refresh**: Use a cron job or queue (e.g. pg_cron, BullMQ) to pre-warm the cache for active users rather than lazy population on first request.
- **Tests**: Unit tests for `computeStreak`, `buildDateRange`, and the stale-reservation filter; integration tests for the route with a test DB.
- **Seed script**: A proper `prisma/seed.ts` with realistic data spread across multiple users and plan tiers.
- **Error monitoring**: Structured logging (e.g. Pino) and an error boundary in the React component tree.
- **Pagination / cursor**: For `days=90` with high-volume users, streaming or cursor-based aggregation would be more efficient than loading all events into memory.
