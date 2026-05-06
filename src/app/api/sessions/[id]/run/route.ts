import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 300;

async function callWithRetry(
  anthropic: Anthropic,
  params: { model: string; max_tokens: number; system: string; messages: { role: "user"; content: string }[] },
  maxRetries = 5
) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await anthropic.messages.create(params);
    } catch (err) {
      const isRateLimit =
        err instanceof Anthropic.RateLimitError ||
        (err instanceof Error && err.message.includes("rate_limit"));

      if (isRateLimit && attempt < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s, 16s, 32s
        const delay = Math.pow(2, attempt + 1) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
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

  // Load profiles and questions
  const [{ data: profiles }, { data: questions }] = await Promise.all([
    supabase
      .from("agent_profiles")
      .select("*")
      .eq("session_id", sessionId),
    supabase
      .from("questions")
      .select("*")
      .eq("session_id", sessionId)
      .order("sort_order"),
  ]);

  if (!profiles?.length || !questions?.length) {
    return NextResponse.json(
      { error: "Adicione perfis e perguntas antes de executar" },
      { status: 400 }
    );
  }

  // Create pending response records for all combinations that don't exist yet
  const { data: existingResponses } = await supabase
    .from("responses")
    .select("agent_profile_id, question_id, status")
    .eq("session_id", sessionId);

  const existingSet = new Set(
    (existingResponses || []).map(
      (r) => `${r.agent_profile_id}:${r.question_id}`
    )
  );

  const toCreate: {
    session_id: string;
    agent_profile_id: string;
    question_id: string;
  }[] = [];

  for (const profile of profiles) {
    for (const question of questions) {
      const key = `${profile.id}:${question.id}`;
      if (!existingSet.has(key)) {
        toCreate.push({
          session_id: sessionId,
          agent_profile_id: profile.id,
          question_id: question.id,
        });
      }
    }
  }

  if (toCreate.length > 0) {
    for (let i = 0; i < toCreate.length; i += 100) {
      await supabase.from("responses").insert(toCreate.slice(i, i + 100));
    }
  }

  // Update session status
  await supabase
    .from("sessions")
    .update({ status: "running" })
    .eq("id", sessionId);

  // Get all pending/error responses to process
  const { data: pendingResponses } = await supabase
    .from("responses")
    .select("id, agent_profile_id, question_id")
    .eq("session_id", sessionId)
    .in("status", ["pending", "error"]);

  if (!pendingResponses?.length) {
    await supabase
      .from("sessions")
      .update({ status: "completed" })
      .eq("id", sessionId);
    return NextResponse.json({ message: "Nada para executar" });
  }

  // Build lookup maps
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  // Cap concurrency to avoid rate limits (max 5 for safety)
  const pLimit = (await import("p-limit")).default;
  const concurrency = Math.min(session.concurrency, 5);
  const limit = pLimit(concurrency);

  const tasks = pendingResponses.map((response) =>
    limit(async () => {
      const profile = profileMap.get(response.agent_profile_id);
      const question = questionMap.get(response.question_id);
      if (!profile || !question) return;

      // Mark as running
      await supabase
        .from("responses")
        .update({ status: "running" })
        .eq("id", response.id);

      try {
        const msg = await callWithRetry(anthropic, {
          model: session.model,
          max_tokens: 1024,
          system: profile.system_prompt,
          messages: [{ role: "user", content: question.text }],
        });

        const text =
          msg.content[0].type === "text" ? msg.content[0].text : "";

        await supabase
          .from("responses")
          .update({
            status: "completed",
            response_text: text,
            model_used: session.model,
            input_tokens: msg.usage.input_tokens,
            output_tokens: msg.usage.output_tokens,
          })
          .eq("id", response.id);
      } catch (err) {
        await supabase
          .from("responses")
          .update({
            status: "error",
            error_message:
              err instanceof Error ? err.message : "Unknown error",
          })
          .eq("id", response.id);
      }
    })
  );

  // Run all tasks (fire and forget for long-running)
  Promise.all(tasks).then(async () => {
    // Check if all done
    const { data: remaining } = await supabase
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .in("status", ["pending", "running"]);

    if ((remaining?.length ?? 0) === 0) {
      await supabase
        .from("sessions")
        .update({ status: "completed" })
        .eq("id", sessionId);
    }
  });

  return NextResponse.json({
    message: `Execucao iniciada: ${pendingResponses.length} respostas a processar (concorrencia: ${concurrency})`,
  });
}
