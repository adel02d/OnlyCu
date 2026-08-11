/**
 * Cripto para Cuba: USDT (TRC20) y TON
 * Genera dirección + QR y verifica via webhook o polling on-chain
 * Puedes usar NOWPayments, o verificar directo con TronScan / TON API
 */

export type CryptoCurrency = "USDT" | "TON";

export function getCryptoPaymentInfo(currency: CryptoCurrency, amountUSD: number) {
  // En prod convertir USD -> cripto con tasa del día
  const addresses: Record<CryptoCurrency, string> = {
    USDT: process.env.USDT_TRC20_ADDRESS || "TX... ejemplo USDT TRC20",
    TON: process.env.TON_ADDRESS || "EQ... ejemplo TON",
  };
  const networks: Record<CryptoCurrency, string> = {
    USDT: "TRC20 (Tron)",
    TON: "TON",
  };
  return {
    currency,
    network: networks[currency],
    address: addresses[currency],
    amountUSD,
    // Para mostrar QR en frontend
    qrPayload: `${currency.toLowerCase()}:${addresses[currency]}?amount=${amountUSD}`,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min para pagar
  };
}

// Verifica transacción (llamado desde webhook de NOWPayments o cron)
export async function verifyCryptoTx(txId: string, currency: CryptoCurrency): Promise<boolean> {
  // TODO: integrar con TronScan API o TON API
  // Ejemplo Tron: GET https://apilist.tronscan.org/api/transaction-info?hash=txId
  return true; // stub - en dev retorna true
}
