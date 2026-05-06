"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ProfilesTab from "./profiles-tab";
import QuestionsTab from "./questions-tab";
import RunTab from "./run-tab";
import InsightsTab from "./insights-tab";

type Session = {
  id: string;
  name: string;
  description: string | null;
  model: string;
  concurrency: number;
  status: string;
  created_at: string;
};

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  running: "Executando",
  completed: "Concluido",
};

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    const { data } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();
    if (data) setSession(data);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  async function deleteSession() {
    if (!confirm("Tem certeza que deseja excluir esta sessao?")) return;
    await supabase.from("sessions").delete().eq("id", sessionId);
    toast.success("Sessao excluida");
    router.push("/");
  }

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;
  if (!session) return <p>Sessao nao encontrada</p>;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{session.name}</h1>
          {session.description && (
            <p className="text-muted-foreground text-sm mt-1">
              {session.description}
            </p>
          )}
          <div className="flex gap-2 mt-2">
            <Badge variant="outline">{statusLabels[session.status]}</Badge>
            <Badge variant="secondary">
              {session.model.includes("haiku")
                ? "Haiku"
                : session.model.includes("sonnet")
                  ? "Sonnet"
                  : "Opus"}
            </Badge>
            <Badge variant="secondary">
              Concorrencia: {session.concurrency}
            </Badge>
          </div>
        </div>
        <Button variant="destructive" size="sm" onClick={deleteSession}>
          Excluir
        </Button>
      </div>

      <Tabs defaultValue="profiles">
        <TabsList>
          <TabsTrigger value="profiles">Perfis</TabsTrigger>
          <TabsTrigger value="questions">Perguntas</TabsTrigger>
          <TabsTrigger value="run">Execucao</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="profiles" className="mt-4">
          <ProfilesTab sessionId={sessionId} />
        </TabsContent>

        <TabsContent value="questions" className="mt-4">
          <QuestionsTab sessionId={sessionId} />
        </TabsContent>

        <TabsContent value="run" className="mt-4">
          <RunTab session={session} onStatusChange={loadSession} />
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          <InsightsTab session={session} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
