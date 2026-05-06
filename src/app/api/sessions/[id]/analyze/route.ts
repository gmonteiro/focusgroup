import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 300;

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

  // Load questions
  const questionsQuery = supabase
    .from("questions")
    .select("*")
    .eq("session_id", sessionId)
    .order("sort_order");

  if (questionId) {
    questionsQuery.eq("id", questionId);
  }

  const { data: questions } = await questionsQuery;
  if (!questions?.length) {
    return NextResponse.json({ error: "Nenhuma pergunta encontrada" }, { status: 400 });
  }

  // Load profiles
  const { data: profiles } = await supabase
    .from("agent_profiles")
    .select("id, name, role, industry, company_size")
    .eq("session_id", sessionId);

  const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

  // Process each question
  for (const question of questions) {
    // Load completed responses for this question
    const { data: responses } = await supabase
      .from("responses")
      .select("agent_profile_id, response_text")
      .eq("session_id", sessionId)
      .eq("question_id", question.id)
      .eq("status", "completed");

    if (!responses?.length) continue;

    // Build the responses text with profile context
    const responsesText = responses
      .map((r) => {
        const profile = profileMap.get(r.agent_profile_id);
        if (!profile) return "";
        return `[${profile.role} | ${profile.industry} | ${profile.company_size}] ${profile.name}:\n${r.response_text}`;
      })
      .filter(Boolean)
      .join("\n\n---\n\n");

    // Generate insights
    const analysisPrompt = `Voce e um analista de pesquisa qualitativa especializado em focus groups corporativos.

Analise as ${responses.length} respostas abaixo para a pergunta:
"${question.text}"

Cada resposta inclui o perfil do respondente: [Cargo | Industria | Porte da empresa].

Gere uma analise estruturada em JSON com exatamente este formato:

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
        // Save raw text as summary
        await supabase.from("insights").insert({
          session_id: sessionId,
          question_id: question.id,
          insight_type: "summary",
          content: { text },
          model_used: session.model,
        });
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Delete old insights for this question
      await supabase
        .from("insights")
        .delete()
        .eq("session_id", sessionId)
        .eq("question_id", question.id);

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
          question_id: question.id,
          insight_type: insight.type,
          content: insight.content,
          model_used: session.model,
        });
      }
    } catch (err) {
      console.error("Analysis error:", err);
      return NextResponse.json(
        { error: "Erro na analise: " + (err instanceof Error ? err.message : "desconhecido") },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ message: "Analise concluida" });
}
