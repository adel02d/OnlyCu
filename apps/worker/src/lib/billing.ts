import Decimal from 'decimal.js';

import type { Bindings } from '../env';
import { addDays, id, now } from './base';
import { calculateUsdtFee, decimalText } from './money';
import { notify, notifyAdmins } from './notifications';
import { sendTelegramNotification } from './telegram-bot';

type CreatorForBilling = {
  user_id: string;
  status: 'ACTIVE' | 'PAYMENT_DUE' | 'SUSPENDED_OVERDUE' | 'CLOSED';
  billing_anchor_at: string;
  next_billing_at: string;
};

type ApprovedSale = { currency: string; amount: string };
type ExchangeRate = { currency: string; usdt_per_unit: string };

/** Run by the Cloudflare cron trigger and available to admins for reconciliation. */
export async function runBillingScheduler(env: Bindings): Promise<{
  cyclesCreated: number;
  invoicesIssued: number;
  creatorsSuspended: number;
}> {
  const timestamp = now();
  let cyclesCreated = 0;
  let invoicesIssued = 0;

  await env.DB.prepare(
    `UPDATE payment_claims
       SET status = 'EXPIRED', updated_at = ?
       WHERE status = 'AWAITING_TRANSFER' AND expires_at <= ?`,
  )
    .bind(timestamp, timestamp)
    .run();

  const dueCreators = await env.DB.prepare(
    `SELECT user_id, status, billing_anchor_at, next_billing_at
       FROM creator_profiles
       WHERE status IN ('ACTIVE', 'PAYMENT_DUE') AND next_billing_at <= ?`,
  )
    .bind(timestamp)
    .all<CreatorForBilling>();

  for (const creator of dueCreators.results) {
    const result = await createOrIssueCycle(env, creator);
    cyclesCreated += result.cycleCreated ? 1 : 0;
    invoicesIssued += result.invoiceIssued ? 1 : 0;
  }

  const overdue = await env.DB.prepare(
    `SELECT DISTINCT creator_id FROM platform_invoices
       WHERE status IN ('AWAITING_CREATOR_PAYMENT', 'PROOF_SUBMITTED', 'OVERDUE')
         AND due_at <= ?`,
  )
    .bind(timestamp)
    .all<{ creator_id: string }>();

  for (const row of overdue.results) {
    await env.DB.prepare(
      `UPDATE platform_invoices
         SET status = 'OVERDUE', updated_at = ?
         WHERE creator_id = ? AND status IN ('AWAITING_CREATOR_PAYMENT', 'PROOF_SUBMITTED') AND due_at <= ?`,
    )
      .bind(timestamp, row.creator_id, timestamp)
      .run();
    const suspension = await env.DB.prepare(
      `UPDATE creator_profiles
         SET status = 'SUSPENDED_OVERDUE', suspended_at = ?, updated_at = ?
         WHERE user_id = ? AND status != 'SUSPENDED_OVERDUE'`,
    )
      .bind(timestamp, timestamp, row.creator_id)
      .run();
    if (suspension.meta.changes) {
      await notify(env.DB, {
        userId: row.creator_id,
        type: 'CREATOR_SUSPENDED_OVERDUE',
        title: 'Cuenta de creador suspendida',
        body: 'La factura de comisión venció. Envía el comprobante USDT para solicitar reactivación.',
        entityType: 'creator_profile',
        entityId: row.creator_id,
      });
      await sendTelegramNotification(
        env,
        row.creator_id,
        'OnlyCu: tu cuenta de creador fue suspendida por una factura de plataforma vencida. Abre la Mini App para enviar el comprobante USDT.',
      );
    }
  }

  return { cyclesCreated, invoicesIssued, creatorsSuspended: overdue.results.length };
}

