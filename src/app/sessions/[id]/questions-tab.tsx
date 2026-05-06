"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  useEffect(() => {
    loadQuestions();
  }, []);

  async function loadQuestions() {
    const { data } = await supabase
      .from("questions")
      .select("*")
      .eq("session_id", sessionId)
      .order("sort_order");
    if (data) setQuestions(data);
    setLoading(false);
  }

  async function addQuestion() {
    if (!newQuestion.trim()) return;

    const { error } = await supabase.from("questions").insert({
      session_id: sessionId,
      text: newQuestion.trim(),
      sort_order: questions.length,
    });

    if (error) {
      toast.error("Erro ao adicionar pergunta");
      return;
    }

    setNewQuestion("");
    toast.success("Pergunta adicionada");
    loadQuestions();
  }

  async function updateQuestion(id: string) {
    if (!editText.trim()) return;

    await supabase
      .from("questions")
      .update({ text: editText.trim() })
      .eq("id", id);

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

    for (const u of updates) {
      await supabase
        .from("questions")
        .update({ sort_order: u.sort_order })
        .eq("id", u.id);
    }

    loadQuestions();
  }

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar Pergunta</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Textarea
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="Digite sua pergunta para o focus group..."
              rows={3}
            />
            <Button onClick={addQuestion} disabled={!newQuestion.trim()}>
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Perguntas ({questions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <div
                  key={q.id}
                  className="flex gap-2 items-start p-3 rounded border"
                >
                  <span className="text-muted-foreground text-sm font-mono min-w-[2rem]">
                    {i + 1}.
                  </span>
                  <div className="flex-1">
                    {editingId === q.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => updateQuestion(q.id)}
                          >
                            Salvar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingId(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm">{q.text}</p>
                    )}
                  </div>
                  {editingId !== q.id && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveQuestion(i, "up")}
                        disabled={i === 0}
                      >
                        ↑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveQuestion(i, "down")}
                        disabled={i === questions.length - 1}
                      >
                        ↓
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(q.id);
                          setEditText(q.text);
                        }}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => removeQuestion(q.id)}
                      >
                        Remover
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
