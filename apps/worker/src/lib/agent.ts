import {
  type AgentProduct,
  type DeliveryZone,
  findProducts,
  findZoneMentions,
  formatCup,
  formatUsd,
  normalizeText,
  productLabel,
} from './agent-catalog';

export type AgentChannel = 'WEB' | 'WHATSAPP' | 'MESSENGER';
export type PaymentChoice = 'EFECTIVO' | 'TRANSFERENCIA';
export type ConversationStatus = 'OPEN' | 'WAITING_HUMAN' | 'CLOSED';
export type AgentStage =
  | 'NEW'
  | 'BROWSING'
  | 'AWAITING_ORDER_DETAILS'
  | 'AWAITING_MISSING_FIELDS'
  | 'COMPLETED'
  | 'HANDOFF';

export type OrderDraft = {
  customerName?: string;
  productId?: string;
  productLabel?: string;
  quantity?: number;
  address?: string;
  paymentMethod?: PaymentChoice;
};

export type AgentReply =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; caption?: string }
  | { type: 'ticket'; text: string; order: CreatedOrder };

export type CreatedOrder = {
  customerName: string;
  productLabel: string;
  productId?: string;
  quantity: number;
  address: string;
  paymentMethod: PaymentChoice;
  ticketText: string;
};

export type AgentContext = {
  catalog: AgentProduct[];
  zones: DeliveryZone[];
  stage: AgentStage;
  draft: OrderDraft;
  status: ConversationStatus;
  displayName?: string;
};

export type AgentTurnResult = {
  replies: AgentReply[];
  stage: AgentStage;
  draft: OrderDraft;
  status: ConversationStatus;
  order?: CreatedOrder;
};

const WORD_NUMBERS: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
};

const UNSUPPORTED_PAYMENTS =
  /\b(zelle|paypal|crypto|cripto|bitcoin|usdt|ton|qvapay|stripe|western union|bizum|apple pay|google pay)\b/i;

export function formatOrderTicket(order: Omit<CreatedOrder, 'ticketText'>): string {
  const payment = order.paymentMethod === 'EFECTIVO' ? 'Efectivo' : 'Transferencia';
  return [
    '--------------------------------------------------',
    '⚡ TICKET DE PEDIDO - ENERGIXCU ⚡',
    `- Cliente: ${order.customerName}`,
    `- Producto: ${order.productLabel}`,
    `- Cantidad: ${order.quantity}`,
    `- Dirección: ${order.address}`,
    `- Forma de pago: ${payment}`,
    '--------------------------------------------------',
  ].join('\n');
}

export function paymentLabel(method: PaymentChoice): string {
  return method === 'EFECTIVO' ? 'Efectivo' : 'Transferencia';
}

export function missingDraftFields(draft: OrderDraft): Array<keyof OrderDraft> {
  const missing: Array<keyof OrderDraft> = [];
  if (!draft.customerName) missing.push('customerName');
  if (!draft.productLabel) missing.push('productLabel');
  if (!draft.quantity) missing.push('quantity');
  if (!draft.address) missing.push('address');
  if (!draft.paymentMethod) missing.push('paymentMethod');
  return missing;
}

