import type { Bindings } from '../env';

export async function sendTelegramNotification(
  env: Bindings,
  userId: string,
  text: string,
): Promise<boolean> {
  const user = await env.DB.prepare(`SELECT telegram_chat_id FROM users WHERE id = ? LIMIT 1`)
    .bind(userId)
    .first<{ telegram_chat_id: string | null }>();
  if (!user?.telegram_chat_id) return false;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: user.telegram_chat_id,
          text,
          disable_web_page_preview: true,
        }),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}
