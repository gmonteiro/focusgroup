"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Question = {
  id: string;
  text: string;
  sort_order: number;
};

export default function QuestionsTab({ sessionId }: { sessionId: string }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => { loadQuestions(); }, []);

  async function loadQuestions() {
    const { data } = await supabase.from("questions").select("*").eq("session_id", sessionId).order("sort_order");
    if (data) setQuestions(data);
    setLoading(false);
  }

  async function addQuestion() {
    if (!newQuestion.trim()) return;
    const { error } = await supabase.from("questions").insert({ session_id: sessionId, text: newQuestion.trim(), sort_order: questions.length });
    if (error) { toast.error("Erro ao adicionar pergunta"); return; }
    setNewQuestion("");
    toast.success("Pergunta adicionada");
    loadQuestions();
  }

  async function updateQuestion(id: string) {
    if (!editText.trim()) return;
    await supabase.from("questions").update({ text: editText.trim() }).eq("id", id);
    setEditingId(null);
    toast.success("Pergunta atualizada");
    loadQuestions();
  }

  async function removeQuestion(id: string) {
    await supabase.from("questions").delete().eq("id", id);
    toast.success("Pergunta removida");
    loadQuestions();
  }

  async function moveQuestion(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;
    const updates = [
      { id: questions[index].id, sort_order: targetIndex },
      { id: questions[targetIndex].id, sort_order: index },
    ];
    for (const u of updates) await supabase.from("questions").update({ sort_order: u.sort_order }).eq("id", u.id);
    loadQuestions();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      addQuestion();
    }
  }

  if (loading) return (
    <div className="animate-pulse space-y-4">
      <div className="h-32 bg-muted rounded-xl" />
      <div className="h-20 bg-muted rounded-xl" />
    </div>
  );

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/30">
          <h3 className="font-semibold text-sm">Nova Pergunta</h3>
        </div>
        <div className="p-6">
          <Textarea
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua pergunta para o focus group..."
            rows={3}
            className="resize-none mb-3"
          />
          <div className="flex items-center justify-between">
            <Button
              onClick={addQuestion}
              disabled={!newQuestion.trim()}
              className="gradient-bg border-0 shadow-md shadow-primary/20"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Adicionar
            </Button>
            <span className="text-xs text-muted-foreground">
              Ctrl+Enter para adicionar
            </span>
          </div>
        </div>
      </div>

      {questions.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/30">
            <h3 className="font-semibold text-sm">
              Perguntas
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {questions.length} {questions.length === 1 ? "pergunta" : "perguntas"}
              </span>
            </h3>
          </div>
          <div className="divide-y divide-border/50">
            {questions.map((q, i) => (
              <div key={q.id} className="flex gap-3 items-start px-6 py-4 hover:bg-muted/20 transition-colors group">
                <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  {editingId === q.id ? (
                    <div className="space-y-2">
                      <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} className="resize-none" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => updateQuestion(q.id)} className="gradient-bg border-0">Salvar</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed">{q.text}</p>
                  )}
                </div>
                {editingId !== q.id && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => moveQuestion(i, "up")} disabled={i === 0}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15" /></svg>
                    </button>
                    <button onClick={() => moveQuestion(i, "down")} disabled={i === questions.length - 1}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                    <button onClick={() => { setEditingId(q.id); setEditText(q.text); }}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                    <button onClick={() => removeQuestion(q.id)}
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
