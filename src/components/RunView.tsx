"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AGENTS, Badge, RUN_STATUS, TASK_STATUS } from "./ui";
import type { AgentName, RunState, Task, TaskStatus } from "@/lib/types";

type Driver = { mode: "running" | "paused" | "waiting" | "error" | "finished"; message?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function RunView({ id }: { id: string }) {
  const [state, setState] = useState<RunState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [driver, setDriver] = useState<Driver>({ mode: "running" });
  const pausedRef = useRef(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/runs/${id}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) setLoadError(data.error ?? "Error");
    else setState(data);
    return res.ok ? (data as RunState) : null;
  }, [id]);

  // Conductor: pide pasos al servidor uno tras otro mientras la ejecución siga viva.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let errors = 0;
      while (!cancelled) {
        const s = await refresh().catch(() => null);
        if (!s) return;
        if (s.run.status === "completed" || s.run.status === "failed") {
          setDriver({ mode: "finished" });
          return;
        }
        if (pausedRef.current) {
          await sleep(800);
          continue;
        }
        setDriver({ mode: "running" });
        const poll = setInterval(() => refresh().catch(() => {}), 1500);
        const res = await fetch(`/api/runs/${id}/step`, { method: "POST" })
          .then((r) => r.json())
          .catch((e) => ({ ok: false, error: String(e) }));
        clearInterval(poll);
        if (cancelled) return;
        if (res.ok) {
          errors = 0;
          continue;
        }
        if (res.busy) {
          await sleep(2000); // otra pestaña está ejecutando el paso
        } else if (res.retryAfter) {
          setDriver({ mode: "waiting", message: `Plan gratuito del LLM: esperando ${res.retryAfter}s…` });
          await sleep(res.retryAfter * 1000);
        } else {
          errors++;
          if (errors >= 3) {
            setDriver({ mode: "error", message: res.error ?? "Error desconocido" });
            pausedRef.current = true;
            await refresh().catch(() => {});
            // queda en pausa hasta que el usuario pulse «Reintentar»
          } else {
            await sleep(3000);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, refresh]);

  if (loadError) return <p className="rounded-md bg-red-50 p-4 text-red-700">{loadError}</p>;
  if (!state) return <p className="text-gray-500">Cargando ejecución…</p>;

  const { run, tasks } = state;
  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">
            ← Nueva petición
          </Link>
          <h1 className="mt-1 text-xl font-semibold">«{run.request}»</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <Badge cls={RUN_STATUS[run.status].cls}>{RUN_STATUS[run.status].label}</Badge>
            {tasks.length > 0 && (
              <span>
                {done}/{tasks.length} tareas completadas
              </span>
            )}
            <span>· {run.llm_mode === "demo" ? "Modo demo (sin LLM)" : "Modo LLM"}</span>
          </div>
        </div>
        <DriverControls
          driver={driver}
          onPause={() => {
            pausedRef.current = true;
            setDriver({ mode: "paused" });
          }}
          onResume={() => {
            pausedRef.current = false;
            setDriver({ mode: "running" });
          }}
        />
      </div>

      {run.summary && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm">
          <div className="font-medium text-violet-800">Resumen del Orquestador para el cliente</div>
          <p className="mt-1 text-violet-900">{run.summary}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(AGENTS) as AgentName[]).map((a) => (
          <AgentCard key={a} agent={a} info={state.agents[a]} last={[...state.events].reverse().find((e) => e.agent === a)?.message} />
        ))}
      </div>

      <TaskBoard tasks={tasks} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Timeline state={state} />
        <FilesPanel state={state} />
      </div>
    </div>
  );
}

