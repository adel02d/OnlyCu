import type {
  MediaSecurityEvent,
  ProtectedMediaSource,
  WatermarkIdentity,
} from '../components/SecureMediaViewer';

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? '';

export type TelegramSession = {
  accessToken: string;
  expiresInSeconds: number;
  user: {
    id: string;
    telegramId: string;
    username?: string | null;
    displayName: string;
    status: string;
    roles: string[];
    termsAcceptedAt?: string | null;
    adultDeclaredAt?: string | null;
    creatorStatus?: string;
  };
};

export async function authenticateWithTelegram(initData: string): Promise<TelegramSession> {
  return request<TelegramSession>('/v1/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ initData }),
  });
}

export async function completeRegistration(accessToken: string): Promise<{ accepted: true }> {
  return request('/v1/account/complete-registration', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ acceptTerms: true, declareAdult: true }),
  });
}

export type FeedPost = {
  id: string;
  author_id: string;
  title?: string | null;
  body?: string | null;
  access_type: 'FREE' | 'SUBSCRIBERS' | 'PPV';
  content_rating: 'GENERAL' | '18_PLUS';
  ppv_price?: string | null;
  ppv_currency?: string | null;
  handle: string;
  display_name: string;
  primary_media_id?: string | null;
};

export async function fetchFeed(accessToken: string): Promise<{ posts: FeedPost[] }> {
  return request('/v1/posts', { headers: { Authorization: `Bearer ${accessToken}` } });
}

export type CreatorPaymentMethod = {
  id: string;
  method_type: 'QVAPAY' | 'CUP' | 'USDT_TRC20' | 'USDT_BEP20' | 'TON';
  display_label: string;
  network?: string | null;
  recipient_hint?: string | null;
};

export async function fetchCreatorPaymentMethods(
  creatorId: string,
  accessToken: string,
): Promise<{ methods: CreatorPaymentMethod[] }> {
  return request(`/v1/creators/${encodeURIComponent(creatorId)}/payment-methods`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export type DirectPaymentClaim = {
  id: string;
  amount: string;
  currency: string;
  expiresAt: string;
  status: string;
  paymentMethod: {
    type: string;
    label: string;
    network?: string | null;
    recipientHint?: string | null;
    recipientDetails: string;
  };
};

export async function createPostPaymentClaim(
  postId: string,
  paymentMethodId: string,
  accessToken: string,
): Promise<{ paymentClaim: DirectPaymentClaim }> {
  return request('/v1/payment-claims', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ targetType: 'POST', postId, paymentMethodId }),
  });
}

export async function uploadPaymentProof(
  claimId: string,
  file: File,
  accessToken: string,
  note?: string,
): Promise<{ submitted: true }> {
  const form = new FormData();
  form.set('file', file);
  if (note) form.set('note', note);
  return request(`/v1/payment-claims/${encodeURIComponent(claimId)}/proof`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
}

export async function fetchProtectedMedia(
  assetId: string,
  accessToken: string,
): Promise<{ media: ProtectedMediaSource; watermark: WatermarkIdentity }> {
  return request(`/v1/media/${encodeURIComponent(assetId)}/access`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function reportMediaSecurityEvent(
  assetId: string,
  accessToken: string,
  event: MediaSecurityEvent,
): Promise<void> {
  await request(`/v1/media/${encodeURIComponent(assetId)}/security-events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ event }),
  });
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const response = await fetch(`${apiOrigin}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => undefined)) as
    T | { error?: string; requestId?: string } | undefined;
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : 'La solicitud no pudo completarse';
    throw new Error(message);
  }
  return payload as T;
}
