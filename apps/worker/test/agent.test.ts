import { describe, expect, it } from 'vitest';

import { formatOrderTicket, handleAgentTurn, welcomeMessage } from '../src/lib/agent';
import { SEED_PRODUCTS, SEED_ZONES } from '../src/lib/agent-catalog';
import { parseMessengerPayload } from '../src/lib/messenger';
import { parseWhatsAppPayload } from '../src/lib/whatsapp';

function turn(text: string, extras?: Partial<Parameters<typeof handleAgentTurn>[1]>) {
  return handleAgentTurn(text, {
    catalog: SEED_PRODUCTS,
    zones: SEED_ZONES,
    stage: extras?.stage ?? 'NEW',
    draft: extras?.draft ?? {},
    status: extras?.status ?? 'OPEN',
    displayName: extras?.displayName,
  });
}

describe('Jose sales agent', () => {
  it('greets as Jose from EnergixCu', () => {
    const result = turn('Hola');
    expect(result.replies[0]).toMatchObject({ type: 'text' });
    expect(result.replies[0]?.type === 'text' && result.replies[0].text).toContain('Jose');
    expect(result.replies[0]?.type === 'text' && result.replies[0].text).toContain('EnergixCu');
    expect(result.stage).toBe('BROWSING');
  });

  it('lists catalog products with prices', () => {
    const result = turn('quiero ver el catálogo');
    const body = result.replies[0]?.type === 'text' ? result.replies[0].text : '';
    expect(body).toContain('Energix 550W');
    expect(body).toContain('$85 USD');
  });

  it('rejects unsupported payment rails', () => {
    const result = turn('puedo pagar con PayPal?');
    const body = result.replies[0]?.type === 'text' ? result.replies[0].text : '';
    expect(body).toMatch(/efectivo/i);
    expect(body).toMatch(/transferencia/i);
    expect(body).not.toMatch(/paypal/i);
  });

  it('asks for the five required fields after purchase intent', () => {
    const result = turn('quiero comprar');
    const body = result.replies[0]?.type === 'text' ? result.replies[0].text : '';
    expect(body).toContain('Nombre completo');
    expect(body).toContain('Producto y modelo exacto');
    expect(body).toContain('Cantidad');
    expect(body).toContain('Dirección exacta');
    expect(body).toContain('Forma de pago');
    expect(result.stage).toBe('AWAITING_ORDER_DETAILS');
  });

  it('creates the official ticket from a multiline order', () => {
    const first = turn('quiero comprar');
    const result = handleAgentTurn(
      [
        'Ana María López',
        'Panel solar 550W',
        '2',
        'Playa, Miramar, 5ta y 42 frente al hotel',
        'Efectivo',
      ].join('\n'),
      {
        catalog: SEED_PRODUCTS,
        zones: SEED_ZONES,
        stage: first.stage,
        draft: first.draft,
        status: 'OPEN',
      },
    );

    expect(result.order).toBeDefined();
    expect(result.order?.customerName).toBe('Ana María López');
    expect(result.order?.quantity).toBe(2);
    expect(result.order?.paymentMethod).toBe('EFECTIVO');
    expect(result.order?.ticketText).toBe(
      formatOrderTicket({
        customerName: result.order!.customerName,
        productLabel: result.order!.productLabel,
        quantity: result.order!.quantity,
        address: result.order!.address,
        paymentMethod: result.order!.paymentMethod,
      }),
    );
    expect(result.order?.ticketText).toContain('⚡ TICKET DE PEDIDO - ENERGIXCU ⚡');
    expect(result.order?.ticketText).toContain('- Forma de pago: Efectivo');
    expect(result.replies.some((reply) => reply.type === 'ticket')).toBe(true);
    const closing = result.replies.at(-1);
    expect(closing?.type === 'text' && closing.text).toContain('registrado con éxito');
  });

  it('creates a ticket from a prose order', () => {
    const result = turn(
      'Me llamo Juan Perez, quiero 1 kit solar 3kw, entrega en Plaza de la Revolución reparto Vedado edificio 12, pago por transferencia',
    );
    expect(result.order?.customerName).toBe('Juan Perez');
    expect(result.order?.quantity).toBe(1);
    expect(result.order?.paymentMethod).toBe('TRANSFERENCIA');
    expect(result.order?.productLabel.toLowerCase()).toContain('3.3');
  });

  it('hands off to a human specialist', () => {
    const result = turn('quiero hablar con una persona');
    expect(result.status).toBe('WAITING_HUMAN');
    const body = result.replies[0]?.type === 'text' ? result.replies[0].text : '';
    expect(body).toContain('especialistas humanos de EnergixCu');
  });

  it('matches a battery and keeps a CTA', () => {
    const result = turn('foto de la batería 24v 200ah');
    expect(result.draft.productId).toBe('prod_bat_200');
    expect(result.replies.some((reply) => reply.type === 'image')).toBe(true);
  });

  it('exposes a stable welcome copy', () => {
    expect(welcomeMessage('Luis')).toContain('Luis');
    expect(welcomeMessage()).toContain('Jose');
  });
});

describe('Meta channel parsers', () => {
  it('reads WhatsApp text messages', () => {
    const inbound = parseWhatsAppPayload({
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: '5355551111', profile: { name: 'Carla' } }],
                messages: [
                  { id: 'wamid.1', from: '5355551111', type: 'text', text: { body: 'Hola' } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(inbound).toEqual([
      { messageId: 'wamid.1', from: '5355551111', text: 'Hola', profileName: 'Carla' },
    ]);
  });

  it('reads Messenger text messages and ignores echoes', () => {
    const inbound = parseMessengerPayload({
      entry: [
        {
          messaging: [
            { sender: { id: 'psid-1' }, message: { mid: 'm1', text: 'Hola', is_echo: true } },
            { sender: { id: 'psid-1' }, message: { mid: 'm2', text: 'Quiero un panel' } },
          ],
        },
      ],
    });
    expect(inbound).toEqual([{ messageId: 'm2', senderId: 'psid-1', text: 'Quiero un panel' }]);
  });
});
