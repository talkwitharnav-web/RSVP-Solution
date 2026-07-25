import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export type HealthTier = "healthy" | "ok" | "bad" | "terrible";

// Thresholds are on DB round-trip latency for a trivial `SELECT 1` -- the
// simplest available signal for "is Postgres actually responsive right now",
// distinct from whether the TCP connection itself is up (a slow/overloaded
// DB answers eventually; a dead one never does, which is what the DB_DOWN
// path below covers).
const LATENCY_OK_MS = 50;
const LATENCY_BAD_MS = 300;

export async function GET() {
  const started = Date.now();
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;
  let dbSizeBytes: number | null = null;

  try {
    await pool.query("SELECT 1");
    dbLatencyMs = Date.now() - started;
    const sizeResult = await pool.query<{ size: string }>(
      "SELECT pg_database_size(current_database())::text AS size",
    );
    dbSizeBytes = Number(sizeResult.rows[0]?.size ?? null) || null;
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Unknown DB error";
  }

  const globalForWs = globalThis as unknown as { __rsvpWsClients?: Set<unknown> };
  const wsClientCount = globalForWs.__rsvpWsClients?.size ?? 0;

  let tier: HealthTier;
  if (dbError !== null) {
    tier = "terrible";
  } else if (pool.waitingCount > 0 || (dbLatencyMs !== null && dbLatencyMs > LATENCY_BAD_MS)) {
    tier = "bad";
  } else if (dbLatencyMs !== null && dbLatencyMs > LATENCY_OK_MS) {
    tier = "ok";
  } else {
    tier = "healthy";
  }

  return NextResponse.json({
    tier,
    db: {
      connected: dbError === null,
      latencyMs: dbLatencyMs,
      error: dbError,
      sizeBytes: dbSizeBytes,
      pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
    },
    ws: {
      connectedClients: wsClientCount,
    },
    checkedAt: new Date().toISOString(),
  });
}
