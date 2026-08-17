'use client';

import clsx from 'clsx';
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type ProtectedMediaSource = {
  url: string;
  kind: 'image' | 'video' | 'audio';
  contentType: string;
  expiresAt: string;
};

export type WatermarkIdentity = {
  telegramId: string;
  username?: string;
};

export type MediaSecurityEvent =
  | 'context_menu_blocked'
  | 'drag_blocked'
  | 'keyboard_shortcut_blocked'
  | 'print_screen_attempted'
  | 'source_expired';

export type SecureMediaViewerProps = {
  mediaId: string;
  source: ProtectedMediaSource;
  viewer: WatermarkIdentity;
  alt?: string;
  className?: string;
  /** Refreshes a short-lived URL after the API has checked entitlement again. */
  onRefreshSource?: () => Promise<ProtectedMediaSource>;
  /** Send telemetry to an authenticated API endpoint; do not trust it as proof. */
  onSecurityEvent?: (event: MediaSecurityEvent) => void;
};

/**
 * Deterrence layer for authorized viewers. It deliberately does not claim to be
 * DRM: a browser or operating system can always record pixels it is allowed to
 * display. Durable controls are server-side authorization, short-lived signed
 * URLs, forensic watermarking, and audit trails.
 */
export function SecureMediaViewer({
  mediaId,
  source: initialSource,
  viewer,
  alt = 'Contenido protegido',
  className,
  onRefreshSource,
  onSecurityEvent,
}: SecureMediaViewerProps) {
  const [source, setSource] = useState(initialSource);
  const [watermarkEpoch, setWatermarkEpoch] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string>();

  useEffect(() => setSource(initialSource), [initialSource]);

  const emitSecurityEvent = useCallback(
    (event: MediaSecurityEvent) => {
      onSecurityEvent?.(event);
    },
    [onSecurityEvent],
  );

  useEffect(() => {
    const rotateWatermark = window.setInterval(() => setWatermarkEpoch(Date.now()), 12_000);
    return () => window.clearInterval(rotateWatermark);
  }, []);

  useEffect(() => {
    const blockContextMenu = (event: Event) => {
      event.preventDefault();
      emitSecurityEvent('context_menu_blocked');
    };
    const blockDrag = (event: DragEvent) => {
      event.preventDefault();
      emitSecurityEvent('drag_blocked');
    };
    const blockKeyboardShortcut = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      const blocked =
        event.key === 'PrintScreen' ||
        (modifier && ['s', 'p', 'u'].includes(key)) ||
        (modifier && event.shiftKey && ['i', 'j', 'c'].includes(key)) ||
        event.key === 'F12';

      if (!blocked) return;
      event.preventDefault();
      event.stopPropagation();
      emitSecurityEvent(
        event.key === 'PrintScreen' ? 'print_screen_attempted' : 'keyboard_shortcut_blocked',
      );
    };

    document.addEventListener('contextmenu', blockContextMenu);
    document.addEventListener('dragstart', blockDrag);
    window.addEventListener('keydown', blockKeyboardShortcut, true);
    return () => {
      document.removeEventListener('contextmenu', blockContextMenu);
      document.removeEventListener('dragstart', blockDrag);
      window.removeEventListener('keydown', blockKeyboardShortcut, true);
    };
  }, [emitSecurityEvent]);

  useEffect(() => {
    const expiresAt = new Date(source.expiresAt).getTime();
    if (Number.isNaN(expiresAt)) return;

    const refresh = async () => {
      emitSecurityEvent('source_expired');
      if (!onRefreshSource || refreshing) return;
      setRefreshing(true);
      setRefreshError(undefined);
      try {
        setSource(await onRefreshSource());
      } catch {
        setRefreshError('No se pudo renovar el acceso protegido. Vuelve a abrir el contenido.');
      } finally {
        setRefreshing(false);
      }
    };

    const delay = Math.max(0, expiresAt - Date.now() - 3_000);
    const timer = window.setTimeout(() => void refresh(), delay);
    return () => window.clearTimeout(timer);
  }, [source.expiresAt, onRefreshSource, emitSecurityEvent]);

  const watermark = useMemo(() => {
    const timestamp = new Intl.DateTimeFormat('es-CU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(watermarkEpoch));
    const user = viewer.username ? `@${viewer.username}` : 'usuario Telegram';
    return `ID ${viewer.telegramId} · ${user} · ${timestamp}`;
  }, [viewer.telegramId, viewer.username, watermarkEpoch]);

  const tiles = useMemo(
    () =>
      Array.from({ length: 15 }, (_, index) => ({
        id: `${mediaId}-${watermarkEpoch}-${index}`,
        offsetX: ((hash(`${mediaId}:${watermarkEpoch}:${index}`) % 19) - 9) * 2,
        offsetY: ((hash(`${viewer.telegramId}:${index}`) % 15) - 7) * 3,
        opacity: 0.24 + (index % 4) * 0.035,
      })),
    [mediaId, viewer.telegramId, watermarkEpoch],
  );

  const onReactContextMenu = (event: ReactMouseEvent<HTMLElement>) => event.preventDefault();

  return (
    <section
      aria-label="Visor de contenido protegido"
      className={clsx(
        'protected-media-shell relative isolate overflow-hidden rounded-2xl bg-black shadow-glow',
        className,
      )}
      onContextMenu={onReactContextMenu}
    >
      {source.kind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element -- presigned private URL cannot be statically configured for next/image.
        <img
          src={source.url}
          alt={alt}
          draggable={false}
          className="block max-h-[78vh] min-h-48 w-full object-contain"
          referrerPolicy="no-referrer"
        />
      ) : source.kind === 'video' ? (
        <video
          key={source.url}
          src={source.url}
          controls
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          disableRemotePlayback
          playsInline
          preload="metadata"
          className="block max-h-[78vh] min-h-48 w-full bg-black object-contain"
        >
          Tu cliente no soporta la reproducción de video.
        </video>
      ) : (
        <audio
          src={source.url}
          controls
          controlsList="nodownload noremoteplayback"
          className="w-full p-6"
        />
      )}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-5 overflow-hidden"
      >
        {tiles.map((tile) => (
          <span
            key={tile.id}
            className="watermark-tile flex items-center justify-center text-center"
            style={{
              opacity: tile.opacity,
              transform: `translate(${tile.offsetX}px, ${tile.offsetY}px) rotate(-21deg)`,
            }}
          >
            {watermark}
          </span>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-10 text-[10px] font-medium text-white/80">
        <span>Acceso individual registrado</span>
        <span>{refreshing ? 'Renovando enlace…' : 'Enlace temporal'}</span>
      </div>
      {refreshError ? (
        <p
          role="alert"
          className="absolute inset-x-3 top-3 rounded-lg bg-red-950/90 px-3 py-2 text-xs text-red-100"
        >
          {refreshError}
        </p>
      ) : null}
    </section>
  );
}

function hash(value: string): number {
  let result = 5381;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 33) ^ value.charCodeAt(index);
  }
  return result >>> 0;
}
