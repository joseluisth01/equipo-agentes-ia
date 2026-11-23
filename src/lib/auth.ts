/**
 * Acceso con un usuario de prueba (DEMO_USER / DEMO_PASSWORD).
 * Protege la cuota gratuita del LLM. Si no se define DEMO_PASSWORD, la app es abierta.
 * Usa Web Crypto para funcionar igual en Proxy y en Route Handlers.
 */
export const COOKIE = "agentes_session";

export function authEnabled() {
  return Boolean(process.env.DEMO_PASSWORD);
}

async function hmac(value: string) {
  const secret = process.env.AUTH_SECRET || process.env.DEMO_PASSWORD || "dev-secret";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(user: string) {
  const payload = `${user}:${Date.now() + 1000 * 60 * 60 * 24 * 7}`;
  return `${btoa(payload)}.${await hmac(payload)}`;
}

export async function verifySessionToken(token: string | undefined) {
  if (!token) return false;
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return false;
  let payload: string;
  try {
    payload = atob(b64);
  } catch {
    return false;
  }
  if ((await hmac(payload)) !== sig) return false;
  const expires = Number(payload.split(":").pop());
  return Number.isFinite(expires) && expires > Date.now();
}

export function checkCredentials(user: string, password: string) {
  const expectedUser = process.env.DEMO_USER || "demo";
  return user === expectedUser && password === process.env.DEMO_PASSWORD;
}
