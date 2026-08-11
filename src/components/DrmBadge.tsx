"use client";

export function DrmBadge() {
  return (
    <div className="flex flex-wrap gap-2 text-[11px]">
      <span className="bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-full">🔒 Presigned 60s</span>
      <span className="bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-full">💧 Watermark estudio</span>
      <span className="bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-full">🎯 Hash espectador (anon)</span>
      <span className="bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-full">🚫 nodownload + no PIP</span>
      <span className="bg-amber-950/40 border border-amber-900 px-2.5 py-1 rounded-full text-amber-200">⚠️ No impide grabación SO</span>
    </div>
  );
}
