'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchAgentCatalog,
  fetchAgentChannels,
  fetchAllOrders,
  fetchConversationOrders,
  sendAgentMessage,
  setDailyProducts,
  type AgentOrder,
  type AgentProduct,
  type AgentReply,
  type ChannelActivity,
  type ChannelStatus,
  type ChannelVerdict,
} from '../lib/agent-api';

type ChatItem = {
  id: string;
  role: 'user' | 'jose';
  replies: AgentReply[];
  text?: string;
};

type Tab = 'chat' | 'orders' | 'channels';

const STORAGE_KEY = 'energixcu-conversation-id';

export function EnergixAgentApp() {
  const [tab, setTab] = useState<Tab>('chat');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [conversationId, setConversationId] = useState<string>();
  const [items, setItems] = useState<ChatItem[]>([]);
  const [catalog, setCatalog] = useState<AgentProduct[]>([]);
  const [orders, setOrders] = useState<AgentOrder[]>([]);
  const [channels, setChannels] = useState<ChannelStatus>();
  const [adminKey, setAdminKey] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) ?? undefined;
    if (stored) setConversationId(stored);
    void fetchAgentCatalog()
      .then((result) => setCatalog(result.products))
      .catch(() => undefined);
    void fetchAgentChannels()
      .then(setChannels)
      .catch(() => undefined);
    setItems([
      {
        id: 'welcome',
        role: 'jose',
        replies: [
          {
            type: 'text',
            text: 'Hola, soy *Jose* de *EnergixCu*. ⚡\n\nTe atiendo por esta web, *WhatsApp* o *Messenger*. Pregúntame por paneles, baterías o kits.',
          },
        ],
      },
    ]);
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [items, busy]);

  const refreshOrders = useCallback(async (id?: string, key?: string) => {
    try {
      if (key) {
        const result = await fetchAllOrders(key);
        setOrders(result.orders);
        return;
      }
      if (id) {
        const result = await fetchConversationOrders(id);
        setOrders(result.orders);
      }
    } catch {
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    if (tab === 'orders') void refreshOrders(conversationId, adminKey || undefined);
    if (tab !== 'channels') return;
    const load = () =>
      fetchAgentChannels()
        .then(setChannels)
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [adminKey, conversationId, refreshOrders, tab]);

  const send = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      setError(undefined);
      setInput('');
      setItems((current) => [
        ...current,
        { id: `user-${Date.now()}`, role: 'user', replies: [], text: trimmed },
      ]);
      try {
        const result = await sendAgentMessage(trimmed, conversationId);
        setConversationId(result.conversationId);
        window.localStorage.setItem(STORAGE_KEY, result.conversationId);
        setItems((current) => [
          ...current,
          { id: `jose-${Date.now()}`, role: 'jose', replies: result.replies },
        ]);
        if (result.order) {
          void refreshOrders(result.conversationId, adminKey || undefined);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'No se pudo contactar al agente.');
      } finally {
        setBusy(false);
      }
    },
    [adminKey, busy, conversationId, refreshOrders],
  );

  const featured = useMemo(() => catalog.filter((product) => product.isNew).slice(0, 4), [catalog]);

  return (
    <main className="min-h-screen bg-leaf text-emerald-50">
      <div className="mx-auto grid min-h-screen max-w-6xl gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-h-screen flex-col">
          <header className="border-b border-white/10 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-watt">
                  EnergixCu
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
                  Jose, asesor de ventas
                </h1>
                <p className="mt-1 text-sm text-emerald-100/65">WhatsApp · Messenger · chat web</p>
              </div>
              <nav className="flex rounded-full border border-white/10 bg-grove p-1 text-xs font-semibold">
                {(
                  [
                    ['chat', 'Chat'],
                    ['orders', 'Pedidos'],
                    ['channels', 'Conexiones'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`rounded-full px-3 py-1.5 ${
                      tab === id ? 'bg-watt text-leaf' : 'text-emerald-100/70'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>
          </header>

          {tab === 'chat' ? (
            <>
              <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={item.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                  >
                    <div
                      className={`max-w-[min(100%,36rem)] rounded-2xl px-4 py-3 text-sm leading-6 shadow ${
                        item.role === 'user'
                          ? 'bg-[#005c4b] text-white'
                          : 'border border-white/10 bg-grove text-emerald-50'
                      }`}
                    >
                      {item.role === 'jose' ? (
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-watt">
                          Jose
                        </p>
                      ) : null}
                      {item.text ? <p className="whitespace-pre-wrap">{item.text}</p> : null}
                      {item.replies.map((reply, index) => (
                        <ReplyView key={`${item.id}-${index}`} reply={reply} />
                      ))}
                    </div>
                  </div>
                ))}
                {busy ? (
                  <p className="text-xs text-emerald-100/50">Jose está escribiendo…</p>
                ) : null}
                {error ? (
                  <p
                    role="alert"
                    className="rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-100"
                  >
                    {error}
                  </p>
                ) : null}
              </div>
              <form
                className="border-t border-white/10 p-4 sm:px-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(input);
                }}
              >
                <div className="mb-2 flex flex-wrap gap-2">
                  {['Catálogo', 'Batería 5 kWh', 'Quiero comprar', '¿Entregan en Playa?'].map(
                    (hint) => (
                      <button
                        key={hint}
                        type="button"
                        onClick={() => void send(hint)}
                        className="rounded-full border border-white/10 px-3 py-1 text-xs text-emerald-100/75"
                      >
                        {hint}
                      </button>
                    ),
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Escribe a Jose…"
                    className="w-full rounded-2xl border border-white/10 bg-grove px-4 py-3 text-sm text-white outline-none ring-watt/40 placeholder:text-emerald-100/35 focus:ring-2"
                  />
                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    className="rounded-2xl bg-watt px-4 py-3 text-sm font-bold text-leaf disabled:opacity-40"
                  >
                    Enviar
                  </button>
                </div>
              </form>
            </>
          ) : null}

          {tab === 'orders' ? (
            <OrdersPanel orders={orders} adminKey={adminKey} onAdminKey={setAdminKey} />
          ) : null}
          {tab === 'channels' ? (
            <ChannelsPanel
              channels={channels}
              catalog={catalog}
              adminKey={adminKey}
              onAdminKey={setAdminKey}
              onRefresh={() => void fetchAgentChannels().then(setChannels)}
            />
          ) : null}
        </section>

        <aside className="hidden border-l border-white/10 bg-grove/70 p-5 lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sun">
            Nuevos del día
          </p>
          <div className="mt-4 space-y-3">
            {featured.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => {
                  setTab('chat');
                  void send(`Quiero info del ${product.model}`);
                }}
                className="w-full overflow-hidden rounded-2xl border border-white/10 text-left"
              >
                <div className="h-24 bg-leaf/80">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={product.imageUrl} alt="" className="h-24 w-full object-cover" />
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-white">{product.model}</p>
                  <p className="mt-1 text-xs text-watt">${product.priceUsd} USD</p>
                </div>
              </button>
            ))}
          </div>
          <a href="/" className="mt-6 inline-block text-xs text-emerald-100/50 underline">
            Volver a OnlyCu
          </a>
        </aside>
      </div>
    </main>
  );
}

function ReplyView({ reply }: { reply: AgentReply }) {
  if (reply.type === 'image') {
    return (
      <figure className="mt-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={reply.url}
          alt={reply.caption ?? 'Producto'}
          className="max-h-56 rounded-xl object-cover"
        />
        {reply.caption ? (
          <figcaption className="mt-1 text-xs text-emerald-100/60">{reply.caption}</figcaption>
        ) : null}
      </figure>
    );
  }
  if (reply.type === 'ticket') {
    return (
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 font-mono text-[12px] text-sun">
        {reply.text}
      </pre>
    );
  }
  return <FormattedText value={reply.text} />;
}

function FormattedText({ value }: { value: string }) {
  const parts = value.split(/(\*[^*]+\*)/g);
  return (
    <p className="whitespace-pre-wrap">
      {parts.map((part, index) =>
        part.startsWith('*') && part.endsWith('*') ? (
          <strong key={index}>{part.slice(1, -1)}</strong>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </p>
  );
}

function OrdersPanel({
  orders,
  adminKey,
  onAdminKey,
}: {
  orders: AgentOrder[];
  adminKey: string;
  onAdminKey: (value: string) => void;
}) {
  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6">
      <label className="block text-xs text-emerald-100/60">
        Clave admin (opcional, para ver todos los tickets)
        <input
          value={adminKey}
          onChange={(event) => onAdminKey(event.target.value)}
          className="mt-1 w-full rounded-xl border border-white/10 bg-grove px-3 py-2 text-sm text-white"
        />
      </label>
      {orders.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-emerald-100/50">
          Aún no hay tickets. Cierra una venta en el chat para generar el formato oficial.
        </p>
      ) : null}
      {orders.map((order) => (
        <article key={order.id} className="rounded-2xl border border-white/10 bg-grove p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-white">{order.ticketNumber}</p>
            <span className="text-xs text-watt">{order.channel}</span>
          </div>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-[12px] text-sun">
            {order.ticketText}
          </pre>
        </article>
      ))}
    </div>
  );
}

function ChannelsPanel({
  channels,
  catalog,
  adminKey,
  onAdminKey,
  onRefresh,
}: {
  channels: ChannelStatus | undefined;
  catalog: AgentProduct[];
  adminKey: string;
  onAdminKey: (value: string) => void;
  onRefresh: () => void;
}) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<string>();

  const whatsappUrl = `${origin}${channels?.channels.whatsapp.webhookPath ?? '/v1/whatsapp/webhook'}`;
  const messengerUrl = `${origin}${channels?.channels.messenger.webhookPath ?? '/v1/messenger/webhook'}`;

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
      <div className="rounded-2xl border border-sun/30 bg-sun/10 p-4 text-sm leading-6 text-emerald-50">
        <p className="font-semibold text-sun">Cómo saber si ya está unido a TU cuenta</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-emerald-100/80">
          <li>
            En Meta, pulsa <strong>Verificar y guardar</strong> el webhook. Aquí debe aparecer la
            fecha de verificación.
          </li>
          <li>
            Escríbele <strong>Hola</strong> a tu número de WhatsApp Business o a tu Página. Aquí
            debe aparecer el último mensaje recibido.
          </li>
          <li>
            Si Jose responde en el teléfono, está vivo. Si el mensaje llega pero no contesta, faltan
            los tokens de envío.
          </li>
        </ol>
        <p className="mt-2 text-xs text-emerald-100/60">
          Un WhatsApp personal no sirve: tiene que ser número de WhatsApp Cloud API y una Página de
          Facebook para Messenger.
        </p>
      </div>

      <ChannelCard
        title="WhatsApp Cloud API"
        channel={channels?.channels.whatsapp}
        url={whatsappUrl}
        rows={[
          ['Verify token', flag(channels?.channels.whatsapp.verifyTokenConfigured)],
          ['Phone number ID', flag(channels?.channels.whatsapp.phoneNumberIdConfigured)],
          ['Access token', flag(channels?.channels.whatsapp.accessTokenConfigured)],
          ['Firma X-Hub-Signature-256', flag(channels?.channels.whatsapp.signatureVerification)],
        ]}
        steps={[
          'developers.facebook.com → tu app → WhatsApp → Configuration.',
          'Callback URL: la de esta tarjeta. Verify token: META_WEBHOOK_VERIFY_TOKEN.',
          'Suscribe messages y pulsa Verify and save. Si Meta acepta, el webhook está bien.',
          'Carga WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID y WHATSAPP_APP_SECRET.',
          'Mándate un Hola desde otro teléfono. Jose debe contestar y este panel debe mostrar el inbound.',
        ]}
      />

      <ChannelCard
        title="Facebook Messenger"
        channel={channels?.channels.messenger}
        url={messengerUrl}
        rows={[
          ['Verify token', flag(channels?.channels.messenger.verifyTokenConfigured)],
          ['Page access token', flag(channels?.channels.messenger.pageTokenConfigured)],
          ['Firma X-Hub-Signature-256', flag(channels?.channels.messenger.signatureVerification)],
        ]}
        steps={[
          'Misma app de Meta → Messenger → Add Callback URL.',
          'URL de esta tarjeta, mismo verify token, suscripción messages.',
          'Conecta tu Página y genera un Page access token de larga duración.',
          'Carga MESSENGER_PAGE_ACCESS_TOKEN y MESSENGER_APP_SECRET.',
          'Escríbele a la Página desde otra cuenta de Facebook. Si Jose responde, está conectado.',
        ]}
      />

      <div className="rounded-2xl border border-white/10 bg-grove p-4">
        <p className="text-sm font-semibold text-white">Productos nuevos del día</p>
        <p className="mt-1 text-xs text-emerald-100/55">
          Requiere AGENT_ADMIN_KEY. Jose los ofrecerá apenas un cliente pregunte por novedades.
        </p>
        <input
          value={adminKey}
          onChange={(event) => onAdminKey(event.target.value)}
          placeholder="Clave admin"
          className="mt-3 w-full rounded-xl border border-white/10 bg-leaf px-3 py-2 text-sm text-white"
        />
        <div className="mt-3 grid gap-2">
          {catalog.map((product) => (
            <label key={product.id} className="flex items-center gap-2 text-sm text-emerald-100/80">
              <input
                type="checkbox"
                checked={selected.includes(product.id)}
                onChange={(event) => {
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, product.id]
                      : current.filter((id) => id !== product.id),
                  );
                }}
              />
              {product.model}
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            void setDailyProducts(adminKey, selected)
              .then((result) => {
                setNotice(`Actualizados ${result.updated} productos.`);
                onRefresh();
              })
              .catch((cause) => {
                setNotice(cause instanceof Error ? cause.message : 'No se pudo actualizar.');
              });
          }}
          className="mt-3 rounded-xl bg-watt px-4 py-2 text-sm font-bold text-leaf"
        >
          Publicar novedades
        </button>
        {notice ? <p className="mt-2 text-xs text-sun">{notice}</p> : null}
      </div>
    </div>
  );
}

function ChannelCard({
  title,
  channel,
  url,
  rows,
  steps,
}: {
  title: string;
  channel?: ChannelActivity;
  url: string;
  rows: Array<[string, string]>;
  steps: string[];
}) {
  const verdict = channel?.verdict ?? 'not_configured';
  return (
    <article className="rounded-2xl border border-white/10 bg-grove p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
            verdict === 'live'
              ? 'bg-watt/20 text-watt'
              : verdict === 'receiving'
                ? 'bg-sun/20 text-sun'
                : 'bg-white/10 text-emerald-100/60'
          }`}
        >
          {verdictLabel(verdict)}
        </span>
      </div>

      <ul className="mt-3 space-y-1 text-xs text-emerald-100/75">
        <Check ok={Boolean(channel?.verifyTokenConfigured)} label="Puede verificar el webhook" />
        <Check
          ok={Boolean(channel?.lastVerifyAt)}
          label={`Meta ya verificó${when(channel?.lastVerifyAt)}`}
        />
        <Check
          ok={Boolean(channel?.lastInboundAt)}
          label={`Llegó un mensaje real${when(channel?.lastInboundAt)}`}
        />
        <Check ok={Boolean(channel?.enabled)} label="Tiene token para responder" />
      </ul>

      {channel?.lastInboundFrom ? (
        <p className="mt-3 rounded-xl bg-black/25 px-3 py-2 text-xs text-emerald-100/70">
          Último inbound:{' '}
          <span className="font-semibold text-white">{channel.lastInboundFrom}</span>
          {channel.lastInboundPreview ? ` · “${channel.lastInboundPreview}”` : ''}
        </p>
      ) : (
        <p className="mt-3 rounded-xl bg-black/25 px-3 py-2 text-xs text-emerald-100/55">
          Todavía no ha llegado ningún mensaje de este canal a este servidor.
        </p>
      )}

      {channel?.lastError ? (
        <p className="mt-2 text-xs text-red-200">Último error de envío: {channel.lastError}</p>
      ) : null}

      <p className="mt-3 break-all rounded-xl bg-black/30 px-3 py-2 font-mono text-[11px] text-sun">
        {url}
      </p>
      <button
        type="button"
        onClick={() => void navigator.clipboard.writeText(url)}
        className="mt-2 text-xs font-semibold text-watt"
      >
        Copiar URL
      </button>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-emerald-100/70">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className="font-semibold text-white">{value}</dd>
          </div>
        ))}
      </dl>
      <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs leading-5 text-emerald-100/60">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </article>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li>
      <span className={ok ? 'text-watt' : 'text-emerald-100/40'}>{ok ? '●' : '○'}</span> {label}
    </li>
  );
}

function verdictLabel(verdict: ChannelVerdict): string {
  if (verdict === 'live') return 'Conectado y respondiendo';
  if (verdict === 'receiving') return 'Recibe mensajes · no puede responder';
  if (verdict === 'webhook_ready') return 'Webhook listo · aún no llega tu cuenta';
  return 'Sin configurar';
}

function when(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return ` · ${date.toLocaleString('es-CU')}`;
}

function flag(value: boolean | undefined): string {
  return value ? 'Sí' : 'No';
}
