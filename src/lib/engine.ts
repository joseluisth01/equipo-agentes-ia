/**
 * Motor del equipo de agentes.
 *
 * Cada llamada a step() ejecuta UN paso de UN agente y guarda el resultado en
 * la base de datos. Así ninguna función serverless de Vercel supera el límite de
 * tiempo, el estado sobrevive a recargas y cualquier pestaña ve el progreso.
 *
 *   planning ──Orquestador──▶ running ──┬─ tarea pending/changes_requested ──Develop──▶ testing
 *                                       ├─ tarea testing ──Testing──▶ done | changes_requested | failed
 *                                       └─ todas cerradas ──Orquestador (resumen)──▶ completed
 */
import { ensureSchema, sql } from "./db";
import { llmAvailable, RateLimitError } from "./llm";
import { planWithLLM, summarizeWithLLM, type Plan } from "./agents/orchestrator";
import { developWithLLM, type DevResult } from "./agents/develop";
import { buildReport, reviewWithLLM, runAutomatedChecks } from "./agents/testing";
import { demoDevelop, demoPlan, demoSummary } from "./agents/demo";
import { getTemplate } from "./templates";
import type { AgentEvent, AgentName, ProjectFile, Run, RunState, Task } from "./types";

export const MAX_ATTEMPTS = 3;

/** En modo demo cada agente «piensa» un poco para que se vea el flujo en pantalla. */
const pause = () => new Promise((r) => setTimeout(r, 1800));

async function log(runId: string, agent: AgentName, kind: AgentEvent["kind"], message: string, data?: unknown, taskId?: string) {
  await sql()`insert into events (run_id, task_id, agent, kind, message, data)
    values (${runId}, ${taskId ?? null}, ${agent}, ${kind}, ${message}, ${data === undefined ? null : sql().json(data as never)})`;
}

async function loadFiles(runId: string) {
  const rows = await sql()<{ path: string; content: string }[]>`select path, content from files where run_id = ${runId} order by path`;
  return new Map(rows.map((r) => [r.path, r.content]));
}

export async function createRun(request: string, templateId: string, forceDemo: boolean) {
  await ensureSchema();
  const template = getTemplate(templateId);
  const mode = forceDemo || !llmAvailable() ? "demo" : "llm";
  const [run] = await sql()<{ id: string }[]>`
    insert into runs (request, template, llm_mode) values (${request}, ${template.id}, ${mode}) returning id`;
  for (const [path, content] of Object.entries(template.files)) {
    await sql()`insert into files (run_id, path, content) values (${run.id}, ${path}, ${content})`;
  }
  await log(run.id, "orchestrator", "info", `Petición recibida sobre la web «${template.name}». Modo: ${mode === "llm" ? "LLM" : "demo (sin LLM)"}.`);
  return run.id;
}

export async function listRuns() {
  await ensureSchema();
  return sql()<(Run & { total: number; done: number })[]>`
    select r.id, r.request, r.template, r.status, r.llm_mode, r.created_at,
      (select count(*)::int from tasks t where t.run_id = r.id) as total,
      (select count(*)::int from tasks t where t.run_id = r.id and t.status = 'done') as done
    from runs r order by r.created_at desc limit 30`;
}

export async function getState(runId: string): Promise<RunState | null> {
  await ensureSchema();
  const [run] = await sql()<Run[]>`select * from runs where id = ${runId}`;
  if (!run) return null;
  const tasks = await sql()<Task[]>`select * from tasks where run_id = ${runId} order by position`;
  const files = await sql()<ProjectFile[]>`select path, content, updated_by, updated_at from files where run_id = ${runId} order by path`;
  const events = await sql()<AgentEvent[]>`select * from events where run_id = ${runId} order by id`;
  return { run, tasks, files, events, agents: deriveAgents(run, tasks) };
}

