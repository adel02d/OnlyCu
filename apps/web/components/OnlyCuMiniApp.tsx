'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  completeRegistration,
  createPostPaymentClaim,
  fetchCreatorPaymentMethods,
  fetchFeed,
  uploadPaymentProof,
  type CreatorPaymentMethod,
  type DirectPaymentClaim,
  type FeedPost,
  type TelegramSession,
} from '../lib/api';
import { ProtectedMediaAsset } from './ProtectedMediaAsset';
import { TelegramBootstrap } from './TelegramBootstrap';

type PurchaseState = {
  post: FeedPost;
  methods: CreatorPaymentMethod[];
  claim?: DirectPaymentClaim;
  loading: boolean;
  error?: string;
  submitted?: boolean;
};

export function OnlyCuMiniApp() {
  const [session, setSession] = useState<TelegramSession>();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [registrationError, setRegistrationError] = useState<string>();
  const [purchase, setPurchase] = useState<PurchaseState>();
  const [openedMedia, setOpenedMedia] = useState<{ assetId: string; title: string }>();

  const loadFeed = useCallback(async (currentSession: TelegramSession) => {
    setLoadingPosts(true);
    try {
      const result = await fetchFeed(currentSession.accessToken);
      setPosts(result.posts);
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  const onSession = useCallback(
    (nextSession: TelegramSession) => {
      setSession(nextSession);
      if (nextSession.user.termsAcceptedAt && nextSession.user.adultDeclaredAt) {
        void loadFeed(nextSession).catch(() => undefined);
      }
    },
    [loadFeed],
  );

  const acceptRegistration = useCallback(async () => {
    if (!session) return;
    setRegistrationError(undefined);
    try {
      await completeRegistration(session.accessToken);
      const updated = {
        ...session,
        user: {
          ...session.user,
          termsAcceptedAt: new Date().toISOString(),
          adultDeclaredAt: new Date().toISOString(),
        },
      };
      setSession(updated);
      await loadFeed(updated);
    } catch (error) {
      setRegistrationError(
        error instanceof Error ? error.message : 'No se pudo completar el registro.',
      );
    }
  }, [loadFeed, session]);

  const beginPurchase = useCallback(
    async (post: FeedPost) => {
      if (!session) return;
      setPurchase({ post, methods: [], loading: true });
      try {
        const result = await fetchCreatorPaymentMethods(post.author_id, session.accessToken);
        setPurchase({ post, methods: result.methods, loading: false });
      } catch (error) {
        setPurchase({
          post,
          methods: [],
          loading: false,
          error:
            error instanceof Error ? error.message : 'No se pudieron cargar los métodos de pago.',
        });
      }
    },
    [session],
  );

  const selectMethod = useCallback(
    async (method: CreatorPaymentMethod) => {
      if (!session || !purchase) return;
      setPurchase({ ...purchase, loading: true, error: undefined });
      try {
        const result = await createPostPaymentClaim(
          purchase.post.id,
          method.id,
          session.accessToken,
        );
        setPurchase({ ...purchase, loading: false, claim: result.paymentClaim });
      } catch (error) {
        setPurchase({
          ...purchase,
          loading: false,
          error: error instanceof Error ? error.message : 'No se pudo iniciar el pago.',
        });
      }
    },
    [purchase, session],
  );

  const submitProof = useCallback(
    async (file: File) => {
      if (!session || !purchase?.claim) return;
      setPurchase({ ...purchase, loading: true, error: undefined });
      try {
        await uploadPaymentProof(purchase.claim.id, file, session.accessToken);
        setPurchase({ ...purchase, loading: false, submitted: true });
      } catch (error) {
        setPurchase({
          ...purchase,
          loading: false,
          error: error instanceof Error ? error.message : 'No se pudo enviar la captura.',
        });
      }
    },
    [purchase, session],
  );

  useEffect(() => {
    if (session?.user.termsAcceptedAt && session.user.adultDeclaredAt) {
      void loadFeed(session).catch(() => undefined);
    }
  }, [loadFeed, session]);

  const isRegistered = Boolean(session?.user.termsAcceptedAt && session?.user.adultDeclaredAt);

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet">OnlyCu</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
            Contenido exclusivo, pago directo.
          </h1>
        </div>
        <span className="rounded-full border border-violet/30 bg-violet/10 px-3 py-1 text-xs font-semibold text-violet">
          TMA
        </span>
      </header>

      <TelegramBootstrap onSession={onSession} />
      {!session ? <PreviewExplanation /> : null}

      {session && !isRegistered ? (
        <section className="mt-6 rounded-2xl border border-violet/30 bg-violet/10 p-5 shadow-glow">
          <h2 className="text-lg font-semibold text-white">Registro rápido</h2>
          <p className="mt-2 text-sm leading-6 text-white/70">
            Para continuar, confirmas que tienes 18 años o más y aceptas los términos de uso. No se
            solicita KYC durante este registro inicial.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-white/65">
            <li>• Los pagos se realizan directamente entre cliente y creador.</li>
            <li>• El creador revisa el comprobante antes de desbloquear contenido.</li>
            <li>
              • Una autodeclaración no sustituye verificaciones legales cuando sean necesarias.
            </li>
          </ul>
          {registrationError ? (
            <p role="alert" className="mt-3 text-sm text-red-200">
              {registrationError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void acceptRegistration()}
            className="mt-5 w-full rounded-xl bg-violet px-4 py-3 text-sm font-bold text-ink transition hover:bg-violet/90"
          >
            Tengo 18+ y acepto los términos
          </button>
        </section>
      ) : null}

      {session && isRegistered ? (
        <section className="mt-6 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-panel p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">Sesión</p>
            <p className="mt-1 text-base font-semibold text-white">
              Hola, {session.user.displayName}
            </p>
            <p className="mt-1 text-sm text-white/55">
              Los pagos directos se desbloquean solo cuando el creador los aprueba.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Explorar</h2>
            <button
              type="button"
              onClick={() => void loadFeed(session)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/75"
            >
              Actualizar
            </button>
          </div>

          {loadingPosts ? <div className="h-28 animate-pulse rounded-2xl bg-white/10" /> : null}
          {!loadingPosts && posts.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/15 p-5 text-center text-sm text-white/50">
              Aún no hay contenido publicado.
            </p>
          ) : null}
          {posts.map((post) => (
            <article key={post.id} className="rounded-2xl border border-white/10 bg-panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {post.title ?? 'Contenido exclusivo'}
                  </p>
                  <p className="mt-1 text-xs text-violet">@{post.handle}</p>
                </div>
                <AccessBadge post={post} />
              </div>
              {post.body ? (
                <p className="mt-3 text-sm leading-6 text-white/60">{post.body}</p>
              ) : null}
              {post.content_rating === '18_PLUS' ? (
                <p className="mt-3 text-xs font-medium text-amber-200">Contenido marcado 18+</p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {post.primary_media_id ? (
                  <button
                    type="button"
                    onClick={() =>
                      setOpenedMedia({
                        assetId: post.primary_media_id!,
                        title: post.title ?? 'Contenido exclusivo',
                      })
                    }
                    className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    Abrir contenido
                  </button>
                ) : null}
                {post.access_type === 'PPV' ? (
                  <button
                    type="button"
                    onClick={() => void beginPurchase(post)}
                    className="rounded-xl bg-violet px-4 py-2.5 text-sm font-bold text-ink"
                  >
                    Solicitar pago directo
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {purchase ? (
        <PurchaseSheet
          state={purchase}
          onClose={() => setPurchase(undefined)}
          onMethod={(method) => void selectMethod(method)}
          onProof={(file) => void submitProof(file)}
        />
      ) : null}

      {openedMedia && session ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 p-3">
          <section className="mx-auto mt-6 max-w-xl rounded-2xl bg-ink p-3">
            <div className="mb-3 flex items-center justify-between gap-3 px-2">
              <p className="text-sm font-semibold text-white">{openedMedia.title}</p>
              <button
                type="button"
                onClick={() => setOpenedMedia(undefined)}
                className="text-sm text-white/60"
              >
                Cerrar
              </button>
            </div>
            <ProtectedMediaAsset
              assetId={openedMedia.assetId}
              session={session}
              alt={openedMedia.title}
            />
          </section>
        </div>
      ) : null}
    </main>
  );
}

function PurchaseSheet({
  state,
  onClose,
  onMethod,
  onProof,
}: {
  state: PurchaseState;
  onClose: () => void;
  onMethod: (method: CreatorPaymentMethod) => void;
  onProof: (file: File) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-3 sm:items-center">
      <section className="mx-auto w-full max-w-xl rounded-2xl border border-white/15 bg-ink p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-violet">Pago directo</p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              {state.post.title ?? 'Contenido exclusivo'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-white/55">
            Cerrar
          </button>
        </div>

        {state.error ? (
          <p role="alert" className="mt-4 text-sm text-red-200">
            {state.error}
          </p>
        ) : null}
        {state.loading ? <div className="mt-5 h-16 animate-pulse rounded-xl bg-white/10" /> : null}

        {!state.loading && !state.claim ? (
          <div className="mt-5 space-y-2">
            <p className="text-sm text-white/65">Elige cómo pagar directamente al creador.</p>
            {state.methods.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/50">
                Este creador aún no configuró un método de pago.
              </p>
            ) : null}
            {state.methods.map((method) => (
              <button
                key={method.id}
                type="button"
                onClick={() => onMethod(method)}
                className="flex w-full items-center justify-between rounded-xl border border-white/15 px-4 py-3 text-left text-sm text-white"
              >
                <span>{method.display_label}</span>
                <span className="text-xs text-white/50">
                  {method.recipient_hint ?? method.network}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {state.claim ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-violet/30 bg-violet/10 p-4">
              <p className="text-sm font-semibold text-white">
                Envía {state.claim.amount} {state.claim.currency}
              </p>
              <p className="mt-2 break-all font-mono text-sm text-violet">
                {state.claim.paymentMethod.recipientDetails}
              </p>
              <p className="mt-2 text-xs text-white/60">
                {state.claim.paymentMethod.label}{' '}
                {state.claim.paymentMethod.network ? `· ${state.claim.paymentMethod.network}` : ''}
              </p>
            </div>
            {state.submitted ? (
              <p className="rounded-xl bg-emerald-400/10 p-4 text-sm text-emerald-100">
                Captura enviada. El creador debe confirmar que recibió el pago antes de desbloquear
                el contenido.
              </p>
            ) : (
              <label className="block rounded-xl border border-dashed border-white/20 p-4 text-sm text-white/70">
                Adjuntar captura del pago (JPEG, PNG o WebP, máximo 5 MB)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="mt-3 block w-full text-xs text-white/60"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onProof(file);
                  }}
                />
              </label>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function AccessBadge({ post }: { post: FeedPost }) {
  const label =
    post.access_type === 'FREE'
      ? 'Gratis'
      : post.access_type === 'SUBSCRIBERS'
        ? 'Suscriptores'
        : `${post.ppv_price ?? '—'} ${post.ppv_currency ?? ''}`;
  return (
    <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/75">
      {label}
    </span>
  );
}

function PreviewExplanation() {
  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-panel p-5 text-sm leading-6 text-white/60">
      Esta vista se puede abrir fuera de Telegram para comprobar el diseño. La sesión real se crea
      solamente cuando Telegram entrega `initData` firmado a la Mini App.
    </section>
  );
}
