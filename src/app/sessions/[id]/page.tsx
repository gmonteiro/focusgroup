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
  analysis_model: string;
  concurrency: number;
  status: string;
  created_at: string;
};

const statusConfig: Record<string, { label: string; class: string; dot: string }> = {
  draft: {
    label: "Rascunho",
    class: "bg-muted/80 text-muted-foreground border-transparent",
    dot: "bg-muted-foreground/50",
  },
  running: {
    label: "Executando",
    class: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500 animate-pulse",
  },
  completed: {
    label: "Concluido",
    class: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
};

function modelLabel(model: string) {
  if (model.includes("haiku")) return "Haiku";
  if (model.includes("sonnet")) return "Sonnet";
  return "Opus";
}

const TAB_ICONS = {
  profiles: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  questions: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  run: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  insights: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  ),
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

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-4 bg-muted rounded w-1/2" />
          <div className="h-10 bg-muted rounded w-full mt-6" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10 text-center">
        <p className="text-muted-foreground">Sessao nao encontrada</p>
      </div>
    );
  }

  const sc = statusConfig[session.status] || statusConfig.draft;

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 animate-fade-in">
      {/* Back + Header */}
      <button
        onClick={() => router.push("/")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Sessoes
      </button>

      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold tracking-tight">{session.name}</h1>
            <Badge variant="outline" className={`text-[11px] ${sc.class}`}>
              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${sc.dot}`} />
              {sc.label}
            </Badge>
          </div>
          {session.description && (
            <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
              {session.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <Badge variant="secondary" className="text-xs font-medium">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
              Respostas: {modelLabel(session.model)}
            </Badge>
            <Badge variant="secondary" className="text-xs font-medium">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                <path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" />
              </svg>
              Analise: {modelLabel(session.analysis_model || session.model)}
            </Badge>
            <Badge variant="secondary" className="text-xs font-medium">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              {session.concurrency}x paralelo
            </Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={deleteSession}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Excluir
        </Button>
      </div>

      <Tabs defaultValue="profiles">
        <TabsList className="bg-muted/50 p-1 h-auto rounded-xl">
          <TabsTrigger value="profiles" className="rounded-lg gap-2 data-[state=active]:shadow-sm px-4 py-2">
            {TAB_ICONS.profiles} Perfis
          </TabsTrigger>
          <TabsTrigger value="questions" className="rounded-lg gap-2 data-[state=active]:shadow-sm px-4 py-2">
            {TAB_ICONS.questions} Perguntas
          </TabsTrigger>
          <TabsTrigger value="run" className="rounded-lg gap-2 data-[state=active]:shadow-sm px-4 py-2">
            {TAB_ICONS.run} Execucao
          </TabsTrigger>
          <TabsTrigger value="insights" className="rounded-lg gap-2 data-[state=active]:shadow-sm px-4 py-2">
            {TAB_ICONS.insights} Insights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profiles" className="mt-6">
          <ProfilesTab sessionId={sessionId} />
        </TabsContent>
        <TabsContent value="questions" className="mt-6">
          <QuestionsTab sessionId={sessionId} />
        </TabsContent>
        <TabsContent value="run" className="mt-6">
          <RunTab session={session} onStatusChange={loadSession} />
        </TabsContent>
        <TabsContent value="insights" className="mt-6">
          <InsightsTab session={session} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