export function handleAgentTurn(text: string, context: AgentContext): AgentTurnResult {
  const incoming = text.trim().slice(0, 2000);
  const normalized = normalizeText(incoming);

  if (context.status === 'WAITING_HUMAN' && !wantsToContinueWithJose(normalized)) {
    return {
      replies: [
        textReply(
          'Tu conversación ya está con un especialista humano de EnergixCu. En breve te escriben por este mismo chat. 👨‍💻\n\n¿Quieres que *Jose* retome la atención mientras tanto?',
        ),
      ],
      stage: 'HANDOFF',
      draft: context.draft,
      status: 'WAITING_HUMAN',
    };
  }

  if (isPromptLeak(normalized)) {
    return browsing(
      context,
      textReply(
        'Soy *Jose*, el asesor de *EnergixCu*. Puedo ayudarte con paneles, baterías, inversores y kits. ⚡\n\n¿Qué equipo te interesa hoy?',
      ),
    );
  }

  if (wantsHuman(normalized)) {
    return {
      replies: [
        textReply(
          'Con gusto te transfiero con uno de nuestros especialistas humanos de EnergixCu para que te atienda directamente. Un momento, por favor. 👨‍💻',
        ),
      ],
      stage: 'HANDOFF',
      draft: context.draft,
      status: 'WAITING_HUMAN',
    };
  }

  if (isGreeting(normalized) && context.stage === 'NEW') {
    return {
      replies: [textReply(welcomeMessage(context.displayName))],
      stage: 'BROWSING',
      draft: context.draft,
      status: 'OPEN',
    };
  }

  if (asksUnsupportedPayment(incoming) && !detectPayment(incoming)) {
    return browsing(
      context,
      textReply(
        'Solo trabajamos con *efectivo* (contra entrega) y *transferencia* por Transfermóvil, EnZona o tarjeta MLC/CUP. 💳\n\n¿Cuál de esas dos formas te resulta mejor?',
      ),
    );
  }

  const mergedDraft = mergeDraft(context.draft, extractDraft(incoming, context));
  const buyIntent = wantsToBuy(normalized) || context.stage.startsWith('AWAITING');
  const complete = missingDraftFields(mergedDraft).length === 0;

  if (
    complete &&
    (buyIntent || context.stage.startsWith('AWAITING') || looksLikeOrderForm(incoming))
  ) {
    const order = toCreatedOrder(mergedDraft);
    return {
      replies: [
        { type: 'ticket', text: order.ticketText, order },
        textReply(
          '¡Listo! Tu pedido ha sido registrado con éxito en EnergixCu. Nos pondremos en contacto contigo a la brevedad para coordinar la entrega. 🚀',
        ),
      ],
      stage: 'COMPLETED',
      draft: {},
      status: 'OPEN',
      order,
    };
  }

  if (buyIntent) {
    const missing = missingDraftFields(mergedDraft);
    if (missing.length === 5) {
      return {
        replies: [textReply(askAllFiveFields(mergedDraft, context.catalog))],
        stage: 'AWAITING_ORDER_DETAILS',
        draft: mergedDraft,
        status: 'OPEN',
      };
    }
    return {
      replies: [textReply(askMissingFields(mergedDraft, missing))],
      stage: 'AWAITING_MISSING_FIELDS',
      draft: mergedDraft,
      status: 'OPEN',
    };
  }

  if (asksZones(normalized)) {
    return browsing(context, textReply(zonesMessage(context.zones)));
  }

  if (asksNewProducts(normalized)) {
    const featured = context.catalog.filter((product) => product.isNew && product.inStock);
    return browsing(
      context,
      ...productReplies(featured.slice(0, 4), 'Estos son los *productos nuevos del día*: ☀️'),
    );
  }

  if (asksCatalog(normalized)) {
    const featured = context.catalog.filter((product) => product.inStock).slice(0, 6);
    return browsing(
      context,
      ...productReplies(
        featured,
        'Este es un recorte del catálogo *EnergixCu*. Precios en *USD* y *CUP*. ⚡',
      ),
    );
  }

  const matches = findProducts(context.catalog, incoming);
  if (matches.length > 0) {
    const focused = matches.slice(0, asksForImage(normalized) ? 1 : 3);
    const intro =
      focused.length === 1
        ? `Te detallo el *${productLabel(focused[0]!)}*: 🔋`
        : 'Encontré estas opciones para ti: ☀️';
    const replies = productReplies(focused, intro);
    if (asksForImage(normalized) && focused[0]?.imagePath) {
      replies.splice(1, 0, {
        type: 'image',
        url: focused[0].imagePath,
        caption: productLabel(focused[0]),
      });
    }
    const nextDraft =
      focused.length === 1
        ? { ...mergedDraft, productId: focused[0]!.id, productLabel: productLabel(focused[0]!) }
        : mergedDraft;
    return {
      replies,
      stage: 'BROWSING',
      draft: nextDraft,
      status: 'OPEN',
    };
  }

  if (isGreeting(normalized)) {
    return browsing(context, textReply(welcomeMessage(context.displayName)));
  }

  return browsing(
    context,
    textReply(
      'Puedo ayudarte con *paneles*, *baterías LiFePO4*, *inversores*, *kits* y *respaldos*. ⚡\n\nDime el uso (nevera, casa completa, lámparas) o el modelo que buscas y te paso precio. ¿Qué necesitas?',
    ),
  );
}

