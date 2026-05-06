"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { format } from "date-fns";

type Session = {
  id: string;
  name: string;
  description: string | null;
  model: string;
  status: string;
  created_at: string;
  profile_count?: number;
  question_count?: number;
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

export default function HomePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    const { data } = await supabase
      .from("sessions")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      const enriched = await Promise.all(
        data.map(async (s) => {
          const [profiles, questions] = await Promise.all([
            supabase
              .from("agent_profiles")
              .select("id", { count: "exact", head: true })
              .eq("session_id", s.id),
            supabase
              .from("questions")
              .select("id", { count: "exact", head: true })
              .eq("session_id", s.id),
          ]);
          return {
            ...s,
            profile_count: profiles.count ?? 0,
            question_count: questions.count ?? 0,
          };
        })
      );
      setSessions(enriched);
    }
    setLoading(false);
  }

  return (
    <div>
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-bg opacity-[0.03]" />
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-primary/5 blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full bg-chart-4/5 blur-3xl translate-y-1/2 -translate-x-1/3" />
        <div className="max-w-7xl mx-auto px-6 py-12 relative">
          <div className="flex items-end justify-between">
            <div className="animate-fade-in">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                Powered by Claude AI
              </div>
              <h1 className="text-3xl font-bold tracking-tight">
                Focus Groups Virtuais
              </h1>
              <p className="text-muted-foreground mt-2 max-w-lg">
                Crie agentes AI com perfis distintos, colete respostas em escala
                e extraia insights com inteligencia artificial.
              </p>
            </div>
            <Link href="/sessions/new">
              <Button size="lg" className="gradient-bg border-0 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all hover:-translate-y-0.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Nova Sessao
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 pb-12">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border bg-card p-6 animate-pulse">
                <div className="h-4 bg-muted rounded w-2/3 mb-3" />
                <div className="h-3 bg-muted rounded w-full mb-2" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="mt-2 animate-slide-up">
            <div className="rounded-2xl border-2 border-dashed border-border/60 bg-card/50 py-16 text-center">
              <div className="w-16 h-16 rounded-2xl gradient-bg-subtle mx-auto mb-4 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary/60">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-1">Nenhuma sessao criada</h3>
              <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
                Comece criando sua primeira sessao de focus group com agentes AI.
              </p>
              <Link href="/sessions/new">
                <Button className="gradient-bg border-0 shadow-md shadow-primary/20">
                  Criar primeira sessao
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-2">
            {sessions.map((session, i) => {
              const sc = statusConfig[session.status] || statusConfig.draft;
              return (
                <Link key={session.id} href={`/sessions/${session.id}`}>
                  <div
                    className="group rounded-xl border bg-card p-5 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20 transition-all duration-300 hover:-translate-y-0.5 cursor-pointer animate-slide-up"
                    style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-[15px] leading-snug group-hover:text-primary transition-colors line-clamp-2 pr-3">
                        {session.name}
                      </h3>
                      <Badge variant="outline" className={`shrink-0 text-[11px] ${sc.class}`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${sc.dot}`} />
                        {sc.label}
                      </Badge>
                    </div>
                    {session.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                        {session.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-3 border-t border-border/50">
                      <div className="flex gap-3">
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          {session.profile_count}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                          {session.question_count}
                        </span>
                        <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-medium">
                          {modelLabel(session.model)}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground/60">
                        {format(new Date(session.created_at), "dd/MM/yy")}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
