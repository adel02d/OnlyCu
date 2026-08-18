import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Jose · EnergixCu',
  description: 'Asesor de ventas EnergixCu en WhatsApp, Messenger y web.',
  robots: { index: false, follow: false },
};

export default function AgentLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
