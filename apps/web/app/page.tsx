import Link from 'next/link';

import { OnlyCuMiniApp } from '../components/OnlyCuMiniApp';

export default function HomePage() {
  return (
    <>
      <div className="border-b border-watt/20 bg-leaf px-4 py-3 text-center text-sm text-emerald-50">
        <Link href="/agente" className="font-semibold text-watt underline">
          Habla con Jose de EnergixCu
        </Link>
        <span className="text-emerald-100/60">
          {' '}
          — agente de ventas en WhatsApp, Messenger y web
        </span>
      </div>
      <OnlyCuMiniApp />
    </>
  );
}
