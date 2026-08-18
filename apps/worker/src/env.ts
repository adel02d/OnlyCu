export type Bindings = {
  DB: D1Database;
  MEDIA: R2Bucket;
  APP_ORIGIN: string;
  API_ORIGIN: string;
  PLATFORM_USDT_NETWORK: 'TRC20' | 'BEP20' | 'TON';
  PLATFORM_USDT_ADDRESS: string;
  ADULT_DECLARATION_VERSION: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  JWT_SECRET: string;
  PAYMENT_DETAILS_ENCRYPTION_KEY: string;
  PII_HASH_SECRET: string;
  META_GRAPH_API_VERSION?: string;
  META_WEBHOOK_VERIFY_TOKEN?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_APP_SECRET?: string;
  MESSENGER_PAGE_ACCESS_TOKEN?: string;
  MESSENGER_APP_SECRET?: string;
  AGENT_ADMIN_KEY?: string;
};

export type Role = 'MEMBER' | 'CREATOR' | 'ADMIN' | 'MODERATOR';

export type CurrentUser = {
  id: string;
  telegramId: string;
  username?: string;
  status: 'ACTIVE' | 'BANNED' | 'DELETED';
  adultDeclaredAt: string | null;
  termsAcceptedAt: string | null;
  sessionVersion: number;
  roles: Role[];
  creatorStatus?: 'ACTIVE' | 'PAYMENT_DUE' | 'SUSPENDED_OVERDUE' | 'CLOSED';
};

export type AppVariables = {
  currentUser?: CurrentUser;
  requestId?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: AppVariables;
};
