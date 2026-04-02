export interface DayStats {
  date: string;
  committed: number;
  reserved: number; // active (non-stale) reservations only
  limit: number;
  utilization: number; // committed / limit, rounded to 2 decimal places
}

export interface PeakDay {
  date: string;
  count: number;
}

export interface Summary {
  total_committed: number;
  avg_daily: number;
  peak_day: PeakDay;
  current_streak: number; // consecutive days (ending today) with ≥1 committed turn
}

export interface UsageStatsResponse {
  plan: string;
  daily_limit: number;
  period: {
    from: string;
    to: string;
  };
  days: DayStats[];
  summary: Summary;
}

export interface ApiError {
  error: string;
  message: string;
}
