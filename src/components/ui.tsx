import type { AgentName, RunStatus, TaskStatus } from "@/lib/types";

export const AGENTS: Record<AgentName, { name: string; role: string; color: string; bg: string; ring: string }> = {
  orchestrator: { name: "Orquestador", role: "Divide la petición y reparte tareas", color: "text-violet-700", bg: "bg-violet-50", ring: "border-violet-200" },
  develop: { name: "Develop", role: "Implementa cada tarea", color: "text-sky-700", bg: "bg-sky-50", ring: "border-sky-200" },
  testing: { name: "Testing", role: "Verifica y devuelve fallos", color: "text-emerald-700", bg: "bg-emerald-50", ring: "border-emerald-200" },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; cls: string }> = {
  pending: { label: "Pendiente", cls: "bg-gray-100 text-gray-700" },
  developing: { label: "En desarrollo", cls: "bg-sky-100 text-sky-800" },
  testing: { label: "En testing", cls: "bg-amber-100 text-amber-800" },
  changes_requested: { label: "Cambios pedidos", cls: "bg-orange-100 text-orange-800" },
  done: { label: "Completada", cls: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Fallida", cls: "bg-red-100 text-red-800" },
};

export const RUN_STATUS: Record<RunStatus, { label: string; cls: string }> = {
  planning: { label: "Planificando", cls: "bg-violet-100 text-violet-800" },
  running: { label: "En curso", cls: "bg-sky-100 text-sky-800" },
  completed: { label: "Completada", cls: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Con tareas fallidas", cls: "bg-red-100 text-red-800" },
};

export function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
