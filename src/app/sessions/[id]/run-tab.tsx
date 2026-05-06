"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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
    total: 0,
    completed: 0,
    running: 0,
    pending: 0,
    error: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
  });
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState<{ name: string; error: string }[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadStats();
    if (session.status === "running") {
      setRunning(true);
      startPolling();
    }
    return () => stopPolling();
  }, [session.id]);

  async function loadStats() {
    const { data } = await supabase
      .from("responses")
      .select("status, input_tokens, output_tokens")
      .eq("session_id", session.id);

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

    if (running && s.pending === 0 && s.running === 0) {
      setRunning(false);
      stopPolling();
      onStatusChange();
    }
  }

  async function loadErrors() {
    const { data } = await supabase
      .from("responses")
      .select("error_message, agent_profile_id")
      .eq("session_id", session.id)
      .eq("status", "error");

    if (data && data.length > 0) {
      const profileIds = data.map((d) => d.agent_profile_id);
      const { data: profiles } = await supabase
        .from("agent_profiles")
        .select("id, name")
        .in("id", profileIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p.name]) || []);
      setErrors(
        data.map((d) => ({
          name: profileMap.get(d.agent_profile_id) || "Desconhecido",
          error: d.error_message || "Erro desconhecido",
        }))
      );
    }
  }

  function startPolling() {
    pollingRef.current = setInterval(() => {
      loadStats();
    }, 2000);
  }

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  async function startRun() {
    setRunning(true);
    setErrors([]);

    try {
      const res = await fetch(`/api/sessions/${session.id}/run`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json();
        toast.error(body.error || "Erro ao iniciar execucao");
        setRunning(false);
        return;
      }

      toast.success("Execucao iniciada");
      startPolling();
      onStatusChange();
    } catch {
      toast.error("Erro de rede");
      setRunning(false);
    }
  }

  const progress =
    stats.total > 0
      ? Math.round(((stats.completed + stats.error) / stats.total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Execucao</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats.total === 0 && !running ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Clique em &quot;Iniciar&quot; para enviar todas as perguntas
                para todos os agentes.
              </p>
              <Button onClick={startRun}>Iniciar Execucao</Button>
            </div>
          ) : (
            <>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Progresso</span>
                  <span>
                    {stats.completed + stats.error} / {stats.total} ({progress}
                    %)
                  </span>
                </div>
                <Progress value={progress} />
              </div>

              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <Badge variant="secondary">{stats.pending}</Badge>
                  <span className="text-muted-foreground">pendentes</span>
                </div>
                <div className="flex items-center gap-1">
                  <Badge className="bg-yellow-100 text-yellow-800">
                    {stats.running}
                  </Badge>
                  <span className="text-muted-foreground">executando</span>
                </div>
                <div className="flex items-center gap-1">
                  <Badge className="bg-green-100 text-green-800">
                    {stats.completed}
                  </Badge>
                  <span className="text-muted-foreground">concluidos</span>
                </div>
                {stats.error > 0 && (
                  <div className="flex items-center gap-1">
                    <Badge variant="destructive">{stats.error}</Badge>
                    <span className="text-muted-foreground">erros</span>
                  </div>
                )}
              </div>

              <div className="text-xs text-muted-foreground">
                Tokens: {stats.total_input_tokens.toLocaleString()} input /{" "}
                {stats.total_output_tokens.toLocaleString()} output
              </div>

              {!running && stats.error > 0 && (
                <div className="flex gap-2">
                  <Button onClick={startRun} size="sm">
                    Retentar erros
                  </Button>
                  <Button
                    onClick={loadErrors}
                    size="sm"
                    variant="outline"
                  >
                    Ver erros
                  </Button>
                </div>
              )}

              {!running && stats.pending > 0 && (
                <Button onClick={startRun} size="sm">
                  Continuar execucao
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Erros ({errors.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {errors.map((e, i) => (
                <div key={i} className="text-sm p-2 rounded bg-destructive/10">
                  <span className="font-medium">{e.name}:</span> {e.error}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
