import { NextResponse } from "next/server";
import { createRun, listRuns } from "@/lib/engine";
import { llmAvailable, llmConfig } from "@/lib/llm";
import { TEMPLATES } from "@/lib/templates";

export async function GET() {
  try {
    const runs = await listRuns();
    const cfg = llmConfig();
    return NextResponse.json({
      runs,
      templates: TEMPLATES.map(({ id, name, description }) => ({ id, name, description })),
      llm: { available: llmAvailable(), provider: cfg.provider, model: cfg.model },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { request?: string; template?: string; demo?: boolean };
  const text = String(body.request ?? "").trim();
  if (text.length < 5 || text.length > 500) {
    return NextResponse.json({ error: "La petición debe tener entre 5 y 500 caracteres" }, { status: 400 });
  }
  try {
    const id = await createRun(text, String(body.template ?? ""), Boolean(body.demo));
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
