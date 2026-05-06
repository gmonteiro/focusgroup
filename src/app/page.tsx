"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  running: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
};

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  running: "Executando",
  completed: "Concluido",
};

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Sessoes de Focus Group</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Crie e gerencie focus groups virtuais com agentes AI
          </p>
        </div>
        <Link href="/sessions/new">
          <Button>Nova Sessao</Button>
        </Link>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              Nenhuma sessao criada ainda
            </p>
            <Link href="/sessions/new">
              <Button>Criar primeira sessao</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => (
            <Link key={session.id} href={`/sessions/${session.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{session.name}</CardTitle>
                    <Badge className={statusColors[session.status]}>
                      {statusLabels[session.status] || session.status}
                    </Badge>
                  </div>
                  {session.description && (
                    <CardDescription className="line-clamp-2">
                      {session.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>{session.profile_count} perfis</span>
                    <span>{session.question_count} perguntas</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {format(new Date(session.created_at), "dd/MM/yyyy HH:mm")}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
