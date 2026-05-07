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

type GlobalContent = {
  executive_summary?: string;
  key_findings?: { emoji?: string; title: string; detail: string; priority?: string }[];
  opportunities?: { title: string; detail: string; segments?: string }[];
  risks?: { title: string; detail: string }[];
  recommendation?: string;
};

const COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#f97316"];
const PRIORITY_COLORS: Record<string, string> = { high: "bg-red-100 text-red-700 border-red-200", medium: "bg-amber-100 text-amber-700 border-amber-200", low: "bg-muted text-muted-foreground border-border" };

export default function InsightsTab({ session }: { session: Session }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<string>("all");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState("");
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasNoResponses, setHasNoResponses] = useState(true);

  useEffect(() => {
    Promise.all([loadQuestions(), loadInsights(), checkResponses()]).then(() => setLoading(false));
  }, []);

  async function loadQuestions() {
    const { data } = await supabase.from("questions").select("*").eq("session_id", session.id).order("sort_order");
    if (data) setQuestions(data);
  }

  async function checkResponses() {
    const { count } = await supabase.from("responses").select("id", { count: "exact", head: true }).eq("session_id", session.id).eq("status", "completed");
    setHasNoResponses((count ?? 0) === 0);
  }

  async function loadInsights() {
    const { data } = await supabase.from("insights").select("*").eq("session_id", session.id).order("created_at");
    if (data) setInsights(data);
  }

  async function runAnalysis() {
    setAnalyzing(true);
    setAnalyzeProgress("");

    if (selectedQuestion !== "all") {
      setAnalyzeProgress("Analisando pergunta...");
      try {
        const res = await fetch(`/api/sessions/${session.id}/analyze`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question_id: selectedQuestion, mode: "question" }),
        });
        if (!res.ok) { const body = await res.json(); toast.error(body.error || "Erro"); }
        else toast.success("Analise concluida");
      } catch { toast.error("Erro de rede"); }
      await loadInsights();
      setAnalyzing(false);
      setAnalyzeProgress("");
      return;
    }

    // All questions
    try {
      setAnalyzeProgress("Carregando perguntas...");
      const listRes = await fetch(`/api/sessions/${session.id}/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "list" }),
      });
      if (!listRes.ok) { toast.error("Erro"); setAnalyzing(false); setAnalyzeProgress(""); return; }
      const { questions: questionList } = await listRes.json();

      for (let i = 0; i < questionList.length; i++) {
        const q = questionList[i];
        setAnalyzeProgress(`Pergunta ${i + 1}/${questionList.length}: "${q.text.slice(0, 40)}..."`);
        try {
          await fetch(`/api/sessions/${session.id}/analyze`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question_id: q.id, mode: "question" }),
          });
        } catch { toast.error(`Erro na pergunta ${i + 1}`); }
        await loadInsights();
      }

      // Generate global analysis
      setAnalyzeProgress("Gerando analise global...");
      try {
        await fetch(`/api/sessions/${session.id}/analyze`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "global" }),
        });
      } catch { toast.error("Erro na analise global"); }

      await loadInsights();
      toast.success("Analise completa");
    } catch { toast.error("Erro de rede"); }

    setAnalyzing(false);
    setAnalyzeProgress("");
  }

  async function runGlobalOnly() {
    setAnalyzing(true);
    setAnalyzeProgress("Gerando analise global...");
    try {
      const res = await fetch(`/api/sessions/${session.id}/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "global" }),
      });
      if (!res.ok) { const body = await res.json(); toast.error(body.error || "Erro"); }
      else toast.success("Analise global concluida");
    } catch { toast.error("Erro de rede"); }
    await loadInsights();
    setAnalyzing(false);
    setAnalyzeProgress("");
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

  // Filter insights
  const globalInsight = insights.find((i) => i.insight_type === "global" && !i.question_id);
  const filteredInsights = selectedQuestion === "all"
    ? insights.filter((i) => i.insight_type !== "global")
    : insights.filter((i) => i.question_id === selectedQuestion);

  const summaryInsights = filteredInsights.filter((i) => i.insight_type === "summary");
  const themeInsights = filteredInsights.filter((i) => i.insight_type === "themes");
  const divergenceInsights = filteredInsights.filter((i) => i.insight_type === "divergences");
  const chartInsights = filteredInsights.filter((i) => i.insight_type === "chart_data");

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-20 bg-muted rounded-xl" /><div className="h-40 bg-muted rounded-xl" /></div>;

  const globalData = globalInsight?.content as GlobalContent | undefined;

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
            <Button onClick={runAnalysis} disabled={analyzing || hasNoResponses} className="gradient-bg border-0 shadow-md shadow-primary/20">
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
            {summaryInsights.length > 0 && !analyzing && (
              <Button onClick={runGlobalOnly} variant="outline" disabled={analyzing}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                Gerar Analise Global
              </Button>
            )}
            <Button variant="outline" onClick={exportData} disabled={exporting}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              {exporting ? "Exportando..." : "Exportar"}
            </Button>
          </div>
          {hasNoResponses && (
            <p className="text-xs text-amber-600 mt-3 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              Execute o focus group primeiro para gerar insights.
            </p>
          )}
          {analyzeProgress && (
            <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-primary/5 border border-primary/10 text-sm">
              <svg className="animate-spin h-4 w-4 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              <span className="text-primary font-medium">{analyzeProgress}</span>
            </div>
          )}
        </div>
      </div>

      {/* === GLOBAL EXECUTIVE ANALYSIS === */}
      {globalData && selectedQuestion === "all" && (
        <div className="rounded-xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
          <div className="px-6 py-4 border-b border-primary/10 flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
            <h3 className="font-bold text-sm">Analise Executiva Global</h3>
          </div>
          <div className="p-6 space-y-6">
            {/* Executive Summary */}
            {globalData.executive_summary && (
              <div className="p-4 rounded-lg bg-white/60 border border-primary/10">
                <p className="text-sm font-medium leading-relaxed">{globalData.executive_summary}</p>
              </div>
            )}

            {/* Key Findings */}
            {globalData.key_findings && globalData.key_findings.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Principais Achados</h4>
                <div className="space-y-2">
                  {globalData.key_findings.map((f, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/60 border border-border/50">
                      <Badge variant="outline" className={`text-[10px] shrink-0 mt-0.5 ${PRIORITY_COLORS[f.priority || "medium"]}`}>
                        {f.priority === "high" ? "ALTO" : f.priority === "low" ? "BAIXO" : "MEDIO"}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium">{f.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{f.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Opportunities */}
            {globalData.opportunities && globalData.opportunities.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  Oportunidades
                </h4>
                <div className="space-y-2">
                  {globalData.opportunities.map((o, i) => (
                    <div key={i} className="p-3 rounded-lg bg-emerald-50/50 border border-emerald-100">
                      <p className="text-sm font-medium text-emerald-800">{o.title}</p>
                      <p className="text-xs text-emerald-700/70 mt-0.5">{o.detail}</p>
                      {o.segments && (
                        <p className="text-[11px] text-emerald-600/60 mt-1 flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                          {o.segments}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risks */}
            {globalData.risks && globalData.risks.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  Riscos e Barreiras
                </h4>
                <div className="space-y-2">
                  {globalData.risks.map((r, i) => (
                    <div key={i} className="p-3 rounded-lg bg-red-50/50 border border-red-100">
                      <p className="text-sm font-medium text-red-800">{r.title}</p>
                      <p className="text-xs text-red-700/70 mt-0.5">{r.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendation */}
            {globalData.recommendation && (
              <div className="p-4 rounded-lg gradient-bg text-white">
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-80">Recomendacao</h4>
                <p className="text-sm font-medium">{globalData.recommendation}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* === PER-QUESTION INSIGHTS === */}
      {summaryInsights.map((insight) => {
        const content = insight.content as { headline?: string; text?: string; bullets?: string[] };
        return (
          <div key={insight.id} className="rounded-xl border bg-card overflow-hidden">
            <div className="px-6 py-4 border-b bg-muted/30 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
              <h3 className="font-semibold text-sm">Resumo</h3>
              {insight.question_id && (
                <Badge variant="outline" className="text-[10px]">
                  Pergunta {(questions.findIndex((q) => q.id === insight.question_id) ?? 0) + 1}
                </Badge>
              )}
            </div>
            <div className="p-6">
              {content.headline && (
                <p className="text-sm font-semibold mb-3">{content.headline}</p>
              )}
              {content.bullets && content.bullets.length > 0 ? (
                <ul className="space-y-2">
                  {content.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                      <span className="text-foreground/85 leading-relaxed">{b}</span>
                    </li>
                  ))}
                </ul>
              ) : content.text ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">{content.text}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{JSON.stringify(content)}</p>
              )}
            </div>
          </div>
        );
      })}

      {/* Themes */}
      {themeInsights.map((insight) => {
        const themes = (insight.content as { themes?: { name: string; count: number; description: string }[] }).themes || [];
        return (
          <div key={insight.id} className="rounded-xl border bg-card overflow-hidden">
            <div className="px-6 py-4 border-b bg-muted/30 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
              <h3 className="font-semibold text-sm">Temas Principais</h3>
              {insight.question_id && <Badge variant="outline" className="text-[10px]">P{(questions.findIndex((q) => q.id === insight.question_id) ?? 0) + 1}</Badge>}
            </div>
            <div className="p-6">
              {themes.length > 0 && (
                <div className="mb-4 rounded-lg bg-muted/20 p-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={themes}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 265)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ borderRadius: 8 }} />
                      <Bar dataKey="count" fill="oklch(0.45 0.18 265)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="space-y-1.5">
                {themes.map((t, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/20 transition-colors">
                    <Badge className="gradient-bg border-0 text-[10px] shrink-0 mt-0.5">{t.count}</Badge>
                    <div>
                      <span className="text-sm font-medium">{t.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{t.description}</span>
                    </div>
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
              <h3 className="font-semibold text-sm">Divergencias</h3>
              {insight.question_id && <Badge variant="outline" className="text-[10px]">P{(questions.findIndex((q) => q.id === insight.question_id) ?? 0) + 1}</Badge>}
            </div>
            <div className="p-6 space-y-2">
              {divergences.map((d, i) => (
                <div key={i} className="flex items-start gap-2 p-3 rounded-lg border bg-muted/10">
                  <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">{d.dimension}</Badge>
                  <div className="text-sm">
                    <span className="font-medium text-primary">{d.group_a}</span>
                    <span className="text-muted-foreground mx-1">vs</span>
                    <span className="font-medium text-chart-4">{d.group_b}</span>
                    <span className="text-muted-foreground ml-1">— {d.description}</span>
                  </div>
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
            <div className="px-6 py-4 border-b bg-muted/30 flex items-center gap-2">
              <h3 className="font-semibold text-sm">{chartData.title || "Distribuicao"}</h3>
              {insight.question_id && <Badge variant="outline" className="text-[10px]">P{(questions.findIndex((q) => q.id === insight.question_id) ?? 0) + 1}</Badge>}
            </div>
            <div className="p-6">
              <div className="rounded-lg bg-muted/20 p-4">
                <ResponsiveContainer width="100%" height={250}>
                  {chartData.chart_type === "pie" ? (
                    <PieChart>
                      <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={3} label>
                        {data.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8 }} />
                      <Legend />
                    </PieChart>
                  ) : (
                    <BarChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 265)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
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
