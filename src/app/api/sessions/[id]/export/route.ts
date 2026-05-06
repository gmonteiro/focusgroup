import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const supabase = createServerClient();

  const [
    { data: session },
    { data: profiles },
    { data: questions },
    { data: responses },
    { data: insights },
  ] = await Promise.all([
    supabase.from("sessions").select("*").eq("id", sessionId).single(),
    supabase.from("agent_profiles").select("*").eq("session_id", sessionId),
    supabase
      .from("questions")
      .select("*")
      .eq("session_id", sessionId)
      .order("sort_order"),
    supabase
      .from("responses")
      .select("*")
      .eq("session_id", sessionId)
      .eq("status", "completed"),
    supabase.from("insights").select("*").eq("session_id", sessionId),
  ]);

  if (!session) {
    return NextResponse.json({ error: "Sessao nao encontrada" }, { status: 404 });
  }

  const profileMap = new Map(
    (profiles || []).map((p) => [p.id, p])
  );
  const questionMap = new Map(
    (questions || []).map((q) => [q.id, q])
  );

  const exportData = {
    session: {
      id: session.id,
      name: session.name,
      description: session.description,
      model: session.model,
      status: session.status,
      created_at: session.created_at,
    },
    profiles: profiles || [],
    questions: questions || [],
    responses: (responses || []).map((r) => ({
      profile: profileMap.get(r.agent_profile_id),
      question: questionMap.get(r.question_id)?.text,
      response: r.response_text,
      tokens: {
        input: r.input_tokens,
        output: r.output_tokens,
      },
    })),
    insights: insights || [],
    summary: {
      total_profiles: profiles?.length || 0,
      total_questions: questions?.length || 0,
      total_responses: responses?.length || 0,
      total_insights: insights?.length || 0,
    },
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="focusgroup-${sessionId}.json"`,
    },
  });
}
