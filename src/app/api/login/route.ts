import { NextResponse } from "next/server";
import { checkCredentials, COOKIE, createSessionToken } from "@/lib/auth";

export async function POST(request: Request) {
  const { user, password } = (await request.json().catch(() => ({}))) as { user?: string; password?: string };
  if (!checkCredentials(String(user ?? ""), String(password ?? ""))) {
    return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await createSessionToken(String(user)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
