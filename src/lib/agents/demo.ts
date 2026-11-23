/**
 * MODO DEMO (sin LLM). Se activa automáticamente si no hay LLM_API_KEY, o si
 * el usuario lo elige en pantalla. Respuestas guionizadas pero ejecutadas por el
 * mismo motor: las comprobaciones de Testing son reales y el primer intento de
 * Develop en la tarea de navegación falla a propósito, para que se vea el bucle
 * Develop ⇄ Testing.
 */
import type { Plan } from "./orchestrator";
import type { DevResult } from "./develop";
import type { Task } from "../types";

export function demoPlan(request: string, files: Map<string, string>): Plan {
  const pages = [...files.keys()].filter((p) => p.endsWith(".html"));
  const slug = /contact/i.test(request)
    ? "contacto"
    : request
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .match(/p[aá]gina de ([a-z]+)/)?.[1] ?? "contacto";
  const page = `${slug}.html`;
  const label = slug.charAt(0).toUpperCase() + slug.slice(1);

  return {
    analysis: `(Modo demo) La petición requiere una nueva página «${label}», enlazarla desde la navegación de ${pages.length} páginas existentes y darle estilos coherentes con la web.`,
    tasks: [
      {
        title: `Crear la página ${page}`,
        description: `Nueva página ${label} reutilizando cabecera y pie. Si es de contacto: formulario con nombre, email y mensaje, con labels accesibles.`,
        checks: [
          { type: "file_exists", path: page },
          { type: "valid_html", path: page },
          { type: "selector_exists", path: page, selector: "form" },
          { type: "selector_exists", path: page, selector: "input[type=email]" },
          { type: "selector_exists", path: page, selector: "textarea" },
          { type: "selector_exists", path: page, selector: "button[type=submit]" },
        ],
      },
      {
        title: `Enlazar ${label} en la navegación de todas las páginas`,
        description: `Añadir «${label}» al menú de ${pages.join(", ")} y ${page}.`,
        checks: [...pages, page].map((p) => ({ type: "link_to" as const, path: p, href: page })),
      },
      {
        title: "Estilos del formulario (responsive)",
        description: "Estilos .contact-form en styles.css y ajuste móvil con media query.",
        checks: [
          { type: "text_contains", path: "styles.css", text: ".contact-form" },
          { type: "text_contains", path: "styles.css", text: "@media" },
        ],
      },
    ],
  };
}

function pageFromTask(task: Task) {
  const c = task.checks.find((c) => c.type === "file_exists") ?? task.checks.find((c) => c.type === "link_to");
  if (c?.type === "link_to") return c.href;
  return c?.path ?? "contacto.html";
}

export function demoDevelop(task: Task, files: Map<string, string>): DevResult {
  const index = files.get("index.html") ?? "";

  // Tarea 1: crear la página
  if (task.position === 0) {
    const page = pageFromTask(task);
    const label = page.replace(".html", "").replace(/^./, (s) => s.toUpperCase());
    const html = index
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${label}</title>`)
      .replace(/ class="active"/g, "")
      .replace(
        /<main>[\s\S]*<\/main>/,
        `<main>
    <h1>${label}</h1>
    <p>Escríbenos y te respondemos en menos de 24 horas.</p>
    <form class="contact-form" action="#" method="post">
      <label for="name">Nombre</label>
      <input id="name" name="name" type="text" required />
      <label for="email">Email</label>
      <input id="email" name="email" type="email" required />
      <label for="message">Mensaje</label>
      <textarea id="message" name="message" rows="5" required></textarea>
      <button class="btn" type="submit">Enviar</button>
    </form>
  </main>`
      );
    return { notes: `Creada ${page} con formulario accesible reutilizando el layout de index.html.`, files: [{ path: page, content: html }] };
  }

  // Tarea 2: navegación. Primer intento con un error deliberado (href equivocado).
  if (task.position === 1) {
    const page = pageFromTask(task);
    const label = page.replace(".html", "").replace(/^./, (s) => s.toUpperCase());
    const href = task.attempts === 0 ? page.replace("contacto", "contact") : page;
    const out: DevResult["files"] = [];
    for (const [path, content] of files) {
      if (!path.endsWith(".html")) continue;
      const cleaned = content.replace(/\s*<li><a href="[^"]*"[^>]*>[^<]*<\/a><\/li>(?=\s*<\/ul>)/, (m) =>
        m.includes(label) ? "" : m
      );
      const active = path === page ? ' class="active"' : "";
      out.push({ path, content: cleaned.replace(/(\s*)<\/ul>/, `$1  <li><a href="${href}"${active}>${label}</a></li>$1</ul>`) });
    }
    return {
      notes: task.attempts === 0 ? `Añadido «${label}» al menú de todas las páginas.` : `Corregido el enlace: ahora apunta a ${page}.`,
      files: out,
    };
  }

  // Tarea 3: estilos
  const css = files.get("styles.css") ?? "";
  return {
    notes: "Añadidos estilos del formulario y media query para móvil.",
    files: [
      {
        path: "styles.css",
        content:
          css +
          `
.contact-form { display: grid; gap: .5rem; max-width: 520px; }
.contact-form input, .contact-form textarea { padding: .7rem; border: 1px solid #cbd2d9; border-radius: var(--radius); font: inherit; }
.contact-form button { justify-self: start; margin-top: .5rem; }
@media (max-width: 640px) {
  .site-header { flex-direction: column; gap: .75rem; }
  .cards { grid-template-columns: 1fr; }
  .contact-form button { justify-self: stretch; }
}
`,
      },
    ],
  };
}

export function demoSummary(request: string) {
  return `(Modo demo) Petición «${request}» completada: nueva página creada, enlazada desde todas las páginas y con estilos responsive. Testing detectó un enlace roto en el primer intento y Develop lo corrigió.`;
}
