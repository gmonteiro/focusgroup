"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

type Session = {
  id: string;
  name: string;
  model: string;
  concurrency: number;
  status: string;
};

type ResponseStats = {
  total: number;
  completed: number;
  running: number;
  pending: number;
  error: number;
  total_input_tokens: number;
  total_output_tokens: number;
};

type ActivityEntry = {
  id: string;
  profileName: string;
  role: string;
  industry: string;
  questionSnippet: string;
  status: string;
  timestamp: string;
  responseSnippet?: string;
};

export default function RunTab({
  session,
  onStatusChange,
}: {
  session: Session;
  onStatusChange: () => void;
}) {
  const [stats, setStats] = useState<ResponseStats>({
    total: 0, completed: 0, running: 0, pending: 0, error: 0,
    total_input_tokens: 0, total_output_tokens: 0,
  });
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState<{ name: string; error: string }[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activityRef = useRef<HTMLDivElement>(null);
  const profileCacheRef = useRef<Map<string, { name: string; role: string; industry: string }>>(new Map());
  const questionCacheRef = useRef<Map<string, string>>(new Map());
  const seenCompletedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadStats();
    loadCaches();
    if (session.status === "running") { setRunning(true); startPolling(); }
    return () => stopPolling();
  }, [session.id]);

  async function loadCaches() {
    const [{ data: profiles }, { data: questions }] = await Promise.all([
      supabase.from("agent_profiles").select("id, name, role, industry").eq("session_id", session.id),
      supabase.from("questions").select("id, text").eq("session_id", session.id),
    ]);
    if (profiles) {
      profileCacheRef.current = new Map(profiles.map((p) => [p.id, { name: p.name, role: p.role, industry: p.industry }]));
    }
    if (questions) {
      questionCacheRef.current = new Map(questions.map((q) => [q.id, q.text]));
    }
  }

  async function loadStats() {
    const { data } = await supabase.from("responses").select("status, input_tokens, output_tokens").eq("session_id", session.id);
    if (!data) return;
    const s: ResponseStats = {
      total: data.length,
      completed: data.filter((r) => r.status === "completed").length,
      running: data.filter((r) => r.status === "running").length,
      pending: data.filter((r) => r.status === "pending").length,
      error: data.filter((r) => r.status === "error").length,
      total_input_tokens: data.reduce((sum, r) => sum + (r.input_tokens || 0), 0),
      total_output_tokens: data.reduce((sum, r) => sum + (r.output_tokens || 0), 0),
    };
    setStats(s);

    // Load activity feed
    await loadActivity();

    if (running && s.pending === 0 && s.running === 0) { setRunning(false); stopPolling(); onStatusChange(); }
  }

  async function loadActivity() {
    // Get currently running
    const { data: runningItems } = await supabase
      .from("responses")
      .select("id, agent_profile_id, question_id, status, created_at")
      .eq("session_id", session.id)
      .eq("status", "running")
      .limit(10);

    // Get recently completed/errored (newest first)
    const { data: recentItems } = await supabase
      .from("responses")
      .select("id, agent_profile_id, question_id, status, response_text, error_message, created_at")
      .eq("session_id", session.id)
      .in("status", ["completed", "error"])
      .order("created_at", { ascending: false })
      .limit(20);

    const entries: ActivityEntry[] = [];

    // Running items first
    for (const item of runningItems || []) {
      const profile = profileCacheRef.current.get(item.agent_profile_id);
      const questionText = questionCacheRef.current.get(item.question_id);
      entries.push({
        id: item.id,
        profileName: profile?.name || "...",
        role: profile?.role || "",
        industry: profile?.industry || "",
        questionSnippet: questionText ? questionText.slice(0, 60) : "...",
        status: "running",
        timestamp: item.created_at,
      });
    }

    // Recent completed/error
    for (const item of recentItems || []) {
      const profile = profileCacheRef.current.get(item.agent_profile_id);
      const questionText = questionCacheRef.current.get(item.question_id);
      entries.push({
        id: item.id,
        profileName: profile?.name || "...",
        role: profile?.role || "",
        industry: profile?.industry || "",
        questionSnippet: questionText ? questionText.slice(0, 60) : "...",
        status: item.status,
        timestamp: item.created_at,
        responseSnippet: item.status === "completed" && item.response_text
          ? item.response_text.slice(0, 120) + (item.response_text.length > 120 ? "..." : "")
          : item.error_message || undefined,
      });
    }

    // Check for new completions to auto-scroll
    const newCompleted = entries.filter((e) => e.status === "completed" && !seenCompletedRef.current.has(e.id));
    if (newCompleted.length > 0) {
      for (const e of newCompleted) seenCompletedRef.current.add(e.id);
      // Auto-scroll to top of activity
      if (activityRef.current) {
        activityRef.current.scrollTop = 0;
      }
    }

    setActivity(entries);
  }

  async function loadErrors() {
    const { data } = await supabase.from("responses").select("error_message, agent_profile_id").eq("session_id", session.id).eq("status", "error");
    if (data && data.length > 0) {
      const profileIds = data.map((d) => d.agent_profile_id);
      const { data: profiles } = await supabase.from("agent_profiles").select("id, name").in("id", profileIds);
      const profileMap = new Map(profiles?.map((p) => [p.id, p.name]) || []);
      setErrors(data.map((d) => ({ name: profileMap.get(d.agent_profile_id) || "Desconhecido", error: d.error_message || "Erro desconhecido" })));
    }
  }

  function startPolling() { pollingRef.current = setInterval(() => loadStats(), 2000); }
  function stopPolling() { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } }

  async function startRun() {
    setRunning(true);
    setErrors([]);
    setActivity([]);
    seenCompletedRef.current.clear();
    try {
      const res = await fetch(`/api/sessions/${session.id}/run`, { method: "POST" });
      if (!res.ok) { const body = await res.json(); toast.error(body.error || "Erro ao iniciar execucao"); setRunning(false); return; }
      toast.success("Execucao iniciada");
      startPolling();
      onStatusChange();
    } catch { toast.error("Erro de rede"); setRunning(false); }
  }

  const progress = stats.total > 0 ? Math.round(((stats.completed + stats.error) / stats.total) * 100) : 0;

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/30">
          <h3 className="font-semibold text-sm">Motor de Execucao</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Envia todas as perguntas para todos os agentes em paralelo
          </p>
        </div>
        <div className="p-6">
          {stats.total === 0 && !running ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-2xl gradient-bg-subtle mx-auto mb-4 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary/60">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
              <h4 className="font-medium mb-1">Pronto para executar</h4>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                Clique abaixo para iniciar o focus group. Cada agente recebera todas as perguntas.
              </p>
              <Button onClick={startRun} size="lg" className="gradient-bg border-0 shadow-lg shadow-primary/25">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Iniciar Execucao
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Progress */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium">Progresso</span>
                  <span className="text-muted-foreground tabular-nums">
                    {stats.completed + stats.error} / {stats.total} ({progress}%)
                  </span>
                </div>
                <div className="relative">
                  <Progress value={progress} className="h-3 rounded-full" />
                  {running && (
                    <div className="absolute inset-0 rounded-full overflow-hidden">
                      <div className="h-full w-full animate-pulse bg-primary/10 rounded-full" />
                    </div>
                  )}
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Pendentes", value: stats.pending, color: "text-muted-foreground", bg: "bg-muted/50" },
                  { label: "Executando", value: stats.running, color: "text-amber-600", bg: "bg-amber-50" },
                  { label: "Concluidos", value: stats.completed, color: "text-emerald-600", bg: "bg-emerald-50" },
                  { label: "Erros", value: stats.error, color: "text-red-600", bg: "bg-red-50" },
                ].map((s) => (
                  <div key={s.label} className={`rounded-lg ${s.bg} p-3 text-center`}>
                    <div className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Tokens */}
              <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                <span>Input: <strong className="text-foreground">{stats.total_input_tokens.toLocaleString()}</strong> tokens</span>
                <span>Output: <strong className="text-foreground">{stats.total_output_tokens.toLocaleString()}</strong> tokens</span>
              </div>

              {/* Actions */}
              {!running && stats.error > 0 && (
                <div className="flex gap-2">
                  <Button onClick={startRun} size="sm" className="gradient-bg border-0">Retentar erros</Button>
                  <Button onClick={loadErrors} size="sm" variant="outline">Ver erros</Button>
                </div>
              )}
              {!running && stats.pending > 0 && (
                <Button onClick={startRun} size="sm" className="gradient-bg border-0">Continuar execucao</Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Activity Feed */}
      {activity.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/30 flex items-center gap-2">
            {running && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
            )}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <h3 className="font-semibold text-sm">Atividade em Tempo Real</h3>
            <span className="text-xs text-muted-foreground ml-auto">
              {running ? "Atualizando a cada 2s" : "Execucao finalizada"}
            </span>
          </div>
          <div ref={activityRef} className="max-h-[420px] overflow-y-auto divide-y divide-border/30">
            {activity.map((entry) => (
              <div
                key={entry.id + entry.status}
                className={`px-6 py-3 transition-colors ${
                  entry.status === "running" ? "bg-amber-50/50" : ""
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {/* Status indicator */}
                  {entry.status === "running" ? (
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                    </span>
                  ) : entry.status === "completed" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500 shrink-0">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500 shrink-0">
                      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  )}

                  {/* Agent name */}
                  <span className="text-sm font-medium">{entry.profileName}</span>

                  {/* Role & industry badges */}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                    {entry.role}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                    {entry.industry}
                  </span>

                  {/* Status label */}
                  <span className={`text-[10px] ml-auto font-medium ${
                    entry.status === "running" ? "text-amber-600" :
                    entry.status === "completed" ? "text-emerald-600" :
                    "text-red-600"
                  }`}>
                    {entry.status === "running" ? "Processando..." :
                     entry.status === "completed" ? "Concluido" : "Erro"}
                  </span>
                </div>

                {/* Question */}
                <p className="text-xs text-muted-foreground ml-5 mb-1">
                  <span className="text-muted-foreground/60">Pergunta:</span> {entry.questionSnippet}
                  {entry.questionSnippet.length >= 60 && "..."}
                </p>

                {/* Response snippet or error */}
                {entry.responseSnippet && (
                  <div className={`ml-5 text-xs p-2 rounded-md mt-1 ${
                    entry.status === "error"
                      ? "bg-red-50 text-red-700 border border-red-100"
                      : "bg-muted/40 text-foreground/80"
                  }`}>
                    {entry.status === "error" ? (
                      <span className="flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        {entry.responseSnippet}
                      </span>
                    ) : (
                      <span className="italic">&ldquo;{entry.responseSnippet}&rdquo;</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Errors detail */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-destructive/20 bg-card overflow-hidden">
          <div className="px-6 py-4 border-b bg-destructive/5">
            <h3 className="font-semibold text-sm text-destructive">Erros ({errors.length})</h3>
          </div>
          <div className="divide-y divide-border/50 max-h-60 overflow-y-auto">
            {errors.map((e, i) => (
              <div key={i} className="px-6 py-3 text-sm">
                <span className="font-medium">{e.name}</span>
                <span className="text-muted-foreground ml-2">{e.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
