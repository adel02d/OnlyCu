"use client";
import { useState } from "react";

export default function PagarCupPage() {
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState("3200");
  const [transferRef, setTransferRef] = useState("");
  const [status, setStatus] = useState("");

  const handleUpload = async () => {
    if (!file) return alert("Selecciona la captura");
    if (!amount || !transferRef) return alert("Completa monto y referencia");
    setStatus("Subiendo captura...");

    try {
      // 1. Pedir presigned POST
      const token = localStorage.getItem("onlycu_jwt") || "";
      const presRes = await fetch("/api/uploads/proof", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      const pres = await presRes.json();
      if (!presRes.ok) throw new Error(pres.error);

      // 2. Subir directo a S3/R2
      const form = new FormData();
      Object.entries(pres.fields).forEach(([k, v]) => form.append(k, v as string));
      form.append("file", file);
      const up = await fetch(pres.url, { method: "POST", body: form });
      if (!up.ok) throw new Error("Error subiendo a S3");

      // 3. Crear ManualProof + Payment
      setStatus("Verificando...");
      const payRes = await fetch("/api/payments/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount, transferRef, screenshotS3Key: pres.s3Key }),
      });
      const pay = await payRes.json();
      if (!payRes.ok) throw new Error(pay.error);
      setStatus(`✅ Comprobante recibido (ID: ${pay.proofId}). Revisión en <24h. No borres el SMS.`);
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white max-w-lg mx-auto p-4">
      <a href="/" className="text-sm text-zinc-400">← Volver</a>
      <h1 className="text-xl font-bold mt-4">Pagar en CUP con captura</h1>
      <p className="text-xs text-zinc-500 mt-1">Transferencia manual via Transfermóvil / EnZona. Sube la captura para que el admin verifique si llegó.</p>

      <div className="bg-sky-950/30 border border-sky-900 rounded-xl p-3 mt-4 font-mono text-sm">
        <p className="text-xs text-sky-300">Transfiere a:</p>
        <p className="font-bold tracking-widest text-white">9225 9598 7XXX XXXX</p>
        <p className="text-xs text-zinc-500">Titular: OnlyCu — BANDEC</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mt-4 space-y-3">
        <div>
          <label className="text-xs text-zinc-400">Monto transferido (CUP)</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full mt-1 bg-black border border-zinc-700 rounded-lg px-3 py-2 text-sm" placeholder="Ej: 3200" />
        </div>
        <div>
          <label className="text-xs text-zinc-400">Últimos 4 dígitos / ID de transacción</label>
          <input value={transferRef} onChange={(e) => setTransferRef(e.target.value)} className="w-full mt-1 bg-black border border-zinc-700 rounded-lg px-3 py-2 text-sm" placeholder="Ej: a3f9" />
        </div>
        <div>
          <label className="text-xs text-zinc-400">Captura de pantalla del comprobante (Transfermóvil)</label>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full mt-1 text-sm text-zinc-400" />
          <p className="text-[11px] text-zinc-600 mt-1">Debe verse el monto, fecha, hora y ID. Máx 8MB. Queda guardada como prueba auditable.</p>
        </div>
        <button onClick={handleUpload} className="w-full bg-emerald-600 hover:bg-emerald-500 rounded-full py-3 font-semibold text-sm">Subir comprobante y esperar verificación</button>
        {status && <p className="text-sm bg-black rounded-lg p-3 border border-zinc-800">{status}</p>}
      </div>

      <p className="text-[11px] text-zinc-600 mt-4 text-center">El admin revisa en &lt;24h comparando tu captura con el extracto bancario. Si coincide → se activa tu suscripción automáticamente.</p>
    </main>
  );
}
