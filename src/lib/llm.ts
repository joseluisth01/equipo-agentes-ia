/**
 * Cliente LLM mínimo sobre la API compatible con OpenAI.
 * Sirve para Google Gemini (plan gratuito), Groq (plan gratuito) o cualquier
 * proveedor compatible, cambiando solo variables de entorno.
 */

/** Límite de cuota (429) o saturación temporal (5xx): el paso se reintenta más tarde. */
export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number, reason = "Límite de peticiones del proveedor LLM") {
    super(`${reason}. Reintentando en ${retryAfterSeconds}s`);
  }
}

const TRANSIENT = new Set([500, 502, 503, 504]);
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 60_000;
const DEFAULT_GEMINI_FALLBACKS = "gemini-3.5-flash-lite,gemini-3.1-flash-lite";

const PRESETS: Record<string, { baseUrl: string; model: string }> = {
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.8-flash",
  },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
};

export function llmConfig() {
  const provider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
  const preset = PRESETS[provider] ?? PRESETS.gemini;
  return {
    provider,
    apiKey: process.env.LLM_API_KEY || "",
    baseUrl: process.env.LLM_BASE_URL || preset.baseUrl,
    model: process.env.LLM_MODEL || preset.model,
  };
}

export function llmAvailable() {
  return Boolean(llmConfig().apiKey);
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Modelos a probar en orden. Si uno está saturado o sin cuota, se pasa al siguiente. */
export function modelChain() {
  const cfg = llmConfig();
  const fallback = (process.env.LLM_FALLBACK_MODELS ?? (cfg.provider === "gemini" ? DEFAULT_GEMINI_FALLBACKS : ""))
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([cfg.model, ...fallback])];
}

/** Modelo que respondió la última llamada (para mostrarlo en la actividad). */
export let lastModelUsed = "";

/** Llama al modelo y devuelve el JSON que haya producido. */
export async function chatJSON<T>(messages: ChatMessage[], opts: { maxTokens?: number } = {}): Promise<T> {
  const cfg = llmConfig();
  if (!cfg.apiKey) throw new Error("LLM_API_KEY no configurada");

  const problems: string[] = [];
  let minRetry = 15;
  for (const model of modelChain()) {
    let useReasoning = cfg.provider === "gemini";
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${cfg.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.2,
            max_tokens: opts.maxTokens ?? 8000,
            response_format: { type: "json_object" },
            // Modelos con razonamiento (Gemini 3.x): poco "pensamiento" = respuestas rápidas.
            ...(useReasoning ? { reasoning_effort: process.env.LLM_REASONING || "low" } : {}),
          }),
          signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        });
      } catch (e) {
        if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
          problems.push(`${model}: sin respuesta en ${LLM_TIMEOUT_MS / 1000}s`);
          break; // siguiente modelo
        }
        throw e;
      }

      if (res.ok) {
        const json = await res.json();
        const content: string = json?.choices?.[0]?.message?.content ?? "";
        lastModelUsed = model;
        return parseJSON<T>(content);
      }

      const body = await res.text();
      // Si el modelo no acepta reasoning_effort, se repite sin él.
      if (res.status === 400 && useReasoning && /reasoning|thinking/i.test(body)) {
        useReasoning = false;
        continue;
      }
      if (res.status === 429) {
        const header = Number(res.headers.get("retry-after"));
        if (Number.isFinite(header) && header > 0) minRetry = Math.min(minRetry, Math.ceil(header));
        problems.push(`${model}: sin cuota (429)`);
        break;
      }
      if (res.status === 404 || TRANSIENT.has(res.status)) {
        problems.push(`${model}: ${res.status === 404 ? "no disponible" : "saturado"} (${res.status})`);
        break;
      }
      throw new Error(`LLM ${res.status} (${model}): ${body.slice(0, 300)}`);
    }
  }
  // Ningún modelo ha respondido: el cliente espera y reanuda solo, sin contarlo como error.
  throw new RateLimitError(minRetry, `Modelos de IA saturados o sin cuota → ${problems.join(" · ")}`);
}

/** Tolera bloques ```json y texto alrededor del objeto. */
export function parseJSON<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new Error("El modelo no devolvió JSON válido");
  }
}
