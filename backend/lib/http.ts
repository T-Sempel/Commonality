// =============================================================================
// API RESPONSE HELPERS
// =============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ApiResult } from "@commonality/shared/types";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export function handlePreflight(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method === "OPTIONS") {
    setCors(req, res);
    res.status(204).end();
    return true;
  }
  setCors(req, res);
  return false;
}

export function ok<T>(res: VercelResponse, data: T, status = 200) {
  const body: ApiResult<T> = { ok: true, data };
  return res.status(status).json(body);
}

export function fail(res: VercelResponse, status: number, code: string, message: string) {
  const body: ApiResult<never> = { ok: false, error: { code, message } };
  return res.status(status).json(body);
}

export function methodNotAllowed(res: VercelResponse, allowed: string[]) {
  res.setHeader("Allow", allowed.join(", "));
  return fail(res, 405, "method_not_allowed", `Allowed: ${allowed.join(", ")}`);
}
