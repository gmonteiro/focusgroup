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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const MODELS = [
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (rapido, barato)" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 (equilibrado)" },
  { value: "claude-opus-4-6", label: "Opus 4.6 (mais capaz)" },
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
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Nova Sessao</h1>
      <Card>
        <CardHeader>
          <CardTitle>Configuracao</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Focus Group - CFOs sobre automacao financeira"
              />
            </div>

            <div>
              <Label htmlFor="description">Descricao (opcional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Objetivo e contexto do focus group"
                rows={3}
              />
            </div>

            <div>
              <Label>Modelo</Label>
              <Select value={model} onValueChange={(v) => v && setModel(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="concurrency">
                Concorrencia (agentes simultaneos)
              </Label>
              <Input
                id="concurrency"
                type="number"
                min={1}
                max={100}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Quantos agentes rodam em paralelo. Mais = mais rapido, mas pode
                atingir rate limits.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Criando..." : "Criar Sessao"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/")}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
