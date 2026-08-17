'use client';

import { useCallback, useEffect, useState } from 'react';

import { fetchProtectedMedia, reportMediaSecurityEvent, type TelegramSession } from '../lib/api';
import {
  SecureMediaViewer,
  type MediaSecurityEvent,
  type ProtectedMediaSource,
  type WatermarkIdentity,
} from './SecureMediaViewer';

type ProtectedMediaAssetProps = {
  assetId: string;
  session: TelegramSession;
  alt?: string;
};

type ViewerState =
  | { phase: 'loading' }
  | { phase: 'ready'; source: ProtectedMediaSource; watermark: WatermarkIdentity }
  | { phase: 'error'; message: string };

/**
 * Reference integration: every source and refresh goes back through the API,
 * which rechecks entitlement before issuing another 60-second URL.
 */
export function ProtectedMediaAsset({ assetId, session, alt }: ProtectedMediaAssetProps) {
  const [state, setState] = useState<ViewerState>({ phase: 'loading' });

  const load = useCallback(async () => {
    const response = await fetchProtectedMedia(assetId, session.accessToken);
    setState({ phase: 'ready', source: response.media, watermark: response.watermark });
    return response.media;
  }, [assetId, session.accessToken]);

  useEffect(() => {
    void load().catch(() => {
      setState({
        phase: 'error',
        message: 'No tienes acceso a este contenido o el enlace no está disponible.',
      });
    });
  }, [load]);

  const report = useCallback(
    (event: MediaSecurityEvent) => {
      // Telemetry is best-effort. A rejected report must not interrupt playback.
      void reportMediaSecurityEvent(assetId, session.accessToken, event).catch(() => undefined);
    },
    [assetId, session.accessToken],
  );

  if (state.phase === 'loading') {
    return <div className="min-h-48 animate-pulse rounded-2xl bg-white/10" aria-busy="true" />;
  }
  if (state.phase === 'error') {
    return (
      <p role="alert" className="rounded-xl bg-red-950/60 p-3 text-sm text-red-100">
        {state.message}
      </p>
    );
  }

  return (
    <SecureMediaViewer
      mediaId={assetId}
      source={state.source}
      viewer={state.watermark}
      alt={alt}
      onRefreshSource={load}
      onSecurityEvent={report}
    />
  );
}
