import { parse, valid } from "node-html-parser";
import type { Check, CheckResult } from "./types";

const ALLOWED_TYPES = new Set(["file_exists", "selector_exists", "text_contains", "link_to", "valid_html"]);

/** Sanea las comprobaciones que propone el orquestador (vienen de un LLM). */
export function sanitizeChecks(input: unknown): Check[] {
  if (!Array.isArray(input)) return [];
  const out: Check[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (typeof c.type !== "string" || !ALLOWED_TYPES.has(c.type)) continue;
    const path = typeof c.path === "string" ? normalizePath(c.path) : null;
    if (!path) continue;
    switch (c.type) {
      case "file_exists":
      case "valid_html":
        out.push({ type: c.type, path });
        break;
      case "selector_exists":
        if (typeof c.selector === "string" && c.selector.trim()) out.push({ type: "selector_exists", path, selector: c.selector.trim() });
        break;
      case "text_contains":
        if (typeof c.text === "string" && c.text.trim()) out.push({ type: "text_contains", path, text: c.text });
        break;
      case "link_to":
        if (typeof c.href === "string" && c.href.trim()) out.push({ type: "link_to", path, href: c.href.trim() });
        break;
    }
  }
  return out.slice(0, 12);
}

/** Rutas relativas planas y con extensión web. Evita escrituras raras. */
export function normalizePath(p: string): string | null {
  const clean = p.trim().replace(/^\.?\/+/, "");
  if (!/^[a-zA-Z0-9_\-]+(\/[a-zA-Z0-9_\-]+)*\.(html|css|js)$/.test(clean)) return null;
  return clean;
}

export function runCheck(check: Check, files: Map<string, string>): CheckResult {
  const content = files.get(check.path);
  if (content === undefined) {
    return { check, passed: false, detail: `No existe el archivo ${check.path}` };
  }
  switch (check.type) {
    case "file_exists":
      return { check, passed: true, detail: `${check.path} existe` };
    case "valid_html": {
      const ok = valid(content) && /<html[\s>]/i.test(content) && /<\/html>/i.test(content);
      return { check, passed: ok, detail: ok ? "HTML bien formado" : `HTML mal formado en ${check.path}` };
    }
    case "selector_exists": {
      try {
        const found = parse(content).querySelector(check.selector);
        return {
          check,
          passed: Boolean(found),
          detail: found ? `Encontrado «${check.selector}»` : `No se encuentra «${check.selector}» en ${check.path}`,
        };
      } catch {
        return { check, passed: false, detail: `Selector no válido: ${check.selector}` };
      }
    }
    case "text_contains": {
      const ok = content.toLowerCase().includes(check.text.toLowerCase());
      return { check, passed: ok, detail: ok ? `Contiene «${check.text}»` : `${check.path} no contiene «${check.text}»` };
    }
    case "link_to": {
      const links = parse(content)
        .querySelectorAll("a[href]")
        .map((a) => a.getAttribute("href"));
      const ok = links.includes(check.href);
      return { check, passed: ok, detail: ok ? `Enlaza a ${check.href}` : `${check.path} no enlaza a ${check.href}` };
    }
  }
}

/**
 * Comprobaciones globales que Testing pasa siempre, además de las de la tarea:
 * enlaces internos rotos y hojas de estilo inexistentes.
 */
export function globalChecks(files: Map<string, string>): CheckResult[] {
  const results: CheckResult[] = [];
  for (const [path, content] of files) {
    if (!path.endsWith(".html")) continue;
    const root = parse(content);
    const refs = [
      ...root.querySelectorAll("a[href]").map((a) => a.getAttribute("href") || ""),
      ...root.querySelectorAll('link[rel="stylesheet"]').map((l) => l.getAttribute("href") || ""),
      ...root.querySelectorAll("script[src]").map((s) => s.getAttribute("src") || ""),
    ];
    const broken = refs
      .filter((h) => h && !/^(https?:|mailto:|tel:|#|\/\/|data:)/i.test(h))
      .map((h) => h.split("#")[0].split("?")[0].replace(/^\.\//, ""))
      .filter((h) => h && !files.has(h));
    const unique = [...new Set(broken)];
    results.push({
      check: { type: "file_exists", path },
      passed: unique.length === 0,
      detail: unique.length ? `${path}: enlaces rotos → ${unique.join(", ")}` : `${path}: sin enlaces rotos`,
    });
  }
  return results;
}
