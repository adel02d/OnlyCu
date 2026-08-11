"use client";
import { useEffect, useState } from "react";
import { getPresignedUrl } from "@/lib/s3"; // solo para referencia - en cliente usamos endpoint

export default function AdminPage() {
  const [pending, setPending] = useState<any[]>([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const token = localStorage.getItem("onlycu_jwt") || "";
    const res = await fetch("/api/admin/manual-review", { headers: { Authorization: `Bearer ${token}` } });
    const j = await res.json();
    if (res.ok) setPending(j.pending);
    else setMsg(j.error);
  };
  useEffect(() => { load(); }, []);

  const review = async (proofId: string, action: "approve" | "reject") => {
    const notes = prompt(action === "reject" ? "Motivo del rechazo:" : "Notas (opcional):") || "";
    const token = localStorage.getItem("onlycu_jwt") || "";
    const res = await fetch("/api/admin/manual-review", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ proofId, action, notes }),
    });
    const j = await res.json();
    if (res.ok) { setMsg(`✅ ${action} OK`); load(); }
    else setMsg(`❌ ${j.error}`);
  };

  return (
    <main className="min-h-screen bg-black text-white max-w-4xl mx-auto p-4">
      <h1 className="text-xl font-bold">Admin — Verificación de capturas CUP</h1>
      <p className="text-xs text-zinc-500">Solo ADMIN_TELEGRAM_IDS. Compara cada captura con el extracto bancario antes de aprobar.</p>
      {msg && <p className="mt-2 text-sm bg-zinc-900 border border-zinc-800 rounded p-2">{msg}</p>}

      <div className="mt-4 space-y-3">
        {pending.length === 0 && <p className="text-sm text-zinc-600">No hay comprobantes pendientes.</p>}
        {pending.map((p) => (
          <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className="text-sm font-mono">{p.amount} {p.currency} • Ref: {p.transferRef || "—"} • {new Date(p.createdAt).toLocaleString("es-CU")}</p>
            <p className="text-xs text-zinc-500">Usuario: @{p.user?.username || "?"} ({String(p.user?.telegramId)})</p>
            <p className="text-xs mt-1">S3 key: <span className="font-mono text-sky-300">{p.screenshotUrl}</span> <a href={`/api/media/proof/${p.id}`} target="_blank" className="underline ml-2">ver captura (presigned 60s)</a></p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => review(p.id, "approve")} className="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded-full py-2 text-sm font-semibold">Aprobar — llegó</button>
              <button onClick={() => review(p.id, "reject")} className="flex-1 bg-red-600 hover:bg-red-500 rounded-full py-2 text-sm font-semibold">Rechazar</button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