function browsing(context: AgentContext, ...replies: AgentReply[]): AgentTurnResult {
  return {
    replies,
    stage:
      context.stage === 'NEW'
        ? 'BROWSING'
        : context.stage === 'HANDOFF'
          ? 'BROWSING'
          : context.stage,
    draft: context.draft,
    status: 'OPEN',
  };
}

function textReply(text: string): AgentReply {
  return { type: 'text', text };
}

export function welcomeMessage(displayName?: string): string {
  const hello = displayName ? `Hola ${displayName.split(' ')[0]},` : 'Hola,';
  return `${hello} soy *Jose* de *EnergixCu*. ⚡\n\nTe ayudo con *energía solar*, *baterías*, *respaldos* y *accesorios*. Trabajamos con *efectivo* y *transferencia*.\n\n¿Qué estás buscando hoy? ☀️`;
}

function askAllFiveFields(draft: OrderDraft, catalog: AgentProduct[]): string {
  const hinted = draft.productLabel
    ? `Si te sirve, el producto puede ser *${draft.productLabel}*.`
    : catalog.find((product) => product.isNew)
      ? 'Si aún no tienes modelo, dime por ejemplo *Panel 550W* o *Kit 3.3 kW*.'
      : 'Indica el modelo exacto.';
  return `Perfecto, para registrar el pedido necesito estos *5 datos* en un solo mensaje: ✅\n\n• Nombre completo\n• Producto y modelo exacto\n• Cantidad\n• Dirección exacta (municipio, reparto y punto de referencia)\n• Forma de pago (*Efectivo* o *Transferencia*)\n\n${hinted} ¿Me los envías ahora?`;
}

function askMissingFields(draft: OrderDraft, missing: Array<keyof OrderDraft>): string {
  const labels: Record<keyof OrderDraft, string> = {
    customerName: 'nombre completo',
    productId: 'producto',
    productLabel: 'producto y modelo exacto',
    quantity: 'cantidad',
    address: 'dirección exacta (municipio, reparto y referencia)',
    paymentMethod: 'forma de pago (*Efectivo* o *Transferencia*)',
  };
  const known = [
    draft.customerName ? `Cliente: *${draft.customerName}*` : undefined,
    draft.productLabel ? `Producto: *${draft.productLabel}*` : undefined,
    draft.quantity ? `Cantidad: *${draft.quantity}*` : undefined,
    draft.address ? `Dirección: *${draft.address}*` : undefined,
    draft.paymentMethod ? `Pago: *${paymentLabel(draft.paymentMethod)}*` : undefined,
  ].filter((value): value is string => Boolean(value));
  const needed = missing
    .filter((field) => field !== 'productId')
    .map((field) => labels[field])
    .filter(Boolean);
  const summary = known.length ? `${known.join('\n')}\n\n` : '';
  return `${summary}Me faltan estos datos para cerrar el ticket: *${needed.join(', ')}*. 📦\n\n¿Me los confirmas en un mensaje?`;
}

function productReplies(products: AgentProduct[], intro: string): AgentReply[] {
  if (products.length === 0) {
    return [
      textReply(
        'Ahora mismo no tengo ese modelo en el catálogo activo. ⚡\n\n¿Quieres que te muestre *paneles*, *baterías* o *kits* disponibles?',
      ),
    ];
  }
  const cards = products
    .map((product) => {
      const specs = product.specs
        .slice(0, 3)
        .map((spec) => `• ${spec}`)
        .join('\n');
      return `*${productLabel(product)}*\n${specs}\nPrecio: *${formatUsd(product.priceUsd)}* · ${formatCup(product.priceCup)}${product.isNew ? '\n🆕 Producto nuevo del día' : ''}`;
    })
    .join('\n\n');
  return [textReply(`${intro}\n\n${cards}\n\n¿Quieres ficha, foto o lo dejamos en pedido? 📦`)];
}

function zonesMessage(zones: DeliveryZone[]): string {
  const habana = zones
    .filter((zone) => zone.province === 'habana')
    .map((zone) => zone.municipality);
  const others = [
    ...new Set(zones.filter((zone) => zone.province !== 'habana').map((zone) => zone.municipality)),
  ];
  return `Entregamos en toda *La Habana* (${habana.slice(0, 6).join(', ')} y más) y también en *${others.slice(0, 5).join(', ')}*. 📦\n\n¿En qué municipio te queda mejor recibir?`;
}

