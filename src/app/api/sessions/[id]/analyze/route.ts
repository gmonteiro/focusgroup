import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const body = await req.json();
  const questionId: string | null = body.question_id || null;

  const supabase = createServerClient();
  const anthropic = new Anthropic();

  // Load session
  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Sessao nao encontrada" }, { status: 404 });
  }

  if (!questionId) {
    // Return list of question IDs to process (frontend will loop)
    const { data: questions } = await supabase
      .from("questions")
      .select("id, text, sort_order")
      .eq("session_id", sessionId)
      .order("sort_order");

    return NextResponse.json({ questions: questions || [] });
  }

  // Process a single question
  const { data: question } = await supabase
    .from("questions")
    .select("*")
    .eq("id", questionId)
    .single();

  if (!question) {
    return NextResponse.json({ error: "Pergunta nao encontrada" }, { status: 404 });
  }

  // Load profiles
  const { data: profiles } = await supabase
    .from("agent_profiles")
    .select("id, name, role, industry, company_size")
    .eq("session_id", sessionId);

  const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

  // Load completed responses for this question
  const { data: responses } = await supabase
    .from("responses")
    .select("agent_profile_id, response_text")
    .eq("session_id", sessionId)
    .eq("question_id", questionId)
    .eq("status", "completed");

  if (!responses?.length) {
    return NextResponse.json({ message: "Sem respostas para esta pergunta", skipped: true });
  }

  // Build responses text — limit to avoid token overflow
  // Take a sample if too many responses (max ~50 to stay within context)
  const sampled = responses.length > 50
    ? responses.sort(() => Math.random() - 0.5).slice(0, 50)
    : responses;

  const responsesText = sampled
    .map((r) => {
      const profile = profileMap.get(r.agent_profile_id);
      if (!profile) return "";
      // Truncate individual responses to 300 chars
      const text = r.response_text && r.response_text.length > 300
        ? r.response_text.slice(0, 300) + "..."
        : r.response_text;
      return `[${profile.role} | ${profile.industry} | ${profile.company_size}] ${profile.name}:\n${text}`;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");

  const sampleNote = responses.length > 50
    ? `\n\nNota: Estas sao ${sampled.length} respostas amostradas de um total de ${responses.length}.`
    : "";

  const analysisPrompt = `Voce e um analista de pesquisa qualitativa especializado em focus groups corporativos.

Analise as ${sampled.length} respostas abaixo para a pergunta:
"${question.text}"${sampleNote}

Cada resposta inclui o perfil do respondente: [Cargo | Industria | Porte da empresa].

Responda APENAS com JSON valido, sem texto antes ou depois. Use exatamente este formato:

{
  "summary": {
    "text": "Resumo geral dos achados (3-5 paragrafos)"
  },
  "themes": {
    "themes": [
      {"name": "Nome do Tema", "count": 15, "description": "Descricao do tema e exemplos"}
    ]
  },
  "divergences": {
    "divergences": [
      {"dimension": "role|industry|company_size", "group_a": "Grupo A", "group_b": "Grupo B", "description": "Como as visoes divergem"}
    ]
  },
  "chart_data": {
    "title": "Distribuicao de Sentimento",
    "chart_type": "pie",
    "data": [
      {"name": "Positivo", "value": 45},
      {"name": "Neutro", "value": 30},
      {"name": "Negativo", "value": 25}
    ]
  }
}

Identifique:
1. Temas mais recorrentes (com contagem aproximada)
2. Divergencias significativas entre cargos, industrias ou portes
3. Outliers ou perspectivas inesperadas
4. Sentimento geral (positivo/neutro/negativo)

Respostas:

${responsesText}`;

  try {
    const msg = await anthropic.messages.create({
      model: session.model,
      max_tokens: 4096,
      messages: [{ role: "user", content: analysisPrompt }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "";

    // Extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      await supabase.from("insights").upsert({
        session_id: sessionId,
        question_id: questionId,
        insight_type: "summary",
        content: { text },
        model_used: session.model,
      });
      return NextResponse.json({ message: "Salvo como texto (JSON nao encontrado)" });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Delete old insights for this question
    await supabase
      .from("insights")
      .delete()
      .eq("session_id", sessionId)
      .eq("question_id", questionId);

    // Save each insight type
    const insightsToSave = [
      { type: "summary", content: parsed.summary },
      { type: "themes", content: parsed.themes },
      { type: "divergences", content: parsed.divergences },
      { type: "chart_data", content: parsed.chart_data },
    ].filter((i) => i.content);

    for (const insight of insightsToSave) {
      await supabase.from("insights").insert({
        session_id: sessionId,
        question_id: questionId,
        insight_type: insight.type,
        content: insight.content,
        model_used: session.model,
      });
    }

    return NextResponse.json({ message: "Analise concluida", insights: insightsToSave.length });
  } catch (err) {
    console.error("Analysis error:", err);
    return NextResponse.json(
      { error: "Erro na analise: " + (err instanceof Error ? err.message : "desconhecido") },
      { status: 500 }
    );
  }
}