function DriverControls({ driver, onPause, onResume }: { driver: Driver; onPause: () => void; onResume: () => void }) {
  if (driver.mode === "finished") return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      {driver.message && <span className={driver.mode === "error" ? "max-w-md text-red-600" : "text-amber-700"}>{driver.message}</span>}
      {driver.mode === "paused" || driver.mode === "error" ? (
        <button onClick={onResume} className="rounded-md bg-gray-900 px-3 py-1.5 text-white">
          {driver.mode === "error" ? "Reintentar" : "Reanudar"}
        </button>
      ) : (
        <button onClick={onPause} className="rounded-md border border-gray-300 px-3 py-1.5">
          Pausar
        </button>
      )}
    </div>
  );
}

function AgentCard({ agent, info, last }: { agent: AgentName; info: RunState["agents"][AgentName]; last?: string }) {
  const a = AGENTS[agent];
  const dot = {
    working: "bg-blue-500 pulse-ring",
    waiting: "bg-amber-400",
    idle: "bg-gray-300",
    done: "bg-emerald-500",
  }[info.state];
  const label = { working: "Trabajando", waiting: "Esperando", idle: "Inactivo", done: "Terminado" }[info.state];
  return (
    <div className={`rounded-xl border ${a.ring} ${a.bg} p-4`}>
      <div className="flex items-center justify-between">
        <div>
          <div className={`font-semibold ${a.color}`}>{a.name}</div>
          <div className="text-xs text-gray-500">{a.role}</div>
        </div>
        <span className="flex items-center gap-2 text-xs text-gray-600">
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          {label}
        </span>
      </div>
      <p className="mt-3 text-sm font-medium text-gray-800">{info.detail}</p>
      {last && <p className="mt-1 line-clamp-2 text-xs text-gray-500">Último: {last}</p>}
    </div>
  );
}

const COLUMNS: { title: string; statuses: TaskStatus[] }[] = [
  { title: "Pendiente", statuses: ["pending"] },
  { title: "Develop", statuses: ["developing", "changes_requested"] },
  { title: "Testing", statuses: ["testing"] },
  { title: "Cerradas", statuses: ["done", "failed"] },
];

