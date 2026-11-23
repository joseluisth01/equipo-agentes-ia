/**
 * Webs de partida sobre las que trabaja el equipo de agentes.
 * Son pequeñas a propósito: caben enteras en el contexto del modelo.
 */
export interface Template {
  id: string;
  name: string;
  description: string;
  files: Record<string, string>;
}

const layout = (title: string, brand: string, links: [string, string][], main: string, active: string) => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="site-header">
    <a class="brand" href="index.html">${brand}</a>
    <nav>
      <ul class="nav">
${links
  .map(([href, label]) => `        <li><a href="${href}"${href === active ? ' class="active"' : ""}>${label}</a></li>`)
  .join("\n")}
      </ul>
    </nav>
  </header>
  <main>
${main}
  </main>
  <footer class="site-footer">
    <p>&copy; 2026 ${brand}. Todos los derechos reservados.</p>
  </footer>
</body>
</html>
`;

const baseCss = (accent: string) => `:root {
  --accent: ${accent};
  --text: #1f2933;
  --muted: #616e7c;
  --bg: #ffffff;
  --surface: #f5f7fa;
  --radius: 10px;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--text); background: var(--bg); line-height: 1.6; }
.site-header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; border-bottom: 1px solid #e4e7eb; }
.brand { font-weight: 700; font-size: 1.25rem; color: var(--accent); text-decoration: none; }
.nav { list-style: none; display: flex; gap: 1.5rem; margin: 0; padding: 0; }
.nav a { color: var(--text); text-decoration: none; }
.nav a.active, .nav a:hover { color: var(--accent); }
main { max-width: 960px; margin: 0 auto; padding: 2rem; }
.hero { padding: 3rem 0; }
.hero h1 { font-size: 2.5rem; margin: 0 0 1rem; }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
.card { background: var(--surface); padding: 1.25rem; border-radius: var(--radius); }
.btn { display: inline-block; background: var(--accent); color: #fff; padding: .75rem 1.25rem; border-radius: var(--radius); text-decoration: none; border: 0; cursor: pointer; font: inherit; }
.site-footer { text-align: center; padding: 2rem; color: var(--muted); border-top: 1px solid #e4e7eb; margin-top: 3rem; }
`;

const restLinks: [string, string][] = [
  ["index.html", "Inicio"],
  ["carta.html", "Carta"],
];

const studioLinks: [string, string][] = [
  ["index.html", "Inicio"],
  ["servicios.html", "Servicios"],
];

export const TEMPLATES: Template[] = [
  {
    id: "restaurante",
    name: "Restaurante «La Judería»",
    description: "Web de un restaurante cordobés: inicio y carta.",
    files: {
      "index.html": layout(
        "La Judería · Restaurante en Córdoba",
        "La Judería",
        restLinks,
        `    <section class="hero">
      <h1>Cocina cordobesa de siempre</h1>
      <p>Salmorejo, flamenquín y rabo de toro en pleno casco histórico.</p>
      <a class="btn" href="carta.html">Ver la carta</a>
    </section>
    <section class="cards">
      <article class="card"><h3>Producto local</h3><p>Aceite de la Subbética y verduras de la vega.</p></article>
      <article class="card"><h3>Patio andaluz</h3><p>Comidas al fresco entre macetas y azahar.</p></article>
      <article class="card"><h3>Grupos</h3><p>Menús cerrados para celebraciones.</p></article>
    </section>`,
        "index.html"
      ),
      "carta.html": layout(
        "Carta · La Judería",
        "La Judería",
        restLinks,
        `    <h1>Nuestra carta</h1>
    <ul>
      <li>Salmorejo cordobés — 7 €</li>
      <li>Flamenquín casero — 12 €</li>
      <li>Rabo de toro — 18 €</li>
    </ul>`,
        "carta.html"
      ),
      "styles.css": baseCss("#b5452a"),
    },
  },
  {
    id: "estudio",
    name: "Estudio de diseño «Pixel Sur»",
    description: "Web corporativa de una agencia: inicio y servicios.",
    files: {
      "index.html": layout(
        "Pixel Sur · Estudio de diseño",
        "Pixel Sur",
        studioLinks,
        `    <section class="hero">
      <h1>Diseño y desarrollo web para pymes</h1>
      <p>Webs rápidas, accesibles y fáciles de mantener.</p>
      <a class="btn" href="servicios.html">Qué hacemos</a>
    </section>
    <section class="cards">
      <article class="card"><h3>Branding</h3><p>Identidad visual completa.</p></article>
      <article class="card"><h3>Web</h3><p>Sitios a medida en Next.js.</p></article>
      <article class="card"><h3>SEO</h3><p>Posicionamiento local.</p></article>
    </section>`,
        "index.html"
      ),
      "servicios.html": layout(
        "Servicios · Pixel Sur",
        "Pixel Sur",
        studioLinks,
        `    <h1>Servicios</h1>
    <p>Diseño UX/UI, desarrollo web, tiendas online y mantenimiento.</p>`,
        "servicios.html"
      ),
      "styles.css": baseCss("#3f51b5"),
    },
  },
];

export function getTemplate(id: string) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