function extractDraft(text: string, context: AgentContext): OrderDraft {
  const draft: OrderDraft = {};
  const payment = detectPayment(text);
  if (payment) draft.paymentMethod = payment;

  const quantity = detectQuantity(text);
  if (quantity) draft.quantity = quantity;

  const products = findProducts(context.catalog, text);
  if (
    products[0] &&
    (looksLikeOrderForm(text) || wantsToBuy(normalizeText(text)) || products.length === 1)
  ) {
    draft.productId = products[0].id;
    draft.productLabel = productLabel(products[0]);
  } else if (!products[0]) {
    const labeled = detectFreeProductLabel(text);
    if (labeled) draft.productLabel = labeled;
  }

  const address = detectAddress(text, context.zones);
  if (address) draft.address = address;

  const name = detectName(text, draft);
  if (name) draft.customerName = name;

  return draft;
}

function mergeDraft(base: OrderDraft, incoming: OrderDraft): OrderDraft {
  return {
    customerName: incoming.customerName ?? base.customerName,
    productId: incoming.productId ?? base.productId,
    productLabel: incoming.productLabel ?? base.productLabel,
    quantity: incoming.quantity ?? base.quantity,
    address: incoming.address ?? base.address,
    paymentMethod: incoming.paymentMethod ?? base.paymentMethod,
  };
}

function toCreatedOrder(draft: OrderDraft): CreatedOrder {
  const order = {
    customerName: draft.customerName!,
    productLabel: draft.productLabel!,
    productId: draft.productId,
    quantity: draft.quantity!,
    address: draft.address!,
    paymentMethod: draft.paymentMethod!,
  };
  return { ...order, ticketText: formatOrderTicket(order) };
}

function detectPayment(text: string): PaymentChoice | undefined {
  const normalized = normalizeText(text);
  if (/\b(efectivo|cash|contra entrega|en mano)\b/.test(normalized)) return 'EFECTIVO';
  if (/\b(transferencia|transfermovil|enzona|mlc|tarjeta cup|transfer)\b/.test(normalized)) {
    return 'TRANSFERENCIA';
  }
  return undefined;
}

