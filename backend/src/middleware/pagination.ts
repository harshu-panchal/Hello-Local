import { Request, Response, NextFunction } from "express";

/**
 * Clamp pagination parameters for every request.
 *
 * Roughly thirty controllers read `req.query.page` / `req.query.limit` straight
 * into `.skip()` / `.limit()`, so `?limit=1000000` pulled an entire collection
 * into memory and `?page=-5` produced a negative skip. Normalising once at the
 * boundary fixes all of them without thirty separate edits, and controllers
 * that already clamp keep working unchanged. (#M-09)
 *
 * Mounted before the API router, so `req.query` is safe by the time any handler
 * sees it.
 */

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function clampPagination(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const q = req.query as Record<string, unknown>;

  if (q.limit !== undefined) {
    const raw = Number(Array.isArray(q.limit) ? q.limit[0] : q.limit);
    const safe = Number.isFinite(raw)
      ? Math.min(Math.max(Math.trunc(raw), 1), MAX_LIMIT)
      : DEFAULT_LIMIT;
    q.limit = String(safe);
  }

  if (q.page !== undefined) {
    const raw = Number(Array.isArray(q.page) ? q.page[0] : q.page);
    const safe = Number.isFinite(raw) ? Math.max(Math.trunc(raw), 1) : 1;
    q.page = String(safe);
  }

  next();
}

/**
 * Helper for new code: resolve page/limit with the same bounds.
 */
export function resolvePagination(
  page: unknown,
  limit: unknown,
): { page: number; limit: number; skip: number } {
  const p = Math.max(Math.trunc(Number(page)) || 1, 1);
  const rawLimit = Math.trunc(Number(limit));
  const l = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;
  return { page: p, limit: l, skip: (p - 1) * l };
}
