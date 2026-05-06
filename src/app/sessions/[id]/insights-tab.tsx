"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

type Session = { id: string; model: string; status: string };
type Question = { id: string; text: string; sort_order: number };
type Insight = { id: string; question_id: string | null; insight_type: string; content: Record<string, unknown> };

const COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#f97316"];

export default function InsightsTab({ session }: { session: Session }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<string>("all");
  const [analyzing, setAnalyzing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([loadQuestions(), loadInsights()]).then(() => setLoading(false));
  }, []);

  async function loadQuestions() {
    const { data } = await supabase.from("questions").select("*").eq("session_id", session.id).order("sort_order");
    if (data) setQuestions(data);
  }

  async function loadInsights() {
    const { data } = await supabase.from("insights").select("*").eq("session_id", session.id).order("created_at");
    if (data) setInsights(data);
  }

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: selectedQuestion === "all" ? null : selectedQuestion }),
      });
      if (!res.ok) { const body = await res.json(); toast.error(body.error || "Erro na analise"); setAnalyzing(false); return; }
      toast.success("Analise concluida");
      await loadInsights();
    } catch { toast.error("Erro de rede"); }
    setAnalyzing(false);
  }

  async function exportData() {
    setExporting(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/export`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `focusgroup-${session.id}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Exportado");
    } catch { toast.error("Erro ao exportar"); }
    setExporting(false);
  }

  const filteredInsights = selectedQuestion === "all" ? insights : insights.filter((i) => i.question_id === selectedQuestion || i.question_id === null);
  const summaryInsights = filteredInsights.filter((i) => i.insight_type === "summary");
  const themeInsights = filteredInsights.filter((i) => i.insight_type === "themes");
  const divergenceInsights = filteredInsights.filter((i) => i.insight_type === "divergences");
  const chartInsights = filteredInsights.filter((i) => i.insight_type === "chart_data");

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-20 bg-muted rounded-xl" /><div className="h-40 bg-muted rounded-xl" /></div>;

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Controls */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/30">
          <h3 className="font-semibold text-sm">Analise de Insights</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gere resumos, temas e divergencias a partir das respostas
          </p>
        </div>
        <div className="p-6">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="w-80">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Pergunta</label>
              <Select value={selectedQuestion} onValueChange={(v) => setSelectedQuestion(v ?? "all")}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as perguntas</SelectItem>
                  {questions.map((q) => (
                    <SelectItem key={q.id} value={q.id}>{q.sort_order + 1}. {q.text.slice(0, 50)}...</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={runAnalysis} disabled={analyzing || session.status !== "completed"} className="gradient-bg border-0 shadow-md shadow-primary/20">
              {analyzing ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  Analisando...
                </span>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5"><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></svg>
                  Gerar Insights
                </>
              )}
            </Button>
            <Button variant="outline" onClick={exportData} disabled={exporting}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              {exporting ? "Exportando..." : "Exportar"}
            </Button>
          </div>
          {session.status !== "completed" && (
            <p className="text-xs text-amber-600 mt-3 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              Execute o focus group primeiro para gerar insights.
            </p>
          )}
        </div>
      </div>

      {/* Summary */}
      {summaryInsights.map((insight) => (
        <div key={insight.id} className="rounded-xl border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/30 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            <h3 className="font-semibold text-sm">Resumo</h3>
            {insight.question_id && (
              <Badge variant="outline" className="text-[10px]">
                Pergunta {(questions.findIndex((q) => q.id === insight.question_id) ?? 0) + 1}
              </Badge>
            )}
          </div>
          <div className="p-6">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {(insight.content as { text?: string }).text || JSON.stringify(insight.content)}
            </p>
          </div>
        </div>
      ))}

      {/* Themes */}
      {themeInsights.map((insight) => {
        const themes = (insight.content as { themes?: { name: string; count: number; description: string }[] }).themes || [];
        return (
          <div key={insight.id} className="rounded-xl border bg-card overflow-hidden">
            <div className="px-6 py-4 border-b bg-muted/30 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
              <h3 className="font-semibold text-sm">Temas Principais</h3>
            </div>
            <div className="p-6">
              {themes.length > 0 && (
                <div className="mb-6 rounded-lg bg-muted/20 p-4">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={themes}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 265)" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.01 265)" }} />
                      <Bar dataKey="count" fill="oklch(0.45 0.18 265)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="space-y-2">
                {themes.map((t, i) => (
                  <div key={i} className="p-3 rounded-lg border hover:bg-muted/20 transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="gradient-bg border-0 text-[11px]">{t.name}</Badge>
                      <span className="text-xs text-muted-foreground">{t.count} mencoes</span>
                    </div>
                    <p className="text-sm text-foreground/80">{t.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {/* Divergences */}
      {divergenceInsights.map((insight) => {
        const divergences = (insight.content as { divergences?: { dimension: string; group_a: string; group_b: string; description: string }[] }).divergences || [];
        return (
          <div key={insight.id} className="rounded-xl border bg-card overflow-hidden">
            <div className="px-6 py-4 border-b bg-muted/30 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary"><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><path d="M11 18H8a2 2 0 0 1-2-2V9" /></svg>
              <h3 className="font-semibold text-sm">Divergencias por Dimensao</h3>
            </div>
            <div className="p-6 space-y-3">
              {divergences.map((d, i) => (
                <div key={i} className="p-4 rounded-lg border bg-muted/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-[11px] font-medium">{d.dimension}</Badge>
                    <span className="text-sm font-medium text-primary">{d.group_a}</span>
                    <span className="text-xs text-muted-foreground">vs</span>
                    <span className="text-sm font-medium text-chart-4">{d.group_b}</span>
                  </div>
                  <p className="text-sm text-foreground/80">{d.description}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Charts */}
      {chartInsights.map((insight) => {
        const chartData = insight.content as { chart_type?: string; data?: { name: string; value: number }[]; title?: string };
        const data = chartData.data || [];
        return (
          <div key={insight.id} className="rounded-xl border bg-card overflow-hidden">
            <div className="px-6 py-4 border-b bg-muted/30">
              <h3 className="font-semibold text-sm">{chartData.title || "Distribuicao"}</h3>
            </div>
            <div className="p-6">
              <div className="rounded-lg bg-muted/20 p-4">
                <ResponsiveContainer width="100%" height={300}>
                  {chartData.chart_type === "pie" ? (
                    <PieChart>
                      <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} innerRadius={60} paddingAngle={3} label>
                        {data.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8 }} />
                      <Legend />
                    </PieChart>
                  ) : (
                    <BarChart data={data} >
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 265)" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ borderRadius: 8 }} />
                      <Bar dataKey="value" fill="oklch(0.45 0.18 265)" />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );
      })}

      {insights.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-border/60 bg-card/50 py-12 text-center">
          <div className="w-12 h-12 rounded-xl gradient-bg-subtle mx-auto mb-3 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary/50">
              <path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">Nenhum insight gerado. Execute a analise acima.</p>
        </div>
      )}
    </div>
  );
}
