@AGENTS.md

# Contexto para Claude Code

Prueba técnica: equipo de 3 agentes (Orquestador, Develop, Testing) en Next.js 16 + Postgres + Vercel.

## Reglas del proyecto
- Next.js 16: `proxy.ts` sustituye a `middleware.ts`; `params` en route handlers es una Promise. Consulta `node_modules/next/dist/docs/` antes de usar APIs nuevas.
- Un paso de agente por petición HTTP (`engine.step`). No metas bucles largos en una sola función serverless.
- Toda salida del LLM pasa por `normalize*` / `sanitizeChecks` / `normalizePath` antes de tocar la base de datos.
- Testing debe seguir siendo verificable sin LLM: las comprobaciones deterministas en `checks.ts` son la fuente de verdad; la revisión LLM solo añade fallos.
- Nunca subir claves: todo por variables de entorno (`.env.example` documenta cuáles).
- Textos de la interfaz en español.

## Verificación antes de dar algo por terminado
1. `npx tsc --noEmit && npm run lint && npm run build`
2. Flujo completo en modo demo contra un Postgres local (`DATABASE_URL=postgres://…`), llamando a `POST /api/runs` y luego a `POST /api/runs/:id/step` hasta `finished: true`.
3. Flujo LLM contra un servidor falso compatible con OpenAI (incluye una respuesta 429) para validar el parseo, el saneado y la espera por límite de cuota.
4. Capturas de pantalla con Playwright a mitad de ejecución, al final y en móvil.

## Flujo de trabajo usado
- Plan primero (arquitectura por pasos para evitar timeouts en Vercel Hobby), después implementación por capas: db → llm → agentes → motor → API → UI.
- Claude Code escribió el código capa a capa a partir de ese plan; las decisiones de diseño (paso por petición, máx. 3 intentos, saneado de la salida del LLM, cerrojo, modo demo) se revisaron y validaron con las pruebas de arriba.
