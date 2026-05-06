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
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadStats();
    if (session.status === "running") { setRunning(true); startPolling(); }
    return () => stopPolling();
  }, [session.id]);

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
    if (running && s.pending === 0 && s.running === 0) { setRunning(false); stopPolling(); onStatusChange(); }
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
