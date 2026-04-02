-- CreateTable: daily_usage_cache
--
-- Stores precomputed daily aggregates per user so the stats endpoint
-- doesn't need to scan raw events on every request.
--
-- Design decisions:
--   - committed_count: total committed turns for the day (immutable once day ends)
--   - reserved_count:  active (non-stale) reservations at time of computation
--   - computed_at:     used to determine cache freshness (TTL-based invalidation)
--   - (user_id, date_key) unique constraint enables efficient upserts
--
-- Historical days (before today) are cached indefinitely once computed.
-- Today's row is always recomputed live and never served from cache.

CREATE TABLE "daily_usage_cache" (
    "id"              SERIAL       NOT NULL,
    "user_id"         INTEGER      NOT NULL,
    "date_key"        VARCHAR(10)  NOT NULL,
    "committed_count" INTEGER      NOT NULL DEFAULT 0,
    "reserved_count"  INTEGER      NOT NULL DEFAULT 0,
    "computed_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_usage_cache_pkey" PRIMARY KEY ("id")
);

-- Unique constraint — one row per (user, day); also used by Prisma upsert
CREATE UNIQUE INDEX "daily_usage_cache_user_id_date_key_key"
    ON "daily_usage_cache"("user_id", "date_key");

-- Covering index for the stats query: WHERE user_id = ? AND date_key IN (...)
CREATE INDEX "daily_usage_cache_user_id_date_key_idx"
    ON "daily_usage_cache"("user_id", "date_key");
