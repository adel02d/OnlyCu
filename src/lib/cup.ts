/**
 * Pesos Cubanos (CUP) - Transferencia manual con comprobante
 * 
 * Contexto Cuba: muchos usuarios dentro de la isla solo pueden pagar en CUP
 * via Transfermóvil / EnZona a tarjeta CUP del creador/plataforma.
 * 
 * Flujo:
 * 1. Usuario ve datos de la tarjeta CUP destino (de env) + monto en CUP
 * 2. Hace transferencia y guarda captura
 * 3. Sube captura via S3 presigned POST -> screenshotS3Key
 * 4. POST /api/payments/manual con { amount, transferRef, screenshotS3Key }
 * 5. Admin revisa en /admin -> POST /api/admin/manual-review { proofId, action: approve|reject }
 * 6. Si approve -> Payment COMPLETED y activa Subscription/Purchase
 */

export function getCupDestination() {
  return {
    cardNumber: process.env.CUP_CARD_NUMBER || "9225 9598 7XXX XXXX",
    cardHolder: process.env.CUP_CARD_HOLDER || "OnlyCu Plataforma",
    bank: "BANDEC / BPA / Metropolitano (Transfermóvil)",
    // Monto se calcula en frontend según tasa USD->CUP del día
    // Ej: subscription $9.99 USD * tasa 320 CUP/USD = 3196 CUP
    instructions: [
      "1. Abre Transfermóvil o EnZona",
      "2. Transfiere el monto exacto en CUP a la tarjeta de arriba",
      "3. Guarda la captura del comprobante (ID de transacción visible)",
      "4. Súbela aquí con los últimos 4 dígitos de la transacción",
      "5. Espera aprobación en <24h - no borres el SMS de confirmación",
    ],
  };
}

export function formatCup(amount: number): string {
  return `${amount.toLocaleString("es-CU")} CUP`;
}
