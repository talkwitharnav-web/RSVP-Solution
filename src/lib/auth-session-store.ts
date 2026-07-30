import { initDb, pool } from "./db";

export type AuthSessionType = "admin" | "sender";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createAuthSession(
  type: AuthSessionType,
  userId: string | null,
  maxAgeSeconds: number,
): Promise<string> {
  await initDb();
  await pool.query(`DELETE FROM auth_sessions WHERE expires_at <= now()`);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO auth_sessions (session_type, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 * interval '1 second'))
     RETURNING id`,
    [type, userId, maxAgeSeconds],
  );
  return result.rows[0].id;
}

export async function isAuthSessionActive(
  sessionId: string,
  type: AuthSessionType,
  userId: string | null,
): Promise<boolean> {
  if (!UUID_RE.test(sessionId) || (userId !== null && !UUID_RE.test(userId))) return false;
  await initDb();
  const result = await pool.query(
    `SELECT 1
     FROM auth_sessions
     WHERE id = $1
       AND session_type = $2
       AND (($3::uuid IS NULL AND user_id IS NULL) OR user_id = $3::uuid)
       AND expires_at > now()`,
    [sessionId, type, userId],
  );
  return result.rows.length > 0;
}

export async function revokeAuthSession(sessionId: string, type: AuthSessionType): Promise<void> {
  if (!UUID_RE.test(sessionId)) return;
  await initDb();
  await pool.query(`DELETE FROM auth_sessions WHERE id = $1 AND session_type = $2`, [sessionId, type]);
}

export async function revokeUserAuthSessions(userId: string): Promise<void> {
  if (!UUID_RE.test(userId)) return;
  await initDb();
  await pool.query(`DELETE FROM auth_sessions WHERE session_type = 'sender' AND user_id = $1`, [userId]);
}