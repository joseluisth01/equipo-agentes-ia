import { chatJSON } from "../llm";
import { sanitizeChecks } from "../checks";
import type { Check } from "../types";

export interface PlannedTask {
  title: string;
  description: string;
  checks: Check[];
}

export interface Plan {
  analysis: string;
  tasks: PlannedTask[];
}

const SYSTEM = `Eres el ORQUESTADOR de un equipo de 3 agentes de IA (Orquestador, Develop, Testing) que modifican una web estática (HTML + CSS).
Tu trabajo: entender la petición del cliente, dividirla en 2–5 tareas de desarrollo pequeñas, ordenadas y verificables, y definir para cada una comprobaciones automáticas que el agente Testing ejecutará.

Tipos de comprobación permitidos (usa solo estos):
- {"type":"file_exists","path":"x.html"}
- {"type":"valid_html","path":"x.html"}
- {"type":"selector_exists","path":"x.html","selector":"form input[type=email]"}  (selector CSS simple)
- {"type":"text_contains","path":"styles.css","text":".contact-form"}
- {"type":"link_to","path":"index.html","href":"contacto.html"}

Reglas:
- Rutas relativas planas (p. ej. "contacto.html", "styles.css"). Solo .html, .css o .js.
- Cada tarea debe tener entre 2 y 6 comprobaciones objetivas, que se puedan cumplir con el HTML/CSS de la tarea.
- Si se añade una página, incluye una tarea para enlazarla desde la navegación de TODAS las páginas existentes.
- Escribe en español.

Responde SOLO con JSON: {"analysis":"...","tasks":[{"title":"...","description":"...","checks":[...]}]}`;

export async function planWithLLM(request: string, files: Map<string, string>): Promise<Plan> {
  const fileSummary = [...files.entries()]
    .map(([p, c]) => `### ${p}\n${c.slice(0, 2500)}`)
    .join("\n\n");
  const out = await chatJSON<{ analysis?: string; tasks?: unknown[] }>([
    { role: "system", content: SYSTEM },
    { role: "user", content: `Petición del cliente: «${request}»\n\nArchivos actuales de la web:\n\n${fileSummary}` },
  ]);
  return normalizePlan(out);
}

export function normalizePlan(out: { analysis?: string; tasks?: unknown[] }): Plan {
  const tasks: PlannedTask[] = (Array.isArray(out.tasks) ? out.tasks : [])
    .map((t) => {
      const o = (t ?? {}) as Record<string, unknown>;
      return {
        title: String(o.title ?? "").slice(0, 160),
        description: String(o.description ?? "").slice(0, 2000),
        checks: sanitizeChecks(o.checks),
      };
    })
    .filter((t) => t.title)
    .slice(0, 6);
  if (tasks.length === 0) throw new Error("El orquestador no ha generado tareas válidas");
  return { analysis: String(out.analysis ?? "").slice(0, 2000), tasks };
}

export async function summarizeWithLLM(request: string, results: { title: string; status: string; attempts: number }[]) {
  const out = await chatJSON<{ summary?: string }>(
    [
      {
        role: "system",
        content:
          'Eres el ORQUESTADOR. Redacta para el cliente un resumen breve (máx. 5 frases, español) de lo entregado. Responde JSON {"summary":"..."}',
      },
      { role: "user", content: `Petición: «${request}»\nResultado por tarea: ${JSON.stringify(results)}` },
    ],
    { maxTokens: 800 }
  );
  return String(out.summary ?? "");
}
