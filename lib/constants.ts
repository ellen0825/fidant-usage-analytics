export const PLAN_LIMITS: Record<string, number> = {
  starter: 30,
  pro: 100,
  executive: 500,
};

/** Reservations older than this are considered stale and excluded */
export const STALE_RESERVATION_MINUTES = 15;

/** Cache TTL: entries older than this trigger a re-compute */
export const CACHE_TTL_MINUTES = 5;
