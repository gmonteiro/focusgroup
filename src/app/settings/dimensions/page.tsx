"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Dimension = {
  id: string;
  dimension_type: string;
  value: string;
  label_pt: string | null;
};

const DIMENSION_TYPES = [
  { value: "role", label: "Cargo" },
  { value: "industry", label: "Industria" },
  { value: "company_size", label: "Porte" },
];

export default function DimensionsPage() {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [newType, setNewType] = useState("role");
  const [newValue, setNewValue] = useState("");
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    loadDimensions();
  }, []);

  async function loadDimensions() {
    const { data } = await supabase
      .from("profile_dimensions")
      .select("*")
      .order("dimension_type")
      .order("label_pt");
    if (data) setDimensions(data);
    setLoading(false);
  }

  async function addDimension() {
    if (!newValue.trim()) {
      toast.error("Valor e obrigatorio");
      return;
    }

    const { error } = await supabase.from("profile_dimensions").insert({
      dimension_type: newType,
      value: newValue.trim().toLowerCase().replace(/\s+/g, "_"),
      label_pt: newLabel.trim() || newValue.trim(),
    });

    if (error) {
      if (error.code === "23505") {
        toast.error("Essa dimensao ja existe");
      } else {
        toast.error("Erro ao adicionar");
      }
      return;
    }

    setNewValue("");
    setNewLabel("");
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
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Dimensoes de Perfil</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Defina os valores possiveis para cargo, industria e porte. Estes serao
        usados para gerar perfis de agentes nas sessoes.
      </p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Adicionar Dimensao</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 items-end">
            <div className="w-40">
              <Select value={newType} onValueChange={(v) => v && setNewType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIMENSION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              placeholder="Valor (ex: cfo)"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="w-40"
            />
            <Input
              placeholder="Label (ex: CFO)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-48"
            />
            <Button onClick={addDimension}>Adicionar</Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <Card key={group.value}>
              <CardHeader>
                <CardTitle className="text-base">
                  {group.label}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({group.items.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {group.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum valor definido
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((item) => (
                      <Badge
                        key={item.id}
                        variant="secondary"
                        className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
                        onClick={() => removeDimension(item.id)}
                        title="Clique para remover"
                      >
                        {item.label_pt || item.value} &times;
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
