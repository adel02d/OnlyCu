"use client";
import { useEffect, useState } from "react";

const STORAGE_KEY = "onlycu_age_verified";
const TERMS_VERSION = "1.0";

export default function AgeGate({ onVerified }: { onVerified?: () => void }) {
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const v = localStorage.getItem(STORAGE_KEY);
    if (!v) setVisible(true);
    else {
      // Si ya verificó, notificar al padre
      onVerified?.();
    }
  }, [onVerified]);

  if (!visible) return null;

  const handleConfirm = async () => {
    if (!checked || !accepted) return;
    // Guardar local
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: new Date().toISOString(), version: TERMS_VERSION }));
    // Intentar registrar en backend si hay initData (no bloquea)
    try {
      const initData = (window as any)?.Telegram?.WebApp?.initData || "";
      if (initData) {
        await fetch("/api/auth/verify-age", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData, acceptedTermsVersion: TERMS_VERSION }),
        });
      }
    } catch {}
    setVisible(false);
    onVerified?.();
  };

  const handleLeave = () => {
    // Redirigir fuera - en TMA cerrar webapp
    if ((window as any)?.Telegram?.WebApp?.close) {
      (window as any).Telegram.WebApp.close();
    } else {
      window.location.href = "https://telegram.org";
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-md w-full p-6 text-white shadow-2xl">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">OnlyCu</h1>
          <p className="text-sm text-zinc-400 mt-1">Plataforma de creadores • Contenido exclusivo</p>
        </div>

        <div className="bg-amber-950/50 border border-amber-800 rounded-xl p-4 mb-5">
          <p className="text-amber-200 font-semibold text-center">🔞 Contenido solo para mayores de 18 años</p>
          <p className="text-xs text-amber-300/80 mt-2 text-center">
            Esta plataforma puede contener contenido para adultos de creadores verificados. Debes tener 18 años o más y aceptar los Términos para continuar.
          </p>
        </div>

        <div className="space-y-3 mb-6 text-sm">
          <label className="flex gap-3 items-start cursor-pointer bg-zinc-800 rounded-lg p-3 border border-zinc-700">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 accent-pink-600" />
            <span>Confirmo que tengo <b>18 años o más</b> y que todo el contenido que consuma o publique involucra únicamente a mayores de edad que consienten.</span>
          </label>
          <label className="flex gap-3 items-start cursor-pointer bg-zinc-800 rounded-lg p-3 border border-zinc-700">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 accent-pink-600" />
            <span>Acepto los <a href="/terminos" target="_blank" className="underline text-pink-400">Términos y Condiciones</a> y la <a href="/privacidad" target="_blank" className="underline text-pink-400">Política de Privacidad</a>, incluyendo moderación, reporte y tolerancia cero a contenido no consensuado o de menores.</span>
          </label>
        </div>

        <div className="flex gap-3">
          <button onClick={handleLeave} className="flex-1 py-3 rounded-xl bg-zinc-800 border border-zinc-700 font-medium hover:bg-zinc-700">
            Soy menor de edad / Salir
          </button>
          <button
            onClick={handleConfirm}
            disabled={!checked || !accepted}
            className="flex-1 py-3 rounded-xl bg-pink-600 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-pink-500"
          >
            Sí, tengo 18+ • Entrar
          </button>
        </div>

        <p className="text-[11px] text-zinc-500 text-center mt-4">
          Cuba: pagos internacionales vía QvaPay y criptomonedas (USDT/TON). Transferencias CUP manuales requieren comprobante y aprobación.
        </p>
      </div>
    </div>
  );
}