function TaskBoard({ tasks }: { tasks: Task[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (tasks.length === 0) {
    return <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">El Orquestador está creando las tareas…</div>;
  }
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-gray-700">Tablero de tareas</h2>
      <div className="grid gap-3 md:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => col.statuses.includes(t.status));
          return (
            <div key={col.title} className="rounded-xl bg-gray-100 p-3">
              <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-gray-500">
                {col.title} <span>{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((t) => (
                  <button key={t.id} onClick={() => setOpen(open === t.id ? null : t.id)} className="block w-full rounded-lg border border-gray-200 bg-white p-3 text-left text-sm shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">
                        {t.position + 1}. {t.title}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                      <Badge cls={TASK_STATUS[t.status].cls}>{TASK_STATUS[t.status].label}</Badge>
                      {t.attempts > 0 && <span>{t.attempts} intento(s)</span>}
                      <span className="ml-auto">{t.checks.length} checks</span>
                    </div>
                    {open === t.id && <TaskDetail task={t} />}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskDetail({ task }: { task: Task }) {
  const results = task.feedback?.checks;
  return (
    <div className="mt-3 space-y-2 border-t border-gray-100 pt-3 text-xs">
      <p className="text-gray-600">{task.description}</p>
      <ul className="space-y-1">
        {(results ?? task.checks.map((c) => ({ check: c, passed: null as boolean | null, detail: describeCheck(c) }))).map((r, i) => (
          <li key={i} className="flex gap-2">
            <span className={r.passed === null ? "text-gray-400" : r.passed ? "text-emerald-600" : "text-red-600"}>{r.passed === null ? "○" : r.passed ? "✔" : "✘"}</span>
            <span className="text-gray-700">{r.detail}</span>
          </li>
        ))}
      </ul>
      {task.feedback?.issues?.length ? (
        <div className="rounded-md bg-orange-50 p-2 text-orange-800">
          <div className="font-medium">Fallos devueltos por Testing</div>
          <ul className="list-disc pl-4">
            {task.feedback.issues.map((i, k) => (
              <li key={k}>{i}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function describeCheck(c: Task["checks"][number]) {
  switch (c.type) {
    case "file_exists":
      return `Existe ${c.path}`;
    case "valid_html":
      return `${c.path} es HTML válido`;
    case "selector_exists":
      return `${c.path} contiene «${c.selector}»`;
    case "text_contains":
      return `${c.path} incluye «${c.text}»`;
    case "link_to":
      return `${c.path} enlaza a ${c.href}`;
  }
}

function Timeline({ state }: { state: RunState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [state.events.length]);
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-700">Actividad de los agentes</div>
      <div ref={ref} className="max-h-[520px] space-y-3 overflow-y-auto p-4">
        {state.events.map((e) => {
          const a = AGENTS[e.agent];
          return (
            <div key={e.id} className="flex gap-3 text-sm">
              <div className={`mt-0.5 w-24 shrink-0 text-xs font-semibold ${a.color}`}>{a.name}</div>
              <div className="min-w-0 flex-1">
                <p className={e.kind === "error" ? "text-red-700" : "text-gray-800"}>{e.message}</p>
                <p className="text-xs text-gray-400">
                  {new Date(e.created_at).toLocaleTimeString("es-ES")} · {e.kind === "handoff" ? "traspaso" : e.kind}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilesPanel({ state }: { state: RunState }) {
  const htmlFiles = state.files.filter((f) => f.path.endsWith(".html")).map((f) => f.path);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [page, setPage] = useState("index.html");
  const [file, setFile] = useState("index.html");

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "nav" && typeof e.data.href === "string") setPage(e.data.href);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const srcDoc = useMemo(() => buildPreview(state, page), [state, page]);
  const current = state.files.find((f) => f.path === file);

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-1 border-b border-gray-100 px-3 py-2 text-sm">
        <span className="mr-2 font-semibold text-gray-700">Web del cliente</span>
        {(["preview", "code"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-2.5 py-1 ${tab === t ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
            {t === "preview" ? "Vista previa" : "Código"}
          </button>
        ))}
        <select
          value={tab === "preview" ? page : file}
          onChange={(e) => (tab === "preview" ? setPage(e.target.value) : setFile(e.target.value))}
          className="ml-auto rounded-md border border-gray-300 px-2 py-1 text-xs"
        >
          {(tab === "preview" ? htmlFiles : state.files.map((f) => f.path)).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      {tab === "preview" ? (
        srcDoc ? (
          <iframe title="Vista previa" sandbox="allow-scripts" srcDoc={srcDoc} className="h-[480px] w-full rounded-b-xl" />
        ) : (
          <p className="p-4 text-sm text-gray-500">Esa página aún no existe.</p>
        )
      ) : (
        <div>
          {current && (
            <p className="px-4 pt-2 text-xs text-gray-500">
              Última modificación: {current.updated_by === "seed" ? "original" : AGENTS.develop.name} · {new Date(current.updated_at).toLocaleTimeString("es-ES")}
            </p>
          )}
          <pre className="max-h-[460px] overflow-auto p-4 font-mono text-xs leading-5 text-gray-800">{current?.content ?? "—"}</pre>
        </div>
      )}
    </div>
  );
}

/** Inyecta styles.css en línea y convierte la navegación interna en mensajes al padre. */
function buildPreview(state: RunState, page: string) {
  const html = state.files.find((f) => f.path === page)?.content;
  if (!html) return null;
  const css = state.files.find((f) => f.path === "styles.css")?.content ?? "";
  const navScript = `<script>document.addEventListener('click',function(e){var a=e.target.closest('a');if(!a)return;var h=a.getAttribute('href')||'';if(/^(https?:|mailto:|tel:)/.test(h))return;e.preventDefault();if(h&&h[0]!=='#')parent.postMessage({type:'nav',href:h.split('#')[0]},'*');});document.addEventListener('submit',function(e){e.preventDefault();});</script>`;
  return html.replace(/<link[^>]+href="styles\.css"[^>]*>/i, `<style>${css}</style>`).replace(/<\/body>/i, `${navScript}</body>`);
}
