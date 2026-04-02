import { prisma } from "./prisma";
import { PLAN_LIMITS, STALE_RESERVATION_MINUTES, CACHE_TTL_MINUTES } from "./constants";
import type { DayStats, UsageStatsResponse } from "./types";

/** Format a Date as "YYYY-MM-DD" in UTC */
function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Generate an array of date-key strings for the last `days` days (inclusive of today) */
function buildDateRange(days: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    result.push(toDateKey(d));
  }
  return result;
}

/** Compute streak: consecutive days ending today that have ≥1 committed turn */
function computeStreak(days: DayStats[]): number {
  let streak = 0;
  // Iterate from most recent to oldest
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].committed > 0) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Fetch raw aggregates from daily_usage_events for the given user + date range.
 * Falls back to raw query when cache is missing or stale.
 */
async function fetchRawAggregates(
  userId: number,
  dateKeys: string[]
): Promise<Map<string, { committed: number; reserved: number }>> {
  const staleThreshold = new Date(
    Date.now() - STALE_RESERVATION_MINUTES * 60 * 1000
  );

  const events = await prisma.daily_usage_events.findMany({
    where: {
      user_id: userId,
      date_key: { in: dateKeys },
    },
    select: {
      date_key: true,
      status: true,
      reserved_at: true,
    },
  });

  const map = new Map<string, { committed: number; reserved: number }>();

  for (const e of events) {
    const entry = map.get(e.date_key) ?? { committed: 0, reserved: 0 };

    if (e.status === "committed") {
      entry.committed++;
    } else if (e.status === "reserved" && e.reserved_at > staleThreshold) {
      // Only count non-stale reservations
      entry.reserved++;
    }

    map.set(e.date_key, entry);
  }

  return map;
}

/**
 * Try to serve aggregates from daily_usage_cache.
 * Returns null for any date that is missing or stale (so caller falls back to raw).
 *
 * Note: today's cache is always considered stale because the day isn't over yet
 * and new events may arrive. Historical days (before today) are stable once
 * computed_at is within TTL.
 */
async function fetchCachedAggregates(
  userId: number,
  dateKeys: string[]
): Promise<Map<string, { committed: number; reserved: number }> | null> {
  const todayKey = toDateKey(new Date());
  const cacheTTL = new Date(Date.now() - CACHE_TTL_MINUTES * 60 * 1000);

  const cached = await prisma.daily_usage_cache.findMany({
    where: {
      user_id: userId,
      date_key: { in: dateKeys },
      // Today's cache is always re-fetched from raw; historical must be fresh
      computed_at: { gte: cacheTTL },
    },
  });

  // Filter out today — always recompute live
  const validCached = cached.filter((c) => c.date_key !== todayKey);

  // If we don't have cache for all historical dates, signal a full miss
  const historicalKeys = dateKeys.filter((k) => k !== todayKey);
  if (validCached.length < historicalKeys.length) return null;

  const map = new Map<string, { committed: number; reserved: number }>();
  for (const c of validCached) {
    map.set(c.date_key, {
      committed: c.committed_count,
      reserved: c.reserved_count,
    });
  }
  return map;
}

/** Upsert cache entries for historical dates (not today) */
async function updateCache(
  userId: number,
  aggregates: Map<string, { committed: number; reserved: number }>,
  dateKeys: string[]
): Promise<void> {
  const todayKey = toDateKey(new Date());
  const historicalKeys = dateKeys.filter((k) => k !== todayKey);

  await Promise.all(
    historicalKeys.map((dateKey) => {
      const agg = aggregates.get(dateKey) ?? { committed: 0, reserved: 0 };
      return prisma.daily_usage_cache.upsert({
        where: { user_id_date_key: { user_id: userId, date_key: dateKey } },
        create: {
          user_id: userId,
          date_key: dateKey,
          committed_count: agg.committed,
          reserved_count: agg.reserved,
        },
        update: {
          committed_count: agg.committed,
          reserved_count: agg.reserved,
          computed_at: new Date(),
        },
      });
    })
  );
}

export async function computeUsageStats(
  userId: number,
  planTier: string,
  days: number
): Promise<UsageStatsResponse> {
  const dateKeys = buildDateRange(days);
  const limit = PLAN_LIMITS[planTier] ?? PLAN_LIMITS["starter"];

  // Try cache first; fall back to raw query
  let aggregates: Map<string, { committed: number; reserved: number }>;
  const cached = await fetchCachedAggregates(userId, dateKeys);

  if (cached === null) {
    aggregates = await fetchRawAggregates(userId, dateKeys);
    // Populate cache for historical dates in the background (fire-and-forget)
    updateCache(userId, aggregates, dateKeys).catch(() => {
      // Non-critical — log in production, ignore here
    });
  } else {
    aggregates = cached;
    // Cache hit for historical; still need live data for today
    const todayKey = toDateKey(new Date());
    const todayRaw = await fetchRawAggregates(userId, [todayKey]);
    aggregates.set(todayKey, todayRaw.get(todayKey) ?? { committed: 0, reserved: 0 });
  }

  // Build per-day stats
  const dayStats: DayStats[] = dateKeys.map((dateKey) => {
    const agg = aggregates.get(dateKey) ?? { committed: 0, reserved: 0 };
    const utilization =
      limit > 0 ? Math.round((agg.committed / limit) * 100) / 100 : 0;
    return {
      date: dateKey,
      committed: agg.committed,
      reserved: agg.reserved,
      limit,
      utilization,
    };
  });

  // Summary calculations
  const totalCommitted = dayStats.reduce((s, d) => s + d.committed, 0);
  const avgDaily = days > 0 ? Math.round((totalCommitted / days) * 10) / 10 : 0;

  const peakDay = dayStats.reduce(
    (best, d) => (d.committed > best.count ? { date: d.date, count: d.committed } : best),
    { date: dateKeys[0], count: 0 }
  );

  const streak = computeStreak(dayStats);

  return {
    plan: planTier,
    daily_limit: limit,
    period: {
      from: dateKeys[0],
      to: dateKeys[dateKeys.length - 1],
    },
    days: dayStats,
    summary: {
      total_committed: totalCommitted,
      avg_daily: avgDaily,
      peak_day: peakDay,
      current_streak: streak,
    },
  };
}
