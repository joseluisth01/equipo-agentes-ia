import { chatJSON } from "../llm";
import { normalizePath } from "../checks";
import type { Task } from "../types";

export interface DevResult {
  notes: string;
  files: { path: string; content: string }[];
}

const SYSTEM = `Eres el agente DEVELOP de un equipo de agentes de IA. Implementas UNA tarea sobre una web estática (HTML + CSS, sin frameworks).
Reglas:
- Devuelve el contenido COMPLETO de cada archivo que crees o modifiques (no diffs, no "..." ni omisiones).
- Mantén la estructura, cabecera, navegación y estilos existentes; reutiliza styles.css.
- HTML5 semántico y accesible (labels asociados a inputs, lang="es", meta viewport).
- Cumple TODAS las comprobaciones automáticas de la tarea. Si Testing te ha devuelto fallos, corrígelos todos.
- No toques archivos que la tarea no necesite.
Responde SOLO con JSON: {"notes":"qué has hecho, 1-3 frases","files":[{"path":"...","content":"..."}]}`;

export async function developWithLLM(task: Task, files: Map<string, string>): Promise<DevResult> {
  const current = [...files.entries()].map(([p, c]) => `### ${p}\n${c}`).join("\n\n");
  const feedback = task.feedback?.issues?.length
    ? `\n\nINTENTO ANTERIOR RECHAZADO POR TESTING. Corrige esto:\n- ${task.feedback.issues.join("\n- ")}`
    : "";
  const out = await chatJSON<{ notes?: string; files?: unknown[] }>([
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `TAREA: ${task.title}\n${task.description}\n\nComprobaciones que pasará Testing:\n${JSON.stringify(
        task.checks,
        null,
        1
      )}${feedback}\n\nARCHIVOS ACTUALES:\n\n${current}`,
    },
  ]);
  return normalizeDev(out);
}

export function normalizeDev(out: { notes?: string; files?: unknown[] }): DevResult {
  const files = (Array.isArray(out.files) ? out.files : [])
    .map((f) => {
      const o = (f ?? {}) as Record<string, unknown>;
      const path = typeof o.path === "string" ? normalizePath(o.path) : null;
      const content = typeof o.content === "string" ? o.content : null;
      return path && content !== null ? { path, content: content.slice(0, 60_000) } : null;
    })
    .filter((f): f is { path: string; content: string } => f !== null)
    .slice(0, 8);
  if (files.length === 0) throw new Error("Develop no ha devuelto ningún archivo");
  return { notes: String(out.notes ?? "").slice(0, 1000), files };
}