function detectQuantity(text: string): number | undefined {
  const labeled = text.match(/(?:cantidad|unidades?|qty)\s*[:.\-]?\s*(\d{1,3})/i);
  if (labeled?.[1]) {
    const value = Number(labeled[1]);
    if (value >= 1 && value <= 200) return value;
  }
  const units = text.match(/\b(\d{1,3})\s*(unidades?|kits?|paneles?|baterias?|baterías?|pcs?)\b/i);
  if (units?.[1]) {
    const value = Number(units[1]);
    if (value >= 1 && value <= 200) return value;
  }
  const normalized = normalizeText(text);
  for (const [word, value] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b`).test(normalized)) return value;
  }
  if (looksLikeOrderForm(text)) {
    const lines = splitLines(text);
    for (const line of lines) {
      if (/^\d{1,3}$/.test(line.trim())) {
        const value = Number(line.trim());
        if (value >= 1 && value <= 200) return value;
      }
    }
  }
  return undefined;
}

function detectAddress(text: string, zones: DeliveryZone[]): string | undefined {
  const labeled = text.match(/(?:direccion|dirección|entrega|envio|envío)\s*[:.\-]?\s*(.+)$/im);
  if (labeled?.[1] && labeled[1].trim().length >= 8) {
    return cleanLine(stripTrailingPayment(labeled[1]));
  }

  const mentions = findZoneMentions(zones, text);
  if (mentions.length > 0) {
    const lines = splitLines(text);
    const matchedLine = lines.find((line) => findZoneMentions(zones, line).length > 0);
    if (matchedLine && matchedLine.length >= 8) return cleanLine(stripTrailingPayment(matchedLine));
    if (text.length >= 12 && text.length <= 240 && !looksLikeOrderForm(text)) {
      return cleanLine(stripTrailingPayment(text));
    }
  }

  if (looksLikeOrderForm(text)) {
    const addressLine = splitLines(text).find((line) =>
      /\b(calle|entre|reparto|municipio|edificio|apto|apartamento|esquina|avenida|#|no\.)\b/i.test(
        line,
      ),
    );
    if (addressLine) return cleanLine(addressLine);
  }
  return undefined;
}

function detectName(text: string, draft: OrderDraft): string | undefined {
  const labeled = text.match(
    /(?:nombre|me llamo|soy)\s*[:.\-]?\s*([a-záéíóúñü]+(?:\s+[a-záéíóúñü]+){1,4})/i,
  );
  if (labeled?.[1] && !isReservedName(labeled[1])) return titleCase(labeled[1]);

  if (looksLikeOrderForm(text)) {
    const first = splitLines(text)[0];
    if (first && looksLikePersonName(first) && first !== draft.productLabel)
      return titleCase(first);
  }
  return undefined;
}

function detectFreeProductLabel(text: string): string | undefined {
  const labeled = text.match(/(?:producto|modelo)\s*[:.\-]?\s*(.+)$/im);
  if (labeled?.[1] && labeled[1].trim().length >= 4) return cleanLine(labeled[1]);
  return undefined;
}

function looksLikeOrderForm(text: string): boolean {
  return splitLines(text).length >= 4;
}

function looksLikePersonName(value: string): boolean {
  const cleaned = cleanLine(value);
  if (cleaned.length < 5 || cleaned.length > 80) return false;
  if (/\d/.test(cleaned)) return false;
  if (isReservedName(cleaned)) return false;
  return /^[a-záéíóúñü]+(?:\s+[a-záéíóúñü]+){1,4}$/i.test(cleaned);
}

function isReservedName(value: string): boolean {
  return /\b(efectivo|transferencia|panel|kit|bateria|batería|inversor|calle|reparto|municipio)\b/i.test(
    value,
  );
}

function wantsToBuy(normalized: string): boolean {
  if (
    /\bquiero (ver|ver el|info|informacion|saber|conocer|fotos?|precio|precios)\b/.test(normalized)
  ) {
    return false;
  }
  return /\b(quiero comprar|quiero encargar|lo quiero|me lo quedo|comprar|compra|pedido|encargar|lo llevo|cierrame|cierra el|apartar|reservar|quiero un|quiero una|quiero el|quiero la|quiero \d+)\b/.test(
    normalized,
  );
}

function wantsHuman(normalized: string): boolean {
  return /\b(persona|humano|especialista humano|agente humano|supervisor|reclamo|queja|operador|hablar con alguien)\b/.test(
    normalized,
  );
}

function wantsToContinueWithJose(normalized: string): boolean {
  return /\b(jose|sigue tu|continua tu|continúa tu|mejor tu|el bot)\b/.test(normalized);
}

function isGreeting(normalized: string): boolean {
  return /^(hola|buenas|buenos dias|buenas tardes|buenas noches|saludos|hey|menu|menú|start|inicio|hi|hello)\b/.test(
    normalized,
  );
}

function asksCatalog(normalized: string): boolean {
  return /\b(catalogo|catálogo|lista|precios|que tienen|qué tienen|opciones|productos)\b/.test(
    normalized,
  );
}

function asksNewProducts(normalized: string): boolean {
  return /\b(nuevos del dia|nuevos del día|novedades|productos nuevos)\b/.test(normalized);
}

function asksZones(normalized: string): boolean {
  return /\b(entregan|entrega|envios|envíos|municipio|habana|zonas)\b/.test(normalized);
}

function asksForImage(normalized: string): boolean {
  return /\b(foto|fotos|imagen|imagenes|imágenes|ficha|picture)\b/.test(normalized);
}

function asksUnsupportedPayment(text: string): boolean {
  return UNSUPPORTED_PAYMENTS.test(text);
}

function isPromptLeak(normalized: string): boolean {
  return /\b(prompt|instrucciones|system prompt|que modelo|qué modelo|eres una ia|eres un modelo)\b/.test(
    normalized,
  );
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n|•|- /)
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripTrailingPayment(value: string): string {
  return value.replace(/(?:,\s*)?(?:pago(?:\s+por)?|forma de pago)\s*[:.\-]?\s*.+$/i, '');
}

function cleanLine(value: string): string {
  return value
    .replace(/^[\s•\-–]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function titleCase(value: string): string {
  return cleanLine(value)
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}
