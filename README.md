# Equipo de agentes IA: Orquestador · Develop · Testing

Tres agentes de IA que trabajan juntos sobre una web real:

1. **Orquestador**: recibe una petición («añade una página de contacto a esta web»), analiza la web actual, la divide en 2–5 tareas y define para cada una **comprobaciones automáticas** objetivas.
2. **Develop**: implementa las tareas una a una y escribe los archivos (HTML/CSS) en la base de datos.
3. **Testing**: ejecuta las comprobaciones de la tarea + un control global de enlaces rotos + una revisión de código con el LLM. Si algo falla, devuelve a Develop la lista concreta de fallos. El ciclo se repite hasta que todo pasa (máx. 3 intentos por tarea).

En pantalla se ve en todo momento qué hace cada agente (trabajando / esperando / terminado), el tablero de tareas con su estado, el detalle de cada comprobación (✔/✘), la actividad de los agentes y la web resultante en vista previa y en código.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Postgres (Neon o Supabase, plan gratuito) · Gemini 2.5 Flash o Llama 3.3 70B en Groq (planes gratuitos) · Vercel.

## Arquitectura

```
Navegador ──POST /api/runs/:id/step──▶ engine.step()  ── ejecuta UN paso de UN agente
    ▲                                       │
    └──GET /api/runs/:id (polling 1,5 s)────┴──▶ Postgres: runs · tasks · files · events
```

- **Un paso por petición HTTP.** Cada llamada a `step()` ejecuta un solo agente y guarda el resultado. Ninguna función serverless se acerca al límite de tiempo de Vercel, el estado sobrevive a recargas y cualquier pestaña ve el progreso.
- **Máquina de estados de la tarea:** `pending → developing → testing → done | changes_requested → developing … | failed`.
- **Cerrojo optimista** en `runs.locked_until`, para que dos pestañas abiertas no ejecuten el mismo paso a la vez.
- **Testing no depende solo del LLM**: las comprobaciones (`file_exists`, `valid_html`, `selector_exists`, `text_contains`, `link_to`) se ejecutan de verdad con un parser HTML. El LLM añade la revisión de código.
- **Salida del LLM saneada**: solo se aceptan tipos de comprobación conocidos y rutas `.html/.css/.js` planas (no se puede escribir `../`).
- **Límites del plan gratuito**: cadena de modelos (`gemini-3.8-flash` → `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite`, configurable con `LLM_FALLBACK_MODELS`). Si un modelo está saturado (5xx), sin cuota (429), no disponible (404) o tarda más de 60 s, se pasa al siguiente; si fallan todos, el paso se revierte y la interfaz reanuda sola. La actividad muestra qué modelo respondió.
- **Modo demo (sin LLM)**: si no hay `LLM_API_KEY`, o si se marca en pantalla, los agentes usan respuestas guionizadas pero **el mismo motor y las mismas comprobaciones reales**. Develop falla a propósito en el primer intento de la tarea de navegación para que se vea el bucle Develop ⇄ Testing.

```
src/
  lib/engine.ts            máquina de estados y reparto entre agentes
  lib/agents/orchestrator  prompt + planificación + resumen final
  lib/agents/develop       prompt + implementación
  lib/agents/testing       comprobaciones deterministas + revisión LLM
  lib/agents/demo          respuestas guionizadas del modo demo
  lib/checks.ts            ejecutor de comprobaciones y detector de enlaces rotos
  lib/llm.ts               cliente compatible con OpenAI (Gemini / Groq)
  lib/db.ts                Postgres + creación automática del esquema
  components/RunView.tsx   panel en vivo: agentes, tablero, actividad, vista previa
  proxy.ts                 acceso con usuario de prueba
```

## Puesta en marcha local

```bash
cp .env.example .env.local   # rellena DATABASE_URL y, si quieres, LLM_API_KEY
npm install
npm run dev
```

Las tablas se crean solas en la primera petición (también están en `db/schema.sql`).

## Despliegue en Vercel (todo gratis)

1. **Base de datos**: crea un proyecto en [Neon](https://neon.tech) (o Supabase) y copia la cadena de conexión *pooled*.
2. **LLM**: crea una API key gratuita en [Google AI Studio](https://aistudio.google.com/apikey) (`LLM_PROVIDER=gemini`) o en [Groq](https://console.groq.com/keys) (`LLM_PROVIDER=groq`).
3. Sube el repo a GitHub e impórtalo en Vercel.
4. En *Settings → Environment Variables* añade `DATABASE_URL`, `LLM_PROVIDER`, `LLM_API_KEY`, `DEMO_USER`, `DEMO_PASSWORD` y `AUTH_SECRET`.
5. Despliega. Ninguna clave está en el repositorio: `.env*` está en `.gitignore`.

## Cómo se ha usado la IA para programarlo

Ver [CLAUDE.md](CLAUDE.md): contexto del proyecto, convenciones y flujo de trabajo usado con Claude Code.
