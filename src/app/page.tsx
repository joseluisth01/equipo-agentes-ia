"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, RUN_STATUS } from "@/components/ui";
import type { RunStatus } from "@/lib/types";

interface RunRow {
  id: string;
  request: string;
  template: string;
  status: RunStatus;
  llm_mode: "llm" | "demo";
  created_at: string;
  total: number;
  done: number;
}
interface Meta {
  runs: RunRow[];
  templates: { id: string; name: string; description: string }[];
  llm: { available: boolean; provider: string; model: string };
}

const EXAMPLES = [
  "Añade una página de contacto a esta web",
  "Añade una página de reservas con formulario de fecha, hora y número de personas",
  "Crea una sección de preguntas frecuentes en una página nueva",
];

export default function Home() {
  const router = useRouter();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState("");
  const [request, setRequest] = useState(EXAMPLES[0]);
  const [template, setTemplate] = useState("restaurante");
  const [demo, setDemo] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setMeta(d)))
      .catch((e) => setError(String(e)));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request, template, demo }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      setSending(false);
      return;
    }
    router.push(`/runs/${data.id}`);
  }

  const llmOn = meta?.llm.available;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Pide un cambio y mira cómo lo resuelve el equipo</h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          El <b className="text-violet-700">Orquestador</b> divide la petición en tareas con comprobaciones,{" "}
          <b className="text-sky-700">Develop</b> las implementa sobre la web y <b className="text-emerald-700">Testing</b> las prueba
          y le devuelve lo que falla, hasta que todo pasa.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <label htmlFor="request" className="text-sm font-medium">
              Petición del cliente
            </label>
            <textarea
              id="request"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              rows={3}
              maxLength={500}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button type="button" key={ex} onClick={() => setRequest(ex)} className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-medium">Web sobre la que trabajar</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {(meta?.templates ?? []).map((t) => (
                <label key={t.id} className={`cursor-pointer rounded-lg border p-3 text-sm ${template === t.id ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200"}`}>
                  <input type="radio" name="template" value={t.id} checked={template === t.id} onChange={() => setTemplate(t.id)} className="sr-only" />
                  <span className="font-medium">{t.name}</span>
                  <span className="block text-gray-500">{t.description}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={demo || !llmOn} disabled={!llmOn} onChange={(e) => setDemo(e.target.checked)} className="mt-1" />
            <span>
              Modo demo sin LLM <span className="text-gray-500">— respuestas guionizadas, mismas comprobaciones reales. Útil si la cuota gratuita del modelo se agota.</span>
            </span>
          </label>

          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <button disabled={sending || !meta} className="rounded-md bg-gray-900 px-5 py-2.5 font-medium text-white disabled:opacity-50">
            {sending ? "Creando…" : "Lanzar al equipo"}
          </button>
        </form>
      </section>

      <aside className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <div className="font-medium">Modelo de IA</div>
          {meta ? (
            llmOn ? (
              <p className="mt-1 text-gray-600">
                <Badge cls="bg-emerald-100 text-emerald-800">Conectado</Badge> {meta.llm.provider} · <code>{meta.llm.model}</code>
              </p>
            ) : (
              <p className="mt-1 text-gray-600">
                <Badge cls="bg-amber-100 text-amber-800">Sin clave</Badge> Funcionando en modo demo.
              </p>
            )
          ) : (
            <p className="mt-1 text-gray-400">Cargando…</p>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3 text-sm font-medium">Ejecuciones recientes</div>
          <ul className="divide-y divide-gray-100">
            {meta?.runs.length === 0 && <li className="px-4 py-3 text-sm text-gray-500">Todavía no hay ninguna.</li>}
            {meta?.runs.map((r) => (
              <li key={r.id}>
                <Link href={`/runs/${r.id}`} className="block px-4 py-3 hover:bg-gray-50">
                  <div className="line-clamp-1 text-sm">{r.request}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                    <Badge cls={RUN_STATUS[r.status].cls}>{RUN_STATUS[r.status].label}</Badge>
                    {r.total > 0 && (
                      <span>
                        {r.done}/{r.total} tareas
                      </span>
                    )}
                    {r.llm_mode === "demo" && <span>· demo</span>}
                    <span className="ml-auto">{new Date(r.created_at).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
