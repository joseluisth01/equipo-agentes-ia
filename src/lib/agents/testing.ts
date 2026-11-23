import { chatJSON } from "../llm";
import { globalChecks, runCheck } from "../checks";
import type { CheckResult, Task } from "../types";

export interface TestReport {
  passed: boolean;
  checks: CheckResult[];
  review: { passed: boolean; issues: string[] } | null;
  issues: string[];
}

/** 1) Comprobaciones deterministas (las de la tarea + globales). */
export function runAutomatedChecks(task: Task, files: Map<string, string>): CheckResult[] {
  return [...task.checks.map((c) => runCheck(c, files)), ...globalChecks(files)];
}

const SYSTEM = `Eres el agente TESTING de un equipo de agentes de IA. Revisas el trabajo de Develop sobre una web estática.
Ya se han ejecutado comprobaciones automáticas (te paso el resultado). Tú haces la revisión de código: ¿cumple la tarea? ¿hay errores claros (HTML roto, formulario sin labels, estilos que rompen la web, texto de relleno tipo lorem ipsum, contenido incoherente)?
Sé estricto solo con lo que BLOQUEA la entrega; no pidas mejoras opcionales ni cosas fuera de la tarea.
Responde SOLO con JSON: {"passed":true|false,"issues":["fallo concreto y cómo arreglarlo", ...]}`;

export async function reviewWithLLM(task: Task, files: Map<string, string>, checks: CheckResult[]) {
  const current = [...files.entries()].map(([p, c]) => `### ${p}\n${c}`).join("\n\n");
  const out = await chatJSON<{ passed?: boolean; issues?: unknown[] }>(
    [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `TAREA: ${task.title}\n${task.description}\n\nRESULTADO COMPROBACIONES AUTOMÁTICAS:\n${checks
          .map((c) => `${c.passed ? "✔" : "✘"} ${c.detail}`)
          .join("\n")}\n\nARCHIVOS:\n\n${current}`,
      },
    ],
    { maxTokens: 1500 }
  );
  const issues = (Array.isArray(out.issues) ? out.issues : []).map(String).filter(Boolean).slice(0, 8);
  // Si dice "no pasa" pero no concreta ningún fallo, no bloqueamos (evita bucles sin feedback útil).
  return { passed: issues.length === 0, issues };
}

export function buildReport(checks: CheckResult[], review: TestReport["review"]): TestReport {
  const failed = checks.filter((c) => !c.passed).map((c) => c.detail);
  const issues = [...failed, ...(review?.issues ?? [])];
  return { passed: failed.length === 0 && (review ? review.passed : true), checks, review, issues };
}
