import { id, now } from './base';

export async function notify(
  db: D1Database,
  input: {
    userId: string;
    type: string;
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
  },
) {
  await db
    .prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, entity_type, entity_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id(),
      input.userId,
      input.type,
      input.title,
      input.body,
      input.entityType ?? null,
      input.entityId ?? null,
      now(),
    )
    .run();
}

export async function notifyAdmins(
  db: D1Database,
  input: Omit<Parameters<typeof notify>[1], 'userId'>,
) {
  const admins = await db
    .prepare(`SELECT user_id FROM user_roles WHERE role IN ('ADMIN', 'MODERATOR')`)
    .all<{ user_id: string }>();
  await Promise.all(admins.results.map((admin) => notify(db, { ...input, userId: admin.user_id })));
}
