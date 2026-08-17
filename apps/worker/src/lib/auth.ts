import type { Context, Next } from 'hono';

import type { AppEnv, CurrentUser, Role } from '../env';
import { id, now } from './base';
import { issueSessionToken, verifySessionToken } from './crypto';

export async function authenticate(c: Context<AppEnv>, next: Next) {
  const authorization = c.req.header('Authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  if (!token) return c.json({ error: 'Authentication required' }, 401);

  const session = await verifySessionToken(token, c.env.JWT_SECRET);
  if (!session) return c.json({ error: 'Session expired or invalid' }, 401);

  const user = await loadCurrentUser(c.env.DB, session.sub);
  if (!user || user.status !== 'ACTIVE' || user.sessionVersion !== session.version) {
    return c.json({ error: 'Account unavailable' }, 401);
  }

  c.set('currentUser', user);
  await next();
}

export function currentUser(c: Context<AppEnv>): CurrentUser {
  const user = c.get('currentUser');
  if (!user) throw new Error('Authenticated user missing');
  return user;
}

export function requireRole(...roles: Role[]) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = currentUser(c);
    if (!roles.some((role) => user.roles.includes(role))) {
      return c.json({ error: 'Insufficient privileges' }, 403);
    }
    await next();
  };
}

export async function loadCurrentUser(
  db: D1Database,
  userId: string,
): Promise<CurrentUser | undefined> {
  const user = await db
    .prepare(
      `SELECT id, telegram_id, username, status, adult_declared_at, terms_accepted_at, session_version
       FROM users WHERE id = ? LIMIT 1`,
    )
    .bind(userId)
    .first<{
      id: string;
      telegram_id: string;
      username: string | null;
      status: CurrentUser['status'];
      adult_declared_at: string | null;
      terms_accepted_at: string | null;
      session_version: number;
    }>();
  if (!user) return undefined;

  const [rolesResult, profile] = await Promise.all([
    db.prepare('SELECT role FROM user_roles WHERE user_id = ?').bind(userId).all<{ role: Role }>(),
    db
      .prepare('SELECT status FROM creator_profiles WHERE user_id = ? LIMIT 1')
      .bind(userId)
      .first<{ status: NonNullable<CurrentUser['creatorStatus']> }>(),
  ]);

  return {
    id: user.id,
    telegramId: user.telegram_id,
    username: user.username ?? undefined,
    status: user.status,
    adultDeclaredAt: user.adult_declared_at,
    termsAcceptedAt: user.terms_accepted_at,
    sessionVersion: user.session_version,
    roles: rolesResult.results.map((row) => row.role),
    creatorStatus: profile?.status,
  };
}

export async function issueUserSession(
  env: AppEnv['Bindings'],
  user: CurrentUser,
): Promise<string> {
  return issueSessionToken(
    { sub: user.id, telegramId: user.telegramId, version: user.sessionVersion },
    env.JWT_SECRET,
  );
}

export async function audit(
  db: D1Database,
  input: {
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    ipHash?: string;
  },
) {
  await db
    .prepare(
      `INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, metadata_json, ip_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id(),
      input.actorUserId ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.ipHash ?? null,
      now(),
    )
    .run();
}
