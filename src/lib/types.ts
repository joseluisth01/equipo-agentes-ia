export type AgentName = "orchestrator" | "develop" | "testing";

export type RunStatus = "planning" | "running" | "completed" | "failed";

export type TaskStatus =
  | "pending" // creada por el orquestador, esperando a Develop
  | "developing" // Develop trabajando
  | "testing" // esperando / en revisión de Testing
  | "changes_requested" // Testing ha devuelto fallos
  | "done" // todo pasa
  | "failed"; // superado el máximo de intentos

/** Comprobaciones automáticas que el orquestador define y Testing ejecuta. */
export type Check =
  | { type: "file_exists"; path: string }
  | { type: "selector_exists"; path: string; selector: string }
  | { type: "text_contains"; path: string; text: string }
  | { type: "link_to"; path: string; href: string }
  | { type: "valid_html"; path: string };

export interface CheckResult {
  check: Check;
  passed: boolean;
  detail: string;
}

export interface Run {
  id: string;
  request: string;
  template: string;
  status: RunStatus;
  summary: string | null;
  llm_mode: "llm" | "demo";
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  run_id: string;
  position: number;
  title: string;
  description: string;
  checks: Check[];
  status: TaskStatus;
  attempts: number;
  feedback: { issues: string[]; checks?: CheckResult[] } | null;
}

export interface ProjectFile {
  path: string;
  content: string;
  updated_by: string;
  updated_at: string;
}

export interface AgentEvent {
  id: number;
  run_id: string;
  task_id: string | null;
  agent: AgentName;
  kind: "start" | "info" | "result" | "error" | "handoff";
  message: string;
  data: unknown;
  created_at: string;
}

export interface RunState {
  run: Run;
  tasks: Task[];
  files: ProjectFile[];
  events: AgentEvent[];
  agents: Record<AgentName, { state: "idle" | "working" | "waiting" | "done"; detail: string }>;
}
