import { NextResponse } from "next/server";
import { step } from "@/lib/engine";

// Un paso = una llamada a un agente. Cabe holgado en el límite de Vercel Hobby.
export const maxDuration = 120;

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Id no válido" }, { status: 400 });
  const result = await step(id);
  return NextResponse.json(result, { status: "error" in result ? 500 : 200 });
}
