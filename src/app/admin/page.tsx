"use client";
import { useEffect, useState } from "react";

export default function AdminPage() {
  const [pending, setPending] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"capturas" | "creadores" | "pagos">("capturas");

  const load = async () => {
    const token = localStorage.getItem("onlycu_jwt") || "";
    const res = await fetch("/api/admin/manual-review", { headers: { Authorization: `Bearer ${token}` } });
    const j = await res.json();
    if (res.ok) setPending(j.pending);
    else setMsg(j.error);

    // stats del admin (reusa creator stats si es creador, sino muestra global)
    const s = await fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } });
    const sj = await s.json();
    if (s.ok) { setStats(sj); setReports(sj.reports || []); }
  };
  useEffect(() => { load(); }, []);

  const review = async (proofId: string, action: "approve" | "reject") => {
    const notes = prompt(action === "reject" ? "Motivo del rechazo (quedará auditado):" : "Notas (opcional):") || "";
    const token = localStorage.getItem("onlycu_jwt") || "";
    const res = await fetch("/api/admin/manual-review", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ proofId, action, notes }),
    });
    const j = await res.json();
    if (res.ok) { setMsg(`✅ ${action} OK — ${proofId}`); load(); }
    else setMsg(`❌ ${j.error}`);
  };

  const openProof = async (id: string) => {
    const token = localStorage.getItem("onlycu_jwt") || "";
    const res = await fetch(`/api/media/proof/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await res.json();
    if (j.url) window.open(j.url, "_blank");
    else alert(j.error);
  };

  return (
    <main className="min-h-screen bg-black text-white max-w-5xl mx-auto p-4">
      <a href="/" className="text-sm text-zinc-400">← Volver</a>
      <h1 className="text-xl font-bold mt-2">Panel de Control — Admin</h1>
      <p className="text-xs text-zinc-500">Solo <span className="font-mono">ADMIN_TELEGRAM_IDS</span>. Aquí verificas capturas CUP, gestionas creadores y ves pagos QvaPay/Cripto.</p>
      {msg && <p className="mt-2 text-sm bg-zinc-900 border border-zinc-800 rounded p-2">{msg}</p>}

      {/* Tabs */}
      <div className="flex gap-2 mt-4">
        {["capturas", "creadores", "pagos"].map((t) => (
          <button key={t} onClick={() => setTab(t as any)} className={`px-4 py-2 rounded-full text-sm capitalize border ${tab === t ? "bg-white text-black border-white" : "bg-zinc-900 border-zinc-800 text-zinc-400"}`}>{t}</button>
        ))}
      </div>

      {/* Stats rápidas */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center"><p className="text-xl font-bold">{stats.totalUsers}</p><p className="text-xs text-zinc-500">Usuarios</p></div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center"><p className="text-xl font-bold">{stats.totalCreators}</p><p className="text-xs text-zinc-500">Creadores</p></div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center"><p className="text-xl font-bold">{stats.totalPayments}</p><p className="text-xs text-zinc-500">Pagos totales</p></div>
        </div>
      )}

      {tab === "capturas" && (
        <section className="mt-6">
          <h2 className="font-semibold">Capturas CUP por verificar ({pending.length})</h2>
          <p className="text-xs text-zinc-500">Compara cada captura con tu extracto de Transfermóvil/BANDEC antes de aprobar. Todo queda con <span className="font-mono">reviewedBy/reviewedAt</span>.</p>
          <div className="mt-3 space-y-3">
            {pending.length === 0 && <p className="text-sm text-zinc-600 bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">No hay comprobantes pendientes 🎉</p>}
            {pending.map((p) => (
              <div key={p.id} className="bg-zinc-900 border border-amber-900/50 rounded-xl p-4">
                <div className="flex justify-between text-sm">
                  <span className="font-mono font-bold text-emerald-300">{p.amount} {p.currency}</span>
                  <span className="text-xs text-zinc-500">{new Date(p.createdAt).toLocaleString("es-CU")}</span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">Usuario: @{p.user?.username || "?"} • TG: {String(p.user?.telegramId)} • Ref: <span className="font-mono">{p.transferRef || "—"}</span></p>
                <p className="text-xs mt-1 font-mono text-sky-300 truncate">S3: {p.screenshotUrl}</p>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => openProof(p.id)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-full py-2 text-sm">Ver captura (60s)</button>
                  <button onClick={() => review(p.id, "approve")} className="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded-full py-2 text-sm font-semibold">Aprobar ✓ llegó</button>
                  <button onClick={() => review(p.id, "reject")} className="flex-1 bg-red-600 hover:bg-red-500 rounded-full py-2 text-sm font-semibold">Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "creadores" && (
        <section className="mt-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <h2 className="font-semibold">Creadores</h2>
          <p className="text-xs text-zinc-500 mt-1">Verificación +18 y estado. (Datos de <span className="font-mono">CreatorProfile</span>)</p>
          <div className="mt-3 space-y-2">
            {(stats?.creators || []).map((c: any) => (
              <div key={c.id} className="bg-black border border-zinc-800 rounded-xl p-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">@{c.displayName} • ${c.subscriptionPrice}/mes</p>
                  <p className="text-xs text-zinc-500">{c.isVerified ? "✅ Verificado" : "⚠️ Pendiente verificación"} • {c.isActive ? "Activo" : "Pausado"}</p>
                </div>
                <span className="text-xs font-mono text-zinc-600">{c.id.slice(0, 8)}</span>
              </div>
            ))}
            {(!stats?.creators || stats.creators.length === 0) && <p className="text-sm text-zinc-600">Sin creadores aún.</p>}
          </div>
        </section>
      )}

      {tab === "pagos" && (
        <section className="mt-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <h2 className="font-semibold">Pagos recientes (QvaPay / Cripto / CUP)</h2>
          <div className="mt-3 space-y-2 max-h-[50vh] overflow-auto">
            {(stats?.recentPayments || []).map((p: any) => (
              <div key={p.id} className="bg-black border border-zinc-800 rounded-lg p-2 flex justify-between text-xs">
                <span className="font-mono">{p.method} • {p.amount} {p.currency} • {p.status}</span>
                <span className="text-zinc-500">{new Date(p.createdAt).toLocaleDateString("es-CU")}</span>
              </div>
            ))}
            {(!stats?.recentPayments || stats.recentPayments.length === 0) && <p className="text-sm text-zinc-600">Sin pagos aún.</p>}
          </div>
        </section>
      )}

      <section className="mt-6 bg-amber-950/30 border border-amber-900 rounded-xl p-3 text-xs text-amber-200">
        <p className="font-semibold">Reglas de verificación CUP:</p>
        <ul className="list-disc ml-4 mt-1 space-y-1 text-amber-200/80">
          <li>Nunca apruebes sin ver monto exacto + fecha de hoy en la captura vs extracto.</li>
          <li>Rechaza si la captura está recortada, borrosa o el ID no coincide.</li>
          <li>Todo queda auditado: <span className="font-mono">reviewedBy / reviewedAt / notes</span> en BD.</li>
        </ul>
      </section>
    </main>
  );
}
