import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import type { users } from "@prisma/client";

/**
 * Resolves the authenticated user from the request.
 *
 * Assumption: auth is handled upstream (e.g. a session cookie or JWT middleware).
 * For this assignment we accept an `x-user-id` header as a stand-in so the
 * endpoint can be exercised without a full auth stack.
 *
 * In production this would verify a signed JWT / session token.
 */
export async function getAuthenticatedUser(
  req: NextRequest
): Promise<users | null> {
  const userId = req.headers.get("x-user-id");
  if (!userId) return null;

  const id = parseInt(userId, 10);
  if (isNaN(id)) return null;

  return prisma.users.findUnique({ where: { id } });
}
