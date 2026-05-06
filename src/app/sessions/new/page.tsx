"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const MODELS = [
  {
    value: "claude-haiku-4-5-20251001",
    label: "Haiku 4.5",
    desc: "Rapido e economico",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    value: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    desc: "Equilibrado",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
    ),
  },
  {
    value: "claude-opus-4-6",
    label: "Opus 4.6",
    desc: "Mais capaz",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
];

export default function NewSessionPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("claude-haiku-4-5-20251001");
  const [concurrency, setConcurrency] = useState(20);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Nome e obrigatorio");
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        name: name.trim(),
        description: description.trim() || null,
        model,
        concurrency,
      })
      .select("id")
      .single();

    if (error) {
      toast.error("Erro ao criar sessao");
      setSaving(false);
      return;
    }

    toast.success("Sessao criada");
    router.push(`/sessions/${data.id}`);
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 animate-fade-in">
      <button
        onClick={() => router.push("/")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Voltar
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Nova Sessao</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure os parametros do seu focus group virtual.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="rounded-xl border bg-card p-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              Nome da sessao
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: CFOs sobre automacao financeira"
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium">
              Descricao
              <span className="text-muted-foreground font-normal ml-1">(opcional)</span>
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Objetivo e contexto do focus group..."
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6 space-y-5">
          <div>
            <Label className="text-sm font-medium mb-3 block">Modelo AI</Label>
            <div className="grid grid-cols-3 gap-3">
              {MODELS.map((m) => (
                <button
                  type="button"
                  key={m.value}
                  onClick={() => setModel(m.value)}
                  className={`relative rounded-lg border-2 p-4 text-left transition-all hover:border-primary/40 ${
                    model === m.value
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:bg-accent/50"
                  }`}
                >
                  <div className={`mb-2 ${model === m.value ? "text-primary" : "text-muted-foreground"}`}>
                    {m.icon}
                  </div>
                  <div className="font-medium text-sm">{m.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{m.desc}</div>
                  {model === m.value && (
                    <div className="absolute top-3 right-3">
                      <div className="w-5 h-5 rounded-full gradient-bg flex items-center justify-center">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="concurrency" className="text-sm font-medium">
              Concorrencia
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id="concurrency"
                type="number"
                min={1}
                max={100}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                className="w-24 h-11"
              />
              <span className="text-sm text-muted-foreground">
                agentes simultaneos
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Mais concorrencia = mais rapido, mas pode atingir rate limits da API.
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            type="submit"
            disabled={saving || !name.trim()}
            size="lg"
            className="gradient-bg border-0 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all px-8"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Criando...
              </span>
            ) : (
              "Criar Sessao"
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() => router.push("/")}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
