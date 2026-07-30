import type { PoolClient } from "pg";

export const MAX_EVENTS_PER_SENDER = 50;
export const MAX_EVENT_STORAGE_BYTES_PER_SENDER = 100 * 1024 * 1024;

export class EventQuotaError extends Error {
  readonly reason: "event-count" | "storage";

  constructor(reason: "event-count" | "storage") {
    super(
      reason === "event-count"
        ? `Each sender can store up to ${MAX_EVENTS_PER_SENDER} invitations.`
        : "Each sender can store up to 100 MB of invitation data.",
    );
    this.name = "EventQuotaError";
    this.reason = reason;
  }
}

export async function lockSenderEventQuota(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`event-quota:${userId}`],
  );
}

export async function assertSenderEventQuota(client: PoolClient, userId: string): Promise<void> {
  const result = await client.query<{ event_count: number; storage_bytes: string }>(
    `SELECT
       COUNT(*)::int AS event_count,
       COALESCE(SUM(octet_length(to_jsonb(events)::text)), 0)::bigint::text AS storage_bytes
     FROM events
     WHERE created_by = $1`,
    [userId],
  );
  const usage = result.rows[0];
  if ((usage?.event_count ?? 0) > MAX_EVENTS_PER_SENDER) {
    throw new EventQuotaError("event-count");
  }
  if (Number(usage?.storage_bytes ?? 0) > MAX_EVENT_STORAGE_BYTES_PER_SENDER) {
    throw new EventQuotaError("storage");
  }
}