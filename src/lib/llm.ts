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

/** Llama al modelo y devuelve el JSON que haya producido. */
export async function chatJSON<T>(messages: ChatMessage[], opts: { maxTokens?: number } = {}): Promise<T> {
  const cfg = llmConfig();
  if (!cfg.apiKey) throw new Error("LLM_API_KEY no configurada");

  // Reintentos dentro del mismo paso ante saturación temporal del proveedor (5xx).
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0.2,
        max_tokens: opts.maxTokens ?? 8000,
        response_format: { type: "json_object" },
      }),
    });
    if (!TRANSIENT.has(res.status)) break;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
  }
  if (!res) throw new Error("Sin respuesta del proveedor LLM");

  if (res.status === 429) {
    const header = Number(res.headers.get("retry-after"));
    throw new RateLimitError(Number.isFinite(header) && header > 0 ? Math.ceil(header) : 20);
  }
  // Sigue saturado tras los reintentos: el cliente espera y reanuda solo, sin contarlo como error.
  if (TRANSIENT.has(res.status)) throw new RateLimitError(15, "El modelo está saturado ahora mismo (error " + res.status + ")");
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "";
  return parseJSON<T>(content);
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
