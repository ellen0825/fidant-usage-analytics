"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { UsageStatsResponse } from "@/lib/types";

interface Props {
  userId: number;
  days?: number;
}

const DAY_OPTIONS = [7, 14, 30, 90];

export default function UsageStats({ userId, days: initialDays = 7 }: Props) {
  const [days, setDays] = useState(initialDays);
  const [data, setData] = useState<UsageStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/usage/stats?days=${days}`, {
      headers: { "x-user-id": String(userId) },
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { message?: string }).message ??
              `Request failed with status ${res.status}`
          );
        }
        return res.json() as Promise<UsageStatsResponse>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, days]);

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex gap-2">
        {DAY_OPTIONS.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              days === d
                ? "bg-indigo-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <span className="animate-spin inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full" />
          Loading…
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Content */}
      {!loading && !error && data && (
        <>
          {/* Today's progress */}
          <TodayProgress data={data} />

          {/* Summary cards */}
          <SummaryCards data={data} />

          {/* Bar chart */}
          <DailyChart data={data} />
        </>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

function TodayProgress({ data }: { data: UsageStatsResponse }) {
  const today = data.days[data.days.length - 1];
  const pct = Math.min(today.utilization * 100, 100);
  const isNearLimit = pct >= 80;

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-sm text-gray-400">Today's usage</span>
        <span className="text-sm font-medium">
          <span className={isNearLimit ? "text-amber-400" : "text-white"}>
            {today.committed}
          </span>
          <span className="text-gray-500"> / {data.daily_limit} turns</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isNearLimit ? "bg-amber-500" : "bg-indigo-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {today.reserved > 0 && (
        <p className="mt-1.5 text-xs text-gray-500">
          +{today.reserved} reserved (pending)
        </p>
      )}
    </div>
  );
}

function SummaryCards({ data }: { data: UsageStatsResponse }) {
  const { summary, plan, daily_limit } = data;
  const cards = [
    { label: "Plan", value: plan, sub: `${daily_limit} turns/day` },
    { label: "Total committed", value: summary.total_committed, sub: `${data.days.length}d period` },
    { label: "Daily average", value: summary.avg_daily, sub: "turns/day" },
    {
      label: "Peak day",
      value: summary.peak_day.count,
      sub: summary.peak_day.date,
    },
    {
      label: "Current streak",
      value: `${summary.current_streak}d`,
      sub: "consecutive days",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl bg-gray-900 border border-gray-800 p-4"
        >
          <p className="text-xs text-gray-500 mb-1">{c.label}</p>
          <p className="text-xl font-semibold text-white capitalize">{c.value}</p>
          <p className="text-xs text-gray-600 mt-0.5">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

function DailyChart({ data }: { data: UsageStatsResponse }) {
  const chartData = data.days.map((d) => ({
    date: d.date.slice(5), // "MM-DD"
    committed: d.committed,
    reserved: d.reserved,
  }));

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
      <p className="text-sm text-gray-400 mb-4">Daily committed turns</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} barSize={14} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tick={{ fill: "#6b7280", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#6b7280", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#111827",
              border: "1px solid #374151",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#9ca3af" }}
            itemStyle={{ color: "#e5e7eb" }}
          />
          <ReferenceLine
            y={data.daily_limit}
            stroke="#4f46e5"
            strokeDasharray="4 3"
            label={{ value: "limit", fill: "#6366f1", fontSize: 10, position: "right" }}
          />
          <Bar dataKey="committed" radius={[3, 3, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={
                  entry.committed >= data.daily_limit * 0.8
                    ? "#f59e0b"
                    : "#6366f1"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
