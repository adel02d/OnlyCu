"use client";
import { useEffect, useState } from "react";

export default function CreatorPanel() {
  const [stats, setStats] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ displayName: "", bio: "", subscriptionPrice: "9.99" });
  const [postForm, setPostForm] = useState({ title: "", caption: "", isPPV: false, ppvPrice: "" });
  const [file, setFile] = useState<File | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("onlycu_jwt") || "" : "";

  const load = async () => {
    const res = await fetch("/api/creator/stats", { headers: { Authorization: `Bearer ${localStorage.getItem("onlycu_jwt") || ""}` } });
    const j = await res.json();
    if (res.ok) { setStats(j.stats); setProfile(j.profile); }
    else setMsg(j.error);
  };
  useEffect(() => { load(); }, []);

  const become = async () => {
    const res = await fetch("/api/creator/become", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("onlycu_jwt") || ""}` }, body: JSON.stringify(form) });
    const j = await res.json();
    if (res.ok) { setMsg("✅ Perfil creador creado"); load(); } else setMsg(`❌ ${j.error}`);
  };

  const createPost = async () => {
    if (!file) return setMsg("Selecciona foto/video");
    setMsg("Subiendo media...");
    // 1. presigned
    const pres = await fetch("/api/uploads/media", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("onlycu_jwt") || ""}` }, body: JSON.stringify({ filename: file.name, contentType: file.type }) }).then(r => r.json());
    const fd = new FormData();
    Object.entries(pres.fields).forEach(([k, v]) => fd.append(k, v as string));
    fd.append("file", file);
    await fetch(pres.url, { method: "POST", body: fd });
    // 2. crear post
    const res = await fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("onlycu_jwt") || ""}` }, body: JSON.stringify({ ...postForm, ppvPrice: postForm.ppvPrice || null, s3Keys: [pres.s3Key] }) });
    const j = await res.json();
    if (res.ok) { setMsg("✅ Post publicado"); setPostForm({ title: "", caption: "", isPPV: false, ppvPrice: "" }); load(); } else setMsg(`❌ ${j.error}`);
  };

  if (!profile) {
    return (
      <main className="min-h-screen bg-black text-white max-w-lg mx-auto p-4">
        <a href="/" className="text-sm text-zinc-400">← Volver</a>
        <h1 className="text-xl font-bold mt-4">Panel del Creador</h1>
        <p className="text-xs text-zinc-500 mt-1">Activa tu perfil para monetizar con QvaPay + Cripto + CUP. Solo +18 verificado.</p>
        {msg && <p className="mt-3 text-sm bg-zinc-900 border border-zinc-800 rounded p-2">{msg}</p>}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mt-4 space-y-3">
          <input placeholder="Nombre público ej: Mariana Fit" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} className="w-full bg-black border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
          <textarea placeholder="Bio" value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} className="w-full bg-black border border-zinc-700 rounded-lg px-3 py-2 text-sm" rows={2} />
          <div>
            <label className="text-xs text-zinc-400">Precio suscripción (USD/mes)</label>
            <input value={form.subscriptionPrice} onChange={e => setForm({ ...form, subscriptionPrice: e.target.value })} className="w-full mt-1 bg-black border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
          </div>
          <button onClick={become} className="w-full bg-pink-600 hover:bg-pink-500 rounded-full py-3 font-semibold">Activar perfil creador</button>
        </div>
        <div className="mt-6 bg-amber-950/40 border border-amber-900 rounded-xl p-3 text-xs text-amber-200">
          <p className="font-semibold">Requisitos:</p>
          <ul className="list-disc ml-4 mt-1 space-y-1 text-amber-200/80">
            <li>Verificación +18 (AgeGate) obligatoria</li>
            <li>Contenido consensuado y mayor de edad — tolerancia cero</li>
            <li>Retiros: QvaPay / USDT / TON o CUP (según config admin)</li>
          </ul>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white max-w-3xl mx-auto p-4">
      <a href="/" className="text-sm text-zinc-400">← Volver</a>
      <h1 className="text-xl font-bold mt-2">Panel del Creador — @{profile.displayName}</h1>
      {msg && <p className="mt-2 text-sm bg-zinc-900 border border-zinc-800 rounded p-2">{msg}</p>}

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold">{stats?.subs ?? 0}</p><p className="text-xs text-zinc-500">Suscriptores</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold">${stats?.totalUSD?.toFixed(0) ?? 0}</p><p className="text-xs text-zinc-500">Ingresos USD</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold">{stats?.totalCUP?.toLocaleString("es-CU") ?? 0}</p><p className="text-xs text-zinc-500">CUP</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div className="bg-sky-950/30 border border-sky-900 rounded-xl p-3 text-center">
          <p className="text-lg font-bold">{stats?.posts ?? 0}</p><p className="text-xs text-sky-200/70">Posts</p>
        </div>
        <div className="bg-amber-950/30 border border-amber-900 rounded-xl p-3 text-center">
          <p className="text-lg font-bold">{stats?.pendingProofs ?? 0}</p><p className="text-xs text-amber-200/70">CUP por verificar</p>
        </div>
      </div>

      {/* Crear post */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mt-6">
        <h2 className="font-semibold">Nuevo post</h2>
        <div className="space-y-2 mt-3">
          <input placeholder="Título (opcional)" value={postForm.title} onChange={e => setPostForm({ ...postForm, title: e.target.value })} className="w-full bg-black border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
          <textarea placeholder="Descripción" value={postForm.caption} onChange={e => setPostForm({ ...postForm, caption: e.target.value })} className="w-full bg-black border border-zinc-700 rounded-lg px-3 py-2 text-sm" rows={2} />
          <input type="file" accept="image/*,video/*" onChange={e => setFile(e.target.files?.[0] || null)} className="w-full text-sm text-zinc-400" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={postForm.isPPV} onChange={e => setPostForm({ ...postForm, isPPV: e.target.checked })} /> PPV (pago por ver)
          </label>
          {postForm.isPPV && (
            <input placeholder="Precio PPV USD ej: 2.99" value={postForm.ppvPrice} onChange={e => setPostForm({ ...postForm, ppvPrice: e.target.value })} className="w-full bg-black border border-zinc-700 rounded-lg px-3 py-2 text-sm" />
          )}
          <button onClick={createPost} className="w-full bg-pink-600 hover:bg-pink-500 rounded-full py-3 font-semibold">Publicar (presigned 60s + watermark)</button>
          <p className="text-[11px] text-zinc-600">La media se sube a S3 y solo se sirve con URL de 60s. Marca de agua del estudio automática.</p>
        </div>
      </section>

      {/* Config pagos */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mt-4">
        <h2 className="font-semibold text-sm">Cómo te pagan</h2>
        <ul className="text-xs text-zinc-400 mt-2 space-y-1 list-disc ml-4">
          <li><b className="text-sky-300">QvaPay</b> — automático, webhook confirma en segundos (usuarios en el exterior).</li>
          <li><b className="text-amber-300">USDT-TRC20 / TON</b> — dirección + QR, webhook confirma on-chain.</li>
          <li><b className="text-emerald-300">CUP (captura)</b> — el admin verifica tu extracto vs captura del fan en &lt;24h y te acredita.</li>
        </ul>
      </section>
    </main>
  );
}
