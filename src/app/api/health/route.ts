import { NextResponse } from "next/server";
import { headers as nextHeaders } from "next/headers";
import { pool } from "@/lib/db";
import { isLocalhostIp, clientIpFromHeaders } from "@/lib/network";

export type HealthTier = "healthy" | "ok" | "bad" | "terrible";

// Thresholds are on DB round-trip latency for a trivial `SELECT 1` -- the
// simplest available signal for "is Postgres actually responsive right now",
// distinct from whether the TCP connection itself is up (a slow/overloaded
// DB answers eventually; a dead one never does, which is what the DB_DOWN
// path below covers).
const LATENCY_OK_MS = 50;
const LATENCY_BAD_MS = 300;

export async function GET() {
  // This route has no auth gate on purpose -- the Settings pill's HealthPin
  // renders on every page, including public receiver pages, and needs a
  // "is the app up" signal without a session. But the app now binds to
  // 0.0.0.0 for LAN testing, so the *detailed* internals below (raw Postgres
  // error text, database size, connection-pool counts, live socket count)
  // would otherwise be readable by anyone on the network. Everyone gets the
  // tier and a connected boolean; only localhost gets the internals, which
  // matches HealthPin's own detailLevel="full" being an /admin/db-only prop.
  const headerList = await nextHeaders();
  const isLocal = isLocalhostIp(clientIpFromHeaders(headerList));

  const started = Date.now();
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;
  let dbSizeBytes: number | null = null;
  let imageStorageBytes: number | null = null;

  try {
    await pool.query("SELECT 1");
    dbLatencyMs = Date.now() - started;

    if (isLocal) {
      const sizeResult = await pool.query<{ size: string }>(
        "SELECT pg_database_size(current_database())::text AS size",
      );
      dbSizeBytes = Number(sizeResult.rows[0]?.size ?? null) || null;

      // card_image_url stores images as base64 data URLs (see "Image uploads"
      // in SYSTEM_MEMORY.md) -- there's no separate blob store, so "how much
      // storage do images take up" is just the summed byte length of that
      // column. octet_length on the text column measures the data URL's
      // encoded size (including the base64 overhead and the "data:...;base64,"
      // prefix), not the decoded image size -- close enough for a storage
      // dashboard, and avoids decoding every image on every health check.
      const imageSizeResult = await pool.query<{ size: string | null }>(
        "SELECT SUM(octet_length(card_image_url))::text AS size FROM events WHERE card_image_url IS NOT NULL",
      );
      imageStorageBytes = Number(imageSizeResult.rows[0]?.size ?? null) || 0;
    }
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
      // A raw Postgres error can name hosts, databases, roles, and file paths.
      // Off-machine callers get a fixed string; the real text stays local.
      error: dbError === null ? null : isLocal ? dbError : "Database unavailable",
      ...(isLocal
        ? {
            sizeBytes: dbSizeBytes,
            imageStorageBytes,
            pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
          }
        : {}),
    },
    ...(isLocal ? { ws: { connectedClients: wsClientCount } } : {}),
    checkedAt: new Date().toISOString(),
  });
}
