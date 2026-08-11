"use client";
import { useState } from "react";
import { getCupDestination } from "@/lib/cup";

// NOTA: en cliente no hay env, así que mostramos valores por defecto y el backend los confirma
export function Paywall({ priceUSD, cupRate = 320 }: { priceUSD: number; cupRate?: number }) {
  const [method, setMethod] = useState<"QVAPAY" | "CRYPTO" | "CUP">("QVAPAY");
  const [crypto, setCrypto] = useState<"USDT" | "TON">("USDT");
  const cupAmount = Math.round(priceUSD * cupRate);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="flex gap-2 p-2 bg-black/50">
        <button onClick={() => setMethod("QVAPAY")} className={`flex-1 py-2 rounded-full text-sm font-medium ${method === "QVAPAY" ? "bg-sky-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>QvaPay</button>
        <button onClick={() => setMethod("CRYPTO")} className={`flex-1 py-2 rounded-full text-sm font-medium ${method === "CRYPTO" ? "bg-amber-500 text-black" : "bg-zinc-800 text-zinc-400"}`}>Cripto</button>
        <button onClick={() => setMethod("CUP")} className={`flex-1 py-2 rounded-full text-sm font-medium ${method === "CUP" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400"}`}>CUP</button>
      </div>

      <div className="p-4 space-y-3">
        {method === "QVAPAY" && (
          <div>
            <p className="text-sm font-semibold">Pagar con QvaPay (desde el exterior)</p>
            <p className="text-xs text-zinc-500 mt-1">Tarjeta internacional o saldo QvaPay. Confirmación automática por webhook en segundos.</p>
            <p className="text-lg font-bold mt-2">${priceUSD.toFixed(2)} USD</p>
            <button onClick={async () => {
              const res = await fetch("/api/payments/qvapay/create", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("onlycu_jwt") || ""}` }, body: JSON.stringify({ amount: priceUSD, description: `OnlyCu suscripción $${priceUSD}` }) });
              const j = await res.json();
              if (j.payUrl) window.open(j.payUrl, "_blank");
              else alert(j.error || "Error QvaPay - verifica .env");
            }} className="mt-3 w-full bg-sky-600 hover:bg-sky-500 rounded-full py-3 font-semibold">Ir a QvaPay →</button>
          </div>
        )}

        {method === "CRYPTO" && (
          <div>
            <p className="text-sm font-semibold">Pagar con criptomonedas</p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setCrypto("USDT")} className={`px-3 py-1 rounded-full text-xs border ${crypto === "USDT" ? "bg-emerald-600 border-emerald-600 text-white" : "border-zinc-700 text-zinc-400"}`}>USDT-TRC20</button>
              <button onClick={() => setCrypto("TON")} className={`px-3 py-1 rounded-full text-xs border ${crypto === "TON" ? "bg-sky-600 border-sky-600 text-white" : "border-zinc-700 text-zinc-400"}`}>TON</button>
            </div>
            <p className="text-xs text-zinc-500 mt-2">Red: {crypto === "USDT" ? "TRC20 (Tron)" : "TON"} • Monto: ${priceUSD} USD equivalente en {crypto}. Expira en 30 min.</p>
            <button onClick={async () => {
              const res = await fetch("/api/payments/crypto", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("onlycu_jwt") || ""}` }, body: JSON.stringify({ currency: crypto, amount: priceUSD }) });
              const j = await res.json();
              if (j.address) alert(`Envía ${j.amountUSD} USD en ${crypto} a:\n${j.address}\n\nQR: ${j.qrPayload}`);
              else alert(j.error);
            }} className="mt-3 w-full bg-amber-500 hover:bg-amber-400 text-black rounded-full py-3 font-semibold">Ver dirección y QR →</button>
          </div>
        )}

        {method === "CUP" && (
          <div>
            <p className="text-sm font-semibold">Transferencia en Pesos Cubanos (CUP)</p>
            <p className="text-xs text-zinc-500 mt-1">Para usuarios dentro de Cuba via Transfermóvil / EnZona. Requiere comprobante y aprobación humana &lt;24h.</p>
            <div className="bg-black rounded-xl p-3 mt-3 border border-zinc-800 font-mono text-sm">
              <p className="text-zinc-500 text-xs">Tarjeta destino</p>
              <p className="font-bold tracking-widest">9225 9598 7XXX XXXX</p>
              <p className="text-xs text-zinc-500 mt-1">Titular: OnlyCu • BANDEC</p>
              <p className="text-emerald-400 font-bold mt-2 text-lg">{cupAmount.toLocaleString("es-CU")} CUP</p>
              <p className="text-[11px] text-zinc-600">≈ ${priceUSD} USD × {cupRate} CUP</p>
            </div>
            <ol className="text-xs text-zinc-400 mt-2 list-decimal ml-4 space-y-1">
              <li>Transfiere el monto exacto en CUP</li>
              <li>Guarda captura con ID visible</li>
              <li>Súbela abajo con últimos 4 dígitos</li>
            </ol>
            <a href="/pagar/cup" className="mt-3 block text-center w-full bg-emerald-600 hover:bg-emerald-500 rounded-full py-3 font-semibold">Subir comprobante CUP →</a>
          </div>
        )}
      </div>
    </div>
  );
}
