'use client';

import { closingBehavior, init, miniApp, retrieveRawInitData, swipeBehavior } from '@tma.js/sdk';
import { useEffect, useState } from 'react';

import { authenticateWithTelegram, type TelegramSession } from '../lib/api';

type BootstrapState = 'loading' | 'authenticated' | 'preview' | 'error';

type TelegramBootstrapProps = {
  onSession?: (session: TelegramSession) => void;
};

/** Initializes Telegram UX and exchanges raw initData for a short API token. */
export function TelegramBootstrap({ onSession }: TelegramBootstrapProps) {
  const [state, setState] = useState<BootstrapState>('loading');
  const [message, setMessage] = useState('Conectando con Telegram…');

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    const bootstrap = async () => {
      try {
        cleanup = init();
        miniApp.mount();
        miniApp.ready();
        closingBehavior.mount();
        closingBehavior.enableConfirmation();
        swipeBehavior.mount();
        swipeBehavior.disableVertical();
      } catch {
        // Browser preview is allowed for UI work. Authentication still requires
        // a real Telegram-signed initData and never uses mock identities.
      }

      const native = window.Telegram?.WebApp;
      native?.ready?.();
      native?.expand?.();
      native?.enableClosingConfirmation?.();
      native?.disableVerticalSwipes?.();

      const rawInitData = native?.initData || safelyRetrieveRawInitData();
      if (!rawInitData) {
        if (!disposed) {
          setState('preview');
          setMessage('Vista previa: abre esta Mini App desde Telegram para autenticarte.');
        }
        return;
      }

      try {
        const session = await authenticateWithTelegram(rawInitData);
        if (!disposed) {
          onSession?.(session);
          setState('authenticated');
          setMessage(`Sesión protegida iniciada para ${session.user.displayName}.`);
        }
      } catch {
        if (!disposed) {
          setState('error');
          setMessage('No fue posible validar tu sesión de Telegram. Vuelve a abrir la Mini App.');
        }
      }
    };

    void bootstrap();
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [onSession]);

  const tone =
    state === 'authenticated'
      ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
      : state === 'error'
        ? 'border-red-400/20 bg-red-400/10 text-red-100'
        : 'border-white/10 bg-white/5 text-white/65';

  return (
    <p
      role={state === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border px-3 py-2 text-xs ${tone}`}
    >
      {message}
    </p>
  );
}

function safelyRetrieveRawInitData(): string | undefined {
  try {
    return retrieveRawInitData();
  } catch {
    return undefined;
  }
}
