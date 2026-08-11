"use client";
import { useEffect, useState } from "react";
import AgeGate from "@/components/AgeGate";
import { WatermarkedViewer } from "@/components/WatermarkedViewer";

export default function Home() {
  const [ageOk, setAgeOk] = useState(false);
  const [initData, setInitData] = useState("");

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      setInitData(tg.initData || "");
    }
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 to-black">
      <AgeGate onVerified={() => setAgeOk(true)} />

      <header className="sticky top-0 z-40 bg-black/80 backdrop-blur border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-black text-xl tracking-tight">OnlyCu <span className="text-pink-500">•</span> <span className="text-xs font-normal text-zinc-400">TMA</span></h1>
          <div className="flex gap-2">
            <a href="/creator" className="text-sm bg-zinc-800 px-3 py-1.5 rounded-full border border-zinc-700">Panel creador</a>
            <a href="/admin" className="text-sm bg-zinc-800 px-3 py-1.5 rounded-full border border-zinc-700">Admin</a>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Aviso Cuba */}
        <div className="bg-sky-950/40 border border-sky-900 rounded-xl p-4 text-sm">
          <p className="font-semibold text-sky-200">🇨🇺 Pagos desde el exterior para Cuba</p>
          <p className="text-sky-200/80 mt-1">QvaPay y criptomonedas (USDT-TRC20 / TON) son las vías automáticas. Transferencia CUP con comprobante es manual y requiere aprobación en &lt;24h. Todo queda registrado y auditado.</p>
        </div>

        {!ageOk && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
            <p className="text-zinc-300">Debes confirmar que tienes 18+ para ver el contenido.</p>
          </div>
        )}

        {ageOk && (
          <>
            {/* Demo feed */}
            <section>
              <h2 className="font-semibold mb-3">Destacados</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <CreatorCard handle="mariana.fit" price={9.99} subs={1240} />
                <CreatorCard handle="arte.habana" price={4.99} subs={892} />
              </div>
            </section>

            <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <h3 className="font-semibold">Demo visor protegido (presigned 60s + watermark estudio)</h3>
              <p className="text-xs text-zinc-500 mb-3">La URL expira en 60s. Marca principal: handle del creador. ID del espectador solo como hash corto opcional y notificado.</p>
              <WatermarkedViewer
                src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
                creatorHandle="mariana.fit"
                viewerHash="a3f9c1"
                isVideo
                onReport={() => alert("Gracias por reportar. Revisaremos el contenido en <24h.")}
              />
            </section>

            <section className="grid sm:grid-cols-3 gap-3">
              <PayCard title="QvaPay" desc="Tarjeta / saldo QvaPay. Confirmación automática por webhook." cta="Pagar con QvaPay" />
              <PayCard title="USDT / TON" desc="Cripto. QR y dirección. Confirmación on-chain." cta="Pagar con cripto" />
              <PayCard title="CUP Manual" desc="Transferencia a tarjeta CUP. Sube captura, aprobación humana." cta="Subir comprobante" />
            </section>

            <details className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm">
              <summary className="font-semibold cursor-pointer">Cómo funciona initData + presigned URLs</summary>
              <pre className="mt-3 text-xs overflow-auto bg-black p-3 rounded-lg text-zinc-300">{`// Frontend TMA
const initData = window.Telegram.WebApp.initData
await fetch('/api/auth/telegram', { method:'POST', body: JSON.stringify({initData}) })

// Backend verifica HMAC-SHA256 con BOT_TOKEN
// Luego emite JWT y para media:
GET /api/media/:id -> verifica JWT + suscripción activa -> getPresignedUrl(s3Key, 60s)`}</pre>
            </details>
          </>
        )}

        <footer className="text-[11px] text-zinc-600 text-center py-6 border-t border-zinc-900">
          OnlyCu • Solo mayores de 18 • Tolerancia cero a contenido de menores o no consensuado • Reportar: /reportar
        </footer>
      </div>
    </main>
  );
}

function CreatorCard({ handle, price, subs }: { handle: string; price: number; subs: number }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="h-24 bg-gradient-to-br from-pink-600 to-violet-600" />
      <div className="p-4">
        <p className="font-semibold">@{handle}</p>
        <p className="text-xs text-zinc-500">{subs.toLocaleString()} suscriptores • ${price}/mes</p>
        <button className="mt-3 w-full bg-pink-600 hover:bg-pink-500 rounded-full py-2 text-sm font-semibold">Ver perfil</button>
      </div>
    </div>
  );
}
function PayCard({ title, desc, cta }: { title: string; desc: string; cta: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="font-semibold text-sm">{title}</p>
      <p className="text-xs text-zinc-500 mt-1">{desc}</p>
      <button className="mt-3 w-full bg-white text-black rounded-full py-2 text-sm font-medium">{cta}</button>
    </div>
  );
}
