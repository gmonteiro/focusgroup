import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

async function callWithRetry(
  anthropic: Anthropic,
  params: { model: string; max_tokens: number; system: string; messages: { role: "user"; content: string }[] },
  maxRetries = 3
) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await anthropic.messages.create(params);
    } catch (err) {
      const isRateLimit =
        err instanceof Anthropic.RateLimitError ||
        (err instanceof Error && err.message.includes("rate_limit"));

      if (isRateLimit && attempt < maxRetries) {
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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const supabase = createServerClient();
  const anthropic = new Anthropic();

  const body = await req.json().catch(() => ({}));
  const mode: string = body.mode || "batch"; // "init" to create records, "batch" to process a batch

  // Load session
  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Sessao nao encontrada" }, { status: 404 });
  }

  // === INIT MODE: create response records ===
  if (mode === "init") {
    const [{ data: profiles }, { data: questions }] = await Promise.all([
      supabase.from("agent_profiles").select("id").eq("session_id", sessionId),
      supabase.from("questions").select("id").eq("session_id", sessionId),
    ]);

    if (!profiles?.length || !questions?.length) {
      return NextResponse.json(
        { error: "Adicione perfis e perguntas antes de executar" },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("responses")
      .select("agent_profile_id, question_id")
      .eq("session_id", sessionId);

    const existingSet = new Set(
      (existing || []).map((r) => `${r.agent_profile_id}:${r.question_id}`)
    );

    const toCreate: { session_id: string; agent_profile_id: string; question_id: string }[] = [];
    for (const profile of profiles) {
      for (const question of questions) {
        const key = `${profile.id}:${question.id}`;
        if (!existingSet.has(key)) {
          toCreate.push({ session_id: sessionId, agent_profile_id: profile.id, question_id: question.id });
        }
      }
    }

    if (toCreate.length > 0) {
      for (let i = 0; i < toCreate.length; i += 100) {
        await supabase.from("responses").insert(toCreate.slice(i, i + 100));
      }
    }

    // Reset any stuck "running" responses back to pending
    await supabase
      .from("responses")
      .update({ status: "pending" })
      .eq("session_id", sessionId)
      .eq("status", "running");

    await supabase.from("sessions").update({ status: "running" }).eq("id", sessionId);

    const { count } = await supabase
      .from("responses")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .in("status", ["pending", "error"]);

    return NextResponse.json({ pending: count || 0 });
  }

  // === BATCH MODE: process next batch ===
  // Adjust batch size and concurrency based on model speed
  const isOpus = session.model.includes("opus");
  const isSonnet = session.model.includes("sonnet");
  const batchSize = isOpus ? 2 : isSonnet ? 3 : 5;
  const concurrency = isOpus ? 1 : 2;

  // Get next batch of pending responses
  const { data: batch } = await supabase
    .from("responses")
    .select("id, agent_profile_id, question_id")
    .eq("session_id", sessionId)
    .in("status", ["pending", "error"])
    .limit(batchSize);

  if (!batch?.length) {
    // All done
    await supabase.from("sessions").update({ status: "completed" }).eq("id", sessionId);
    return NextResponse.json({ processed: 0, remaining: 0, done: true });
  }

  // Load profiles and questions for this batch
  const profileIds = [...new Set(batch.map((r) => r.agent_profile_id))];
  const questionIds = [...new Set(batch.map((r) => r.question_id))];

  const [{ data: profiles }, { data: questions }] = await Promise.all([
    supabase.from("agent_profiles").select("id, system_prompt").in("id", profileIds),
    supabase.from("questions").select("id, text").in("id", questionIds),
  ]);

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
  const questionMap = new Map((questions || []).map((q) => [q.id, q]));

  // Process batch with concurrency
  const pLimit = (await import("p-limit")).default;
  const limit = pLimit(concurrency);

  let processed = 0;

  const tasks = batch.map((response) =>
    limit(async () => {
      const profile = profileMap.get(response.agent_profile_id);
      const question = questionMap.get(response.question_id);
      if (!profile || !question) return;

      await supabase.from("responses").update({ status: "running" }).eq("id", response.id);

      try {
        const msg = await callWithRetry(anthropic, {
          model: session.model,
          max_tokens: 1024,
          system: profile.system_prompt,
          messages: [{ role: "user", content: question.text }],
        });

        const text = msg.content[0].type === "text" ? msg.content[0].text : "";

        await supabase.from("responses").update({
          status: "completed",
          response_text: text,
          model_used: session.model,
          input_tokens: msg.usage.input_tokens,
          output_tokens: msg.usage.output_tokens,
        }).eq("id", response.id);

        processed++;
      } catch (err) {
        await supabase.from("responses").update({
          status: "error",
          error_message: err instanceof Error ? err.message : "Unknown error",
        }).eq("id", response.id);
        processed++;
      }
    })
  );

  await Promise.all(tasks);

  // Check remaining
  const { count: remaining } = await supabase
    .from("responses")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .in("status", ["pending", "error"]);

  const done = (remaining || 0) === 0;
  if (done) {
    await supabase.from("sessions").update({ status: "completed" }).eq("id", sessionId);
  }

  return NextResponse.json({ processed, remaining: remaining || 0, done });
}
