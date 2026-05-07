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
  const mode: string = body.mode || "question"; // "question" | "list" | "global"

  const supabase = createServerClient();
  const anthropic = new Anthropic();

  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Sessao nao encontrada" }, { status: 404 });
  }

  // === LIST MODE: return questions to process ===
  if (mode === "list" || (!questionId && mode !== "global")) {
    const { data: questions } = await supabase
      .from("questions")
      .select("id, text, sort_order")
      .eq("session_id", sessionId)
      .order("sort_order");
    return NextResponse.json({ questions: questions || [] });
  }

  // === GLOBAL MODE: cross-question executive summary ===
  if (mode === "global") {
    // Load all per-question insights (summaries)
    const { data: allInsights } = await supabase
      .from("insights")
      .select("question_id, insight_type, content")
      .eq("session_id", sessionId)
      .in("insight_type", ["summary", "themes"]);

    const { data: questions } = await supabase
      .from("questions")
      .select("id, text, sort_order")
      .eq("session_id", sessionId)
      .order("sort_order");

    if (!allInsights?.length || !questions?.length) {
      return NextResponse.json({ error: "Gere insights por pergunta primeiro" }, { status: 400 });
    }

    const questionMap = new Map(questions.map((q) => [q.id, q]));

    // Build digest of all per-question insights
    const digest = allInsights
      .filter((i) => i.insight_type === "summary" && i.question_id)
      .map((i) => {
        const q = questionMap.get(i.question_id!);
        const text = (i.content as { text?: string }).text || "";
        return `Pergunta: "${q?.text || "?"}"\nResumo: ${text.slice(0, 500)}`;
      })
      .join("\n\n---\n\n");

    const globalPrompt = `Voce e um consultor estrategico senior analisando os resultados de um focus group virtual com profissionais do departamento financeiro de grandes empresas.

Abaixo estao os resumos das analises de ${questions.length} perguntas feitas a ${questions.length > 0 ? "dezenas de" : ""} profissionais com diferentes cargos, industrias e portes de empresa.

Gere uma ANALISE EXECUTIVA GLOBAL. Responda APENAS com JSON valido:

{
  "executive_summary": "2-3 frases com a conclusao principal do focus group",
  "key_findings": [
    {"emoji": "icon", "title": "Titulo curto", "detail": "1 frase explicativa", "priority": "high|medium|low"}
  ],
  "opportunities": [
    {"title": "Oportunidade identificada", "detail": "1 frase sobre o potencial", "segments": "Quais cargos/industrias mais se beneficiam"}
  ],
  "risks": [
    {"title": "Risco ou barreira", "detail": "1 frase explicativa"}
  ],
  "recommendation": "1-2 frases com a recomendacao principal de acao"
}

Regras:
- Key findings: maximo 7 bullets, ordenados por importancia
- Opportunities: maximo 5, focadas em oportunidades de negocio/produto
- Risks: maximo 3
- Seja CONCISO. Cada bullet deve ser escaneavel em 3 segundos.
- Foque no que e ACIONAVEL e SURPREENDENTE, nao no obvio.

Resumos por pergunta:

${digest}`;

    try {
      const msg = await anthropic.messages.create({
        model: session.model,
        max_tokens: 4096,
        messages: [{ role: "user", content: globalPrompt }],
      });

      const text = msg.content[0].type === "text" ? msg.content[0].text : "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      // Delete old global insights
      await supabase
        .from("insights")
        .delete()
        .eq("session_id", sessionId)
        .is("question_id", null);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        await supabase.from("insights").insert({
          session_id: sessionId,
          question_id: null,
          insight_type: "global",
          content: parsed,
          model_used: session.model,
        });
      } else {
        await supabase.from("insights").insert({
          session_id: sessionId,
          question_id: null,
          insight_type: "global",
          content: { executive_summary: text, key_findings: [], opportunities: [], risks: [], recommendation: "" },
          model_used: session.model,
        });
      }

      return NextResponse.json({ message: "Analise global concluida" });
    } catch (err) {
      return NextResponse.json(
        { error: "Erro: " + (err instanceof Error ? err.message : "desconhecido") },
        { status: 500 }
      );
    }
  }

  // === QUESTION MODE: analyze single question ===
  const { data: question } = await supabase
    .from("questions")
    .select("*")
    .eq("id", questionId)
    .single();

  if (!question) {
    return NextResponse.json({ error: "Pergunta nao encontrada" }, { status: 404 });
  }

  const { data: profiles } = await supabase
    .from("agent_profiles")
    .select("id, name, role, industry, company_size")
    .eq("session_id", sessionId);

  const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

  const { data: responses } = await supabase
    .from("responses")
    .select("agent_profile_id, response_text")
    .eq("session_id", sessionId)
    .eq("question_id", questionId)
    .eq("status", "completed");

  if (!responses?.length) {
    return NextResponse.json({ message: "Sem respostas", skipped: true });
  }

  const sampled = responses.length > 50
    ? responses.sort(() => Math.random() - 0.5).slice(0, 50)
    : responses;

  const responsesText = sampled
    .map((r) => {
      const profile = profileMap.get(r.agent_profile_id);
      if (!profile) return "";
      const text = r.response_text && r.response_text.length > 300
        ? r.response_text.slice(0, 300) + "..."
        : r.response_text;
      return `[${profile.role} | ${profile.industry} | ${profile.company_size}]:\n${text}`;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");

  const sampleNote = responses.length > 50
    ? ` (amostra de ${sampled.length} de ${responses.length} total)`
    : "";

  const analysisPrompt = `Analise as ${sampled.length} respostas${sampleNote} para:
"${question.text}"

Perfil dos respondentes: [Cargo | Industria | Porte].

Responda APENAS com JSON valido:

{
  "summary": {
    "headline": "1 frase com o achado principal",
    "bullets": ["Bullet point 1", "Bullet point 2", "...max 5 bullets concisos"]
  },
  "themes": {
    "themes": [
      {"name": "Tema", "count": 15, "description": "1 frase curta"}
    ]
  },
  "divergences": {
    "divergences": [
      {"dimension": "role|industry|company_size", "group_a": "Grupo A", "group_b": "Grupo B", "description": "1 frase sobre a divergencia"}
    ]
  },
  "chart_data": {
    "title": "Distribuicao de Sentimento",
    "chart_type": "pie",
    "data": [{"name": "Positivo", "value": 45}, {"name": "Neutro", "value": 30}, {"name": "Negativo", "value": 25}]
  }
}

Regras:
- Summary: 1 headline + max 5 bullet points CONCISOS (cada um escaneavel em 3 seg)
- Themes: max 5, com contagem e descricao de 1 frase
- Divergences: max 3, as mais significativas
- Foque no INESPERADO e ACIONAVEL, nao no obvio

Respostas:

${responsesText}`;

  try {
    const msg = await anthropic.messages.create({
      model: session.model,
      max_tokens: 4096,
      messages: [{ role: "user", content: analysisPrompt }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      await supabase.from("insights").insert({
        session_id: sessionId,
        question_id: questionId,
        insight_type: "summary",
        content: { headline: "Analise gerada", bullets: [text.slice(0, 200)] },
        model_used: session.model,
      });
      return NextResponse.json({ message: "Salvo como texto" });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    await supabase
      .from("insights")
      .delete()
      .eq("session_id", sessionId)
      .eq("question_id", questionId);

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
    return NextResponse.json(
      { error: "Erro: " + (err instanceof Error ? err.message : "desconhecido") },
      { status: 500 }
    );
  }
}
