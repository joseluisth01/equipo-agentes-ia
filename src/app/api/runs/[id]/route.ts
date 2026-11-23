import { NextResponse } from "next/server";
import { getState } from "@/lib/engine";

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Id no válido" }, { status: 400 });
  try {
    const state = await getState(id);
    if (!state) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
