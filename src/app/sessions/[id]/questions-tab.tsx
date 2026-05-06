"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Question = {
  id: string;
  text: string;
  sort_order: number;
};

function extractQuestionsFromMarkdown(content: string): string[] {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  const questions: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Lines ending with ?
    if (line.endsWith("?")) {
      // Strip markdown prefixes: #, -, *, >, numbered lists
      const cleaned = line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[-*>]\s+/, "")
        .replace(/^\d+[.)]\s+/, "")
        .replace(/^\*\*(.+)\*\*$/, "$1")
        .replace(/^__(.+)__$/, "$1")
        .trim();
      if (cleaned.length > 5) {
        questions.push(cleaned);
      }
    }
  }

  // If no ? lines found, try numbered list items (common in roteiros)
  if (questions.length === 0) {
    for (const line of lines) {
      const match = line.match(/^\d+[.)]\s+(.{10,})/);
      if (match) {
        const cleaned = match[1]
          .replace(/^\*\*(.+)\*\*$/, "$1")
          .replace(/^__(.+)__$/, "$1")
          .trim();
        questions.push(cleaned);
      }
    }
  }

  // Deduplicate
  return [...new Set(questions)];
}

export default function QuestionsTab({ sessionId }: { sessionId: string }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  // Roteiro state
  const [roteiroName, setRoteiroName] = useState<string | null>(null);
  const [roteiroContent, setRoteiroContent] = useState<string | null>(null);
  const [extractedQuestions, setExtractedQuestions] = useState<string[]>([]);
  const [selectedExtracted, setSelectedExtracted] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".md") && !file.name.endsWith(".markdown") && !file.name.endsWith(".txt")) {
      toast.error("Apenas arquivos .md ou .txt");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRoteiroName(file.name);
      setRoteiroContent(text);
      const extracted = extractQuestionsFromMarkdown(text);
      setExtractedQuestions(extracted);
      // Select all by default
      setSelectedExtracted(new Set(extracted.map((_, i) => i)));

      if (extracted.length === 0) {
        toast.warning("Nenhuma pergunta encontrada no arquivo. Tente um arquivo com linhas terminadas em '?' ou listas numeradas.");
      } else {
        toast.success(`${extracted.length} perguntas encontradas`);
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be re-uploaded
    e.target.value = "";
  }

  function toggleExtracted(index: number) {
    const next = new Set(selectedExtracted);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedExtracted(next);
  }

  function toggleAllExtracted() {
    if (selectedExtracted.size === extractedQuestions.length) {
      setSelectedExtracted(new Set());
    } else {
      setSelectedExtracted(new Set(extractedQuestions.map((_, i) => i)));
    }
  }

  async function importSelected() {
    const toImport = extractedQuestions.filter((_, i) => selectedExtracted.has(i));
    if (toImport.length === 0) { toast.error("Selecione pelo menos uma pergunta"); return; }

    setImporting(true);
    let startOrder = questions.length;

    for (let i = 0; i < toImport.length; i += 50) {
      const batch = toImport.slice(i, i + 50).map((text, j) => ({
        session_id: sessionId,
        text,
        sort_order: startOrder + i + j,
      }));
      const { error } = await supabase.from("questions").insert(batch);
      if (error) { toast.error("Erro ao importar"); break; }
    }

    toast.success(`${toImport.length} perguntas importadas`);
    clearRoteiro();
    await loadQuestions();
    setImporting(false);
  }

  function clearRoteiro() {
    setRoteiroName(null);
    setRoteiroContent(null);
    setExtractedQuestions([]);
    setSelectedExtracted(new Set());
  }

  if (loading) return (
    <div className="animate-pulse space-y-4">
      <div className="h-32 bg-muted rounded-xl" />
      <div className="h-20 bg-muted rounded-xl" />
    </div>
  );

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Upload Roteiro */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <h3 className="font-semibold text-sm">Importar Roteiro</h3>
          </div>
          {roteiroName && (
            <button
              onClick={clearRoteiro}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Remover roteiro
            </button>
          )}
        </div>
        <div className="p-6">
          {!roteiroName ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-border/60 hover:border-primary/40 bg-muted/20 hover:bg-primary/5 transition-all py-10 text-center group"
              >
                <div className="w-12 h-12 rounded-xl gradient-bg-subtle mx-auto mb-3 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary/60">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <p className="text-sm font-medium mb-1">Carregar roteiro .md</p>
                <p className="text-xs text-muted-foreground">
                  O sistema identifica perguntas automaticamente (linhas com ? ou listas numeradas)
                </p>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* File info */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{roteiroName}</p>
                  <p className="text-xs text-muted-foreground">
                    {roteiroContent?.split("\n").length} linhas
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {extractedQuestions.length} perguntas
                </Badge>
              </div>

              {/* Extracted questions */}
              {extractedQuestions.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-medium text-muted-foreground">
                      Perguntas encontradas
                    </label>
                    <button
                      onClick={toggleAllExtracted}
                      className="text-xs text-primary hover:underline"
                    >
                      {selectedExtracted.size === extractedQuestions.length ? "Desmarcar todas" : "Selecionar todas"}
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {extractedQuestions.map((q, i) => (
                      <label
                        key={i}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedExtracted.has(i)
                            ? "border-primary/30 bg-primary/5"
                            : "border-border/50 hover:bg-muted/20"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedExtracted.has(i)}
                          onChange={() => toggleExtracted(i)}
                          className="mt-0.5 rounded border-border accent-primary"
                        />
                        <span className="text-sm leading-relaxed">{q}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <Button
                      onClick={importSelected}
                      disabled={importing || selectedExtracted.size === 0}
                      className="gradient-bg border-0 shadow-md shadow-primary/20"
                    >
                      {importing ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                          Importando...
                        </span>
                      ) : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-1.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Importar {selectedExtracted.size} {selectedExtracted.size === 1 ? "pergunta" : "perguntas"}
                        </>
                      )}
                    </Button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Trocar arquivo
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".md,.markdown,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                </div>
              )}

              {extractedQuestions.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground mb-2">
                    Nenhuma pergunta identificada automaticamente.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    O sistema busca linhas terminadas em <code className="px-1 py-0.5 rounded bg-muted text-[11px]">?</code> ou listas numeradas <code className="px-1 py-0.5 rounded bg-muted text-[11px]">1. 2. 3.</code>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Manual question */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/30">
          <h3 className="font-semibold text-sm">Pergunta Manual</h3>
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

      {/* Question list */}
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