function deriveAgents(run: Run, tasks: Task[]): RunState["agents"] {
  const current = tasks.find((t) => t.status !== "done" && t.status !== "failed");
  const closed = run.status === "completed" || run.status === "failed";
  const a: RunState["agents"] = {
    orchestrator: { state: "waiting", detail: "Supervisando el trabajo del equipo" },
    develop: { state: "idle", detail: "Sin tareas asignadas" },
    testing: { state: "idle", detail: "Esperando entregas de Develop" },
  };
  if (run.status === "planning") {
    a.orchestrator = { state: "working", detail: "Analizando la petición y dividiéndola en tareas" };
  } else if (closed) {
    a.orchestrator = { state: "done", detail: "Resumen entregado al cliente" };
    a.develop = { state: "done", detail: "Todas sus tareas cerradas" };
    a.testing = { state: "done", detail: "Revisión final completada" };
  } else if (!current) {
    a.orchestrator = { state: "working", detail: "Revisando resultados y redactando el resumen" };
    a.develop = { state: "done", detail: "Todas sus tareas cerradas" };
    a.testing = { state: "done", detail: "Todo revisado" };
  } else if (current.status === "pending" || current.status === "developing") {
    a.develop = { state: "working", detail: `Implementando «${current.title}»` };
  } else if (current.status === "changes_requested") {
    a.develop = { state: "working", detail: `Corrigiendo «${current.title}» (intento ${current.attempts + 1}/${MAX_ATTEMPTS})` };
    a.testing = { state: "waiting", detail: "Ha devuelto fallos; espera la corrección" };
  } else if (current.status === "testing") {
    a.develop = { state: "waiting", detail: "Entrega enviada; espera el veredicto" };
    a.testing = { state: "working", detail: `Probando «${current.title}»` };
  }
  return a;
}

/** Cerrojo optimista para que dos pestañas no ejecuten el mismo paso a la vez. */
async function acquire(runId: string) {
  const rows = await sql()`update runs set locked_until = now() + interval '320 seconds'
    where id = ${runId} and (locked_until is null or locked_until < now()) returning id`;
  return rows.length > 0;
}
async function release(runId: string) {
  await sql()`update runs set locked_until = null, updated_at = now() where id = ${runId}`;
}

export type StepResult =
  | { ok: true; finished: boolean; agent?: AgentName }
  | { ok: false; busy: true }
  | { ok: false; retryAfter: number; message: string }
  | { ok: false; error: string };

