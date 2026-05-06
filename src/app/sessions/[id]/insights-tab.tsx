"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

type Session = {
  id: string;
  model: string;
  status: string;
};

type Question = {
  id: string;
  text: string;
  sort_order: number;
};

type Insight = {
  id: string;
  question_id: string | null;
  insight_type: string;
  content: Record<string, unknown>;
};

const COLORS = [
  "#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#0088FE",
  "#00C49F", "#FFBB28", "#FF8042", "#a4de6c", "#d0ed57",
];

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
    const { data } = await supabase
      .from("questions")
      .select("*")
      .eq("session_id", session.id)
      .order("sort_order");
    if (data) setQuestions(data);
  }

  async function loadInsights() {
    const { data } = await supabase
      .from("insights")
      .select("*")
      .eq("session_id", session.id)
      .order("created_at");
    if (data) setInsights(data);
  }

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_id: selectedQuestion === "all" ? null : selectedQuestion,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        toast.error(body.error || "Erro na analise");
        setAnalyzing(false);
        return;
      }

      toast.success("Analise concluida");
      await loadInsights();
    } catch {
      toast.error("Erro de rede");
    }
    setAnalyzing(false);
  }

  async function exportData() {
    setExporting(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/export`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `focusgroup-${session.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exportado");
    } catch {
      toast.error("Erro ao exportar");
    }
    setExporting(false);
  }

  const filteredInsights =
    selectedQuestion === "all"
      ? insights
      : insights.filter(
          (i) =>
            i.question_id === selectedQuestion || i.question_id === null
        );

  const summaryInsights = filteredInsights.filter(
    (i) => i.insight_type === "summary"
  );
  const themeInsights = filteredInsights.filter(
    (i) => i.insight_type === "themes"
  );
  const divergenceInsights = filteredInsights.filter(
    (i) => i.insight_type === "divergences"
  );
  const chartInsights = filteredInsights.filter(
    (i) => i.insight_type === "chart_data"
  );

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Analise</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="w-80">
              <Select value={selectedQuestion} onValueChange={(v) => setSelectedQuestion(v ?? "all")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma pergunta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as perguntas</SelectItem>
                  {questions.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.sort_order + 1}. {q.text.slice(0, 60)}...
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={runAnalysis}
              disabled={analyzing || session.status !== "completed"}
            >
              {analyzing ? "Analisando..." : "Gerar Insights"}
            </Button>
            <Button
              variant="outline"
              onClick={exportData}
              disabled={exporting}
            >
              {exporting ? "Exportando..." : "Exportar JSON"}
            </Button>
          </div>
          {session.status !== "completed" && (
            <p className="text-xs text-muted-foreground mt-2">
              Execute o focus group primeiro para gerar insights.
            </p>
          )}
        </CardContent>
      </Card>

      {summaryInsights.map((insight) => (
        <Card key={insight.id}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Resumo
              {insight.question_id && (
                <Badge variant="outline">
                  Pergunta{" "}
                  {(questions.findIndex((q) => q.id === insight.question_id) ??
                    0) + 1}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <p className="whitespace-pre-wrap">
                {(insight.content as { text?: string }).text || JSON.stringify(insight.content)}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}

      {themeInsights.map((insight) => {
        const themes = (insight.content as { themes?: { name: string; count: number; description: string }[] }).themes || [];
        return (
          <Card key={insight.id}>
            <CardHeader>
              <CardTitle className="text-base">Temas Principais</CardTitle>
            </CardHeader>
            <CardContent>
              {themes.length > 0 && (
                <div className="mb-4">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={themes}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="space-y-2">
                {themes.map((t, i) => (
                  <div key={i} className="p-2 rounded border">
                    <div className="flex items-center gap-2">
                      <Badge>{t.name}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {t.count} mencoes
                      </span>
                    </div>
                    <p className="text-sm mt-1">{t.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {divergenceInsights.map((insight) => {
        const divergences = (insight.content as { divergences?: { dimension: string; group_a: string; group_b: string; description: string }[] }).divergences || [];
        return (
          <Card key={insight.id}>
            <CardHeader>
              <CardTitle className="text-base">
                Divergencias por Dimensao
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {divergences.map((d, i) => (
                  <div key={i} className="p-3 rounded border">
                    <div className="flex gap-2 mb-1">
                      <Badge variant="outline">{d.dimension}</Badge>
                      <span className="text-sm font-medium">
                        {d.group_a} vs {d.group_b}
                      </span>
                    </div>
                    <p className="text-sm">{d.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {chartInsights.map((insight) => {
        const chartData = (insight.content as { chart_type?: string; data?: { name: string; value: number }[]; title?: string });
        const data = chartData.data || [];
        return (
          <Card key={insight.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {chartData.title || "Distribuicao"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                {chartData.chart_type === "pie" ? (
                  <PieChart>
                    <Pie
                      data={data}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label
                    >
                      {data.map((_, i) => (
                        <Cell
                          key={i}
                          fill={COLORS[i % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                ) : (
                  <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#8884d8" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      })}

      {insights.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum insight gerado ainda. Execute a analise acima.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