async function createOrIssueCycle(
  env: Bindings,
  creator: CreatorForBilling,
): Promise<{ cycleCreated: boolean; invoiceIssued: boolean }> {
  const timestamp = now();
  const outstanding = await env.DB.prepare(
    `SELECT id FROM platform_invoices
       WHERE creator_id = ? AND status IN ('AWAITING_CREATOR_PAYMENT', 'PROOF_SUBMITTED', 'OVERDUE')
       LIMIT 1`,
  )
    .bind(creator.user_id)
    .first<{ id: string }>();
  if (outstanding) return { cycleCreated: false, invoiceIssued: false };

  const cycle = await env.DB.prepare(
    `SELECT id, status FROM billing_cycles
       WHERE creator_id = ? AND period_start = ? AND period_end = ? LIMIT 1`,
  )
    .bind(creator.user_id, creator.billing_anchor_at, creator.next_billing_at)
    .first<{ id: string; status: string }>();

  const cycleId = cycle?.id ?? id();
  if (!cycle) {
    await env.DB.prepare(
      `INSERT INTO billing_cycles (id, creator_id, period_start, period_end, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'AWAITING_RATES', ?, ?)`,
    )
      .bind(
        cycleId,
        creator.user_id,
        creator.billing_anchor_at,
        creator.next_billing_at,
        timestamp,
        timestamp,
      )
      .run();
  }

  if (cycle?.status === 'INVOICED' || cycle?.status === 'PAID') {
    return { cycleCreated: !cycle, invoiceIssued: false };
  }

  const [sales, rates, setting] = await Promise.all([
    env.DB.prepare(
      `SELECT currency, amount FROM payment_claims
         WHERE creator_id = ? AND status = 'APPROVED' AND approved_at >= ? AND approved_at < ?`,
    )
      .bind(creator.user_id, creator.billing_anchor_at, creator.next_billing_at)
      .all<ApprovedSale>(),
    env.DB.prepare(
      `SELECT currency, usdt_per_unit FROM platform_exchange_rates`,
    ).all<ExchangeRate>(),
    env.DB.prepare(`SELECT commission_bps FROM platform_settings WHERE id = 1`).first<{
      commission_bps: number;
    }>(),
  ]);

  const totals = groupSalesByCurrency(sales.results);
  if (Object.keys(totals).length === 0) {
    await env.DB.prepare(`UPDATE billing_cycles SET status = 'PAID', updated_at = ? WHERE id = ?`)
      .bind(timestamp, cycleId)
      .run();
    await moveCreatorBillingWindow(env.DB, creator, timestamp);
    return { cycleCreated: !cycle, invoiceIssued: false };
  }

  const ratesByCurrency = new Map(rates.results.map((rate) => [rate.currency, rate.usdt_per_unit]));
  const missingRates = Object.keys(totals).filter((currency) => !ratesByCurrency.has(currency));
  if (missingRates.length > 0) {
    if (!cycle) {
      await notifyAdmins(env.DB, {
        type: 'PLATFORM_RATE_REQUIRED',
        title: 'Falta tasa USDT para facturación',
        body: `El ciclo del creador ${creator.user_id} requiere tasas para: ${missingRates.join(', ')}.`,
        entityType: 'billing_cycle',
        entityId: cycleId,
      });
    }
    return { cycleCreated: !cycle, invoiceIssued: false };
  }

  const commissionBps = setting?.commission_bps ?? 1000;
  let totalFeeUsdt = new Decimal(0);
  const lines: Array<{
    currency: string;
    grossAmount: string;
    rate: string;
    grossUsdt: string;
    feeUsdt: string;
  }> = [];

  for (const [currency, amount] of Object.entries(totals)) {
    const rate = ratesByCurrency.get(currency)!;
    const result = calculateUsdtFee({
      sourceAmount: amount,
      usdtPerUnit: rate,
      commissionBps,
    });
    totalFeeUsdt = totalFeeUsdt.plus(result.feeUsdt);
    lines.push({
      currency,
      grossAmount: decimalText(amount),
      rate: decimalText(rate),
      grossUsdt: decimalText(result.grossUsdt),
      feeUsdt: decimalText(result.feeUsdt),
    });
  }

  const invoiceId = id();
  const dueAt = addDays(new Date(), 5);
  const destination = JSON.stringify({
    method: 'USDT',
    network: env.PLATFORM_USDT_NETWORK,
    address: env.PLATFORM_USDT_ADDRESS,
  });
  const nextWindowAnchor = creator.next_billing_at;
  const followingDue = addDays(new Date(creator.next_billing_at), 30);

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`DELETE FROM billing_cycle_lines WHERE cycle_id = ?`).bind(cycleId),
    ...lines.map((line) =>
      env.DB.prepare(
        `INSERT INTO billing_cycle_lines (
            id, cycle_id, source_currency, gross_amount, usdt_rate_snapshot, gross_usdt,
            platform_fee_usdt, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id(),
        cycleId,
        line.currency,
        line.grossAmount,
        line.rate,
        line.grossUsdt,
        line.feeUsdt,
        timestamp,
      ),
    ),
    env.DB.prepare(
      `INSERT INTO platform_invoices (
          id, cycle_id, creator_id, amount_usdt, network, platform_recipient_snapshot,
          status, notified_at, due_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'AWAITING_CREATOR_PAYMENT', ?, ?, ?, ?)`,
    ).bind(
      invoiceId,
      cycleId,
      creator.user_id,
      decimalText(totalFeeUsdt),
      env.PLATFORM_USDT_NETWORK,
      destination,
      timestamp,
      dueAt,
      timestamp,
      timestamp,
    ),
    env.DB.prepare(
      `UPDATE billing_cycles SET status = 'INVOICED', updated_at = ? WHERE id = ?`,
    ).bind(timestamp, cycleId),
    env.DB.prepare(
      `UPDATE creator_profiles
         SET status = 'PAYMENT_DUE', billing_anchor_at = ?, next_billing_at = ?, updated_at = ?
         WHERE user_id = ?`,
    ).bind(nextWindowAnchor, followingDue, timestamp, creator.user_id),
  ];
  await env.DB.batch(statements);

  await notify(env.DB, {
    userId: creator.user_id,
    type: 'PLATFORM_INVOICE_ISSUED',
    title: 'Factura de comisión de plataforma',
    body: `Debes pagar ${decimalText(totalFeeUsdt)} USDT antes de ${dueAt}. Sube la captura al completar la transferencia.`,
    entityType: 'platform_invoice',
    entityId: invoiceId,
  });
  await sendTelegramNotification(
    env,
    creator.user_id,
    `OnlyCu: tienes una factura de ${decimalText(totalFeeUsdt)} USDT pendiente. Vence el ${dueAt}. Abre la Mini App para ver las instrucciones y enviar el comprobante.`,
  );
  await notifyAdmins(env.DB, {
    type: 'PLATFORM_INVOICE_ISSUED',
    title: 'Factura de creador emitida',
    body: `Se emitió una factura de ${decimalText(totalFeeUsdt)} USDT para el creador ${creator.user_id}.`,
    entityType: 'platform_invoice',
    entityId: invoiceId,
  });

  return { cycleCreated: !cycle, invoiceIssued: true };
}

async function moveCreatorBillingWindow(
  db: D1Database,
  creator: CreatorForBilling,
  timestamp: string,
) {
  await db
    .prepare(
      `UPDATE creator_profiles
       SET billing_anchor_at = ?, next_billing_at = ?, status = 'ACTIVE', updated_at = ?
       WHERE user_id = ?`,
    )
    .bind(
      creator.next_billing_at,
      addDays(new Date(creator.next_billing_at), 30),
      timestamp,
      creator.user_id,
    )
    .run();
}

function groupSalesByCurrency(sales: ApprovedSale[]): Record<string, Decimal> {
  return sales.reduce<Record<string, Decimal>>((totals, sale) => {
    totals[sale.currency] = (totals[sale.currency] ?? new Decimal(0)).plus(sale.amount);
    return totals;
  }, {});
}

export async function reactivateCreatorIfClear(env: Bindings, creatorId: string) {
  const outstanding = await env.DB.prepare(
    `SELECT id FROM platform_invoices
       WHERE creator_id = ? AND status IN ('AWAITING_CREATOR_PAYMENT', 'PROOF_SUBMITTED', 'OVERDUE')
       LIMIT 1`,
  )
    .bind(creatorId)
    .first<{ id: string }>();
  if (outstanding) return false;

  await env.DB.prepare(
    `UPDATE creator_profiles
       SET status = 'ACTIVE', suspended_at = NULL, updated_at = ?
       WHERE user_id = ?`,
  )
    .bind(now(), creatorId)
    .run();
  await notify(env.DB, {
    userId: creatorId,
    type: 'CREATOR_REACTIVATED',
    title: 'Cuenta de creador reactivada',
    body: 'El administrador aprobó tu pago de plataforma. Tu contenido puede volver a venderse.',
    entityType: 'creator_profile',
    entityId: creatorId,
  });
  await sendTelegramNotification(
    env,
    creatorId,
    'OnlyCu: el administrador aprobó tu pago de plataforma y tu cuenta de creador fue reactivada.',
  );
  return true;
}
