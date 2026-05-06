"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Dimension = {
  id: string;
  dimension_type: string;
  value: string;
  label_pt: string | null;
};

const DIMENSION_TYPES = [
  {
    value: "role", label: "Cargo",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>,
    color: "from-indigo-500/10 to-indigo-500/5 border-indigo-200/50",
    textColor: "text-indigo-600",
  },
  {
    value: "industry", label: "Industria",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
    color: "from-violet-500/10 to-violet-500/5 border-violet-200/50",
    textColor: "text-violet-600",
  },
  {
    value: "company_size", label: "Porte",
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
    color: "from-purple-500/10 to-purple-500/5 border-purple-200/50",
    textColor: "text-purple-600",
  },
];

export default function DimensionsPage() {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [newType, setNewType] = useState("role");
  const [newValue, setNewValue] = useState("");
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => { loadDimensions(); }, []);

  async function loadDimensions() {
    const { data } = await supabase.from("profile_dimensions").select("*").order("dimension_type").order("label_pt");
    if (data) setDimensions(data);
    setLoading(false);
  }

  async function addDimension() {
    if (!newValue.trim()) { toast.error("Valor e obrigatorio"); return; }
    const { error } = await supabase.from("profile_dimensions").insert({
      dimension_type: newType,
      value: newValue.trim().toLowerCase().replace(/\s+/g, "_"),
      label_pt: newLabel.trim() || newValue.trim(),
    });
    if (error) { toast.error(error.code === "23505" ? "Essa dimensao ja existe" : "Erro ao adicionar"); return; }
    setNewValue(""); setNewLabel("");
    toast.success("Dimensao adicionada");
    loadDimensions();
  }

  async function removeDimension(id: string) {
    await supabase.from("profile_dimensions").delete().eq("id", id);
    toast.success("Removido");
    loadDimensions();
  }

  const grouped = DIMENSION_TYPES.map((t) => ({
    ...t,
    items: dimensions.filter((d) => d.dimension_type === t.value),
  }));

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Dimensoes de Perfil</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Defina os valores para cargo, industria e porte. Usados para gerar agentes nas sessoes.
        </p>
      </div>

      {/* Add form */}
      <div className="rounded-xl border bg-card overflow-hidden mb-8">
        <div className="px-6 py-4 border-b bg-muted/30">
          <h3 className="font-semibold text-sm">Adicionar Dimensao</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-[160px_1fr_1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={newType} onValueChange={(v) => v && setNewType(v)}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIMENSION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Valor (slug)</Label>
              <Input placeholder="ex: cfo" value={newValue} onChange={(e) => setNewValue(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Label</Label>
              <Input placeholder="ex: CFO" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="h-10" />
            </div>
            <Button onClick={addDimension} className="gradient-bg border-0 shadow-md shadow-primary/20 h-10">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-1.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Adicionar
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.value} className={`rounded-xl border bg-gradient-to-br ${group.color} overflow-hidden`}>
              <div className="px-6 py-4 flex items-center gap-3">
                <div className={group.textColor}>{group.icon}</div>
                <div>
                  <h3 className="font-semibold text-sm">{group.label}</h3>
                  <p className="text-xs text-muted-foreground">
                    {group.items.length} {group.items.length === 1 ? "valor" : "valores"}
                  </p>
                </div>
              </div>
              <div className="px-6 pb-5">
                {group.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Nenhum valor definido</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => removeDimension(item.id)}
                        className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/80 border border-border/50 text-xs font-medium hover:border-destructive/50 hover:bg-destructive/5 hover:text-destructive transition-all"
                        title="Clique para remover"
                      >
                        {item.label_pt || item.value}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-40 group-hover:opacity-100 transition-opacity">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