export async function step(runId: string): Promise<StepResult> {
  await ensureSchema();
  if (!(await acquire(runId))) return { ok: false, busy: true };
  let revert: (() => Promise<unknown>) | null = null;
  try {
    const [run] = await sql()<Run[]>`select * from runs where id = ${runId}`;
    if (!run) return { ok: false, error: "Ejecución no encontrada" };
    if (run.status === "completed" || run.status === "failed") return { ok: true, finished: true };
    const demo = run.llm_mode === "demo";

    // 1) ORQUESTADOR: planificación
    if (run.status === "planning") {
      await log(runId, "orchestrator", "start", "Analizando la petición y la web actual…");
      if (demo) await pause();
      const files = await loadFiles(runId);
      const plan: Plan = demo ? demoPlan(run.request, files) : await planWithLLM(run.request, files);
      await log(runId, "orchestrator", "result", plan.analysis || "Plan listo.", { tasks: plan.tasks.map((t) => t.title) });
      for (const [i, t] of plan.tasks.entries()) {
        await sql()`insert into tasks (run_id, position, title, description, checks)
          values (${runId}, ${i}, ${t.title}, ${t.description}, ${sql().json(t.checks as never)})`;
      }
      await sql()`update runs set status = 'running' where id = ${runId}`;
      await log(runId, "orchestrator", "handoff", `${plan.tasks.length} tareas creadas y asignadas: Develop las implementa, Testing las verifica.`);
      return { ok: true, finished: false, agent: "orchestrator" };
    }

    const tasks = await sql()<Task[]>`select * from tasks where run_id = ${runId} order by position`;
    const task = tasks.find((t) => t.status !== "done" && t.status !== "failed");

    // 2) ORQUESTADOR: cierre
    if (!task) {
      const results = tasks.map((t) => ({ title: t.title, status: t.status, attempts: t.attempts }));
      const summary = demo ? demoSummary(run.request) : await summarizeWithLLM(run.request, results);
      const failed = tasks.some((t) => t.status === "failed");
      await sql()`update runs set status = ${failed ? "failed" : "completed"}, summary = ${summary} where id = ${runId}`;
      await log(runId, "orchestrator", "result", summary, { results });
      return { ok: true, finished: true, agent: "orchestrator" };
    }

    // 3) DEVELOP
    if (task.status === "pending" || task.status === "changes_requested" || task.status === "developing") {
      const previous = task.status === "developing" ? "pending" : task.status;
      await sql()`update tasks set status = 'developing', updated_at = now() where id = ${task.id}`;
      revert = () => sql()`update tasks set status = ${previous} where id = ${task.id}`;
      await log(
        runId,
        "develop",
        "start",
        task.attempts === 0 ? `Empiezo «${task.title}».` : `Corrigiendo «${task.title}» según el informe de Testing (intento ${task.attempts + 1}).`,
        undefined,
        task.id
      );
      if (demo) await pause();
      const files = await loadFiles(runId);
      const dev: DevResult = demo ? demoDevelop(task, files) : await developWithLLM(task, files);
      for (const f of dev.files) {
        await sql()`insert into files (run_id, path, content, updated_by) values (${runId}, ${f.path}, ${f.content}, 'develop')
          on conflict (run_id, path) do update set content = excluded.content, updated_by = 'develop', updated_at = now()`;
      }
      await sql()`update tasks set status = 'testing', updated_at = now() where id = ${task.id}`;
      revert = null;
      await log(runId, "develop", "handoff", `${dev.notes} → Archivos: ${dev.files.map((f) => f.path).join(", ")}. Paso a Testing.`, { files: dev.files.map((f) => f.path) }, task.id);
      return { ok: true, finished: false, agent: "develop" };
    }

    // 4) TESTING
    await log(runId, "testing", "start", `Probando «${task.title}»: ${task.checks.length} comprobaciones de la tarea + enlaces rotos${demo ? "" : " + revisión de código"}.`, undefined, task.id);
    if (demo) await pause();
    const files = await loadFiles(runId);
    const checks = runAutomatedChecks(task, files);
    const review = demo ? null : await reviewWithLLM(task, files, checks);
    const report = buildReport(checks, review);
    const attempts = task.attempts + 1;

    if (report.passed) {
      await sql()`update tasks set status = 'done', attempts = ${attempts}, feedback = ${sql().json({ issues: [], checks } as never)}, updated_at = now() where id = ${task.id}`;
      await log(runId, "testing", "result", `✔ «${task.title}» supera ${checks.length} comprobaciones. Tarea cerrada.`, { checks }, task.id);
    } else {
      const status = attempts >= MAX_ATTEMPTS ? "failed" : "changes_requested";
      await sql()`update tasks set status = ${status}, attempts = ${attempts}, feedback = ${sql().json({ issues: report.issues, checks } as never)}, updated_at = now() where id = ${task.id}`;
      await log(
        runId,
        "testing",
        status === "failed" ? "error" : "handoff",
        status === "failed"
          ? `✘ «${task.title}» sigue fallando tras ${attempts} intentos. Se marca como fallida.`
          : `✘ ${report.issues.length} fallo(s). Devuelvo a Develop: ${report.issues.join(" · ")}`,
        { checks, issues: report.issues },
        task.id
      );
    }
    return { ok: true, finished: false, agent: "testing" };
  } catch (e) {
    if (revert) await revert().catch(() => {});
    if (e instanceof RateLimitError) {
      await log(runId, "orchestrator", "info", `${e.message}. Se reanuda solo.`);
      return { ok: false, retryAfter: e.retryAfterSeconds, message: e.message };
    }
    const message = e instanceof Error ? e.message : String(e);
    await log(runId, "orchestrator", "error", `Error en el paso: ${message}`);
    return { ok: false, error: message };
  } finally {
    await release(runId);
  }
}
