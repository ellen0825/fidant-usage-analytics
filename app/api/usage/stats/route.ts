import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { computeUsageStats } from "@/lib/usageStats";
import type { ApiError } from "@/lib/types";

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json<ApiError>({ error, message }, { status });
}

export async function GET(req: NextRequest) {
  // --- Auth ---
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return errorResponse(401, "Unauthorized", "Valid authentication is required.");
  }

  // --- Validate `days` param ---
  const { searchParams } = req.nextUrl;
  const rawDays = searchParams.get("days") ?? "7";
  const days = parseInt(rawDays, 10);

  if (isNaN(days) || days < 1 || days > 90) {
    return errorResponse(
      400,
      "Bad Request",
      "Parameter `days` must be an integer between 1 and 90."
    );
  }

  // --- Compute & return ---
  const stats = await computeUsageStats(user.id, user.plan_tier, days);
  return NextResponse.json(stats);
}
