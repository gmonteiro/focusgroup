"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Dimension = {
  id: string;
  dimension_type: string;
  value: string;
  label_pt: string | null;
};

type Profile = {
  id: string;
  name: string;
  role: string;
  industry: string;
  company_size: string;
  extra_context: string | null;
  system_prompt: string;
};

const BRAZILIAN_FIRST_NAMES = [
  "Ana", "Bruno", "Carlos", "Daniela", "Eduardo", "Fernanda", "Gabriel",
  "Helena", "Igor", "Julia", "Kleber", "Larissa", "Marcos", "Natalia",
  "Otavio", "Patricia", "Rafael", "Silvia", "Thiago", "Vanessa", "Wagner",
  "Yasmin", "Lucas", "Marina", "Pedro", "Renata", "Diego", "Camila",
  "Felipe", "Leticia", "Andre", "Beatriz", "Rodrigo", "Mariana", "Gustavo",
  "Isabela", "Leonardo", "Amanda", "Mateus", "Carolina",
];

const BRAZILIAN_LAST_NAMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Almeida",
  "Nascimento", "Lima", "Araujo", "Melo", "Barbosa", "Ribeiro", "Martins",
  "Carvalho", "Gomes", "Lopes", "Freitas", "Moreira", "Costa",
];

function generateName(index: number): string {
  const first = BRAZILIAN_FIRST_NAMES[index % BRAZILIAN_FIRST_NAMES.length];
  const last = BRAZILIAN_LAST_NAMES[Math.floor(index / BRAZILIAN_FIRST_NAMES.length) % BRAZILIAN_LAST_NAMES.length];
  return `${first} ${last}`;
}

function buildSystemPrompt(
  name: string,
  roleLabel: string,
  industryLabel: string,
  sizeLabel: string,
  extraContext?: string
): string {
  let prompt = `Voce e ${name}, ${roleLabel} em uma empresa de ${sizeLabel} do setor de ${industryLabel}. `;
  prompt += `Responda todas as perguntas com base na sua experiencia profissional neste cargo, industria e porte de empresa. `;
  prompt += `Seja especifico e realista. Traga exemplos concretos do seu dia a dia quando possivel. `;
  prompt += `Responda em portugues.`;
  if (extraContext) {
    prompt += ` Contexto adicional: ${extraContext}`;
  }
  return prompt;
}

export default function ProfilesTab({ sessionId }: { sessionId: string }) {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [selectedIndustries, setSelectedIndustries] = useState<Set<string>>(new Set());
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());
  const [extraContext, setExtraContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([loadDimensions(), loadProfiles()]).then(() => setLoading(false));
  }, []);

  async function loadDimensions() {
    const { data } = await supabase
      .from("profile_dimensions")
      .select("*")
      .order("dimension_type")
      .order("label_pt");
    if (data) setDimensions(data);
  }

  async function loadProfiles() {
    const { data } = await supabase
      .from("agent_profiles")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at");
    if (data) setProfiles(data);
  }

  function toggleSelection(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  async function generateProfiles() {
    if (selectedRoles.size === 0 || selectedIndustries.size === 0 || selectedSizes.size === 0) {
      toast.error("Selecione pelo menos um valor em cada dimensao");
      return;
    }

    setGenerating(true);

    const roles = dimensions.filter(
      (d) => d.dimension_type === "role" && selectedRoles.has(d.value)
    );
    const industries = dimensions.filter(
      (d) => d.dimension_type === "industry" && selectedIndustries.has(d.value)
    );
    const sizes = dimensions.filter(
      (d) => d.dimension_type === "company_size" && selectedSizes.has(d.value)
    );

    const newProfiles: Omit<Profile, "id">[] = [];
    let idx = profiles.length;

    for (const role of roles) {
      for (const industry of industries) {
        for (const size of sizes) {
          const name = generateName(idx++);
          newProfiles.push({
            name,
            role: role.value,
            industry: industry.value,
            company_size: size.value,
            extra_context: extraContext.trim() || null,
            system_prompt: buildSystemPrompt(
              name,
              role.label_pt || role.value,
              industry.label_pt || industry.value,
              size.label_pt || size.value,
              extraContext.trim() || undefined
            ),
          });
        }
      }
    }

    // Insert in batches of 100
    for (let i = 0; i < newProfiles.length; i += 100) {
      const batch = newProfiles.slice(i, i + 100).map((p) => ({
        ...p,
        session_id: sessionId,
      }));
      const { error } = await supabase.from("agent_profiles").insert(batch);
      if (error) {
        toast.error(`Erro ao inserir batch ${i}: ${error.message}`);
        break;
      }
    }

    toast.success(`${newProfiles.length} perfis gerados`);
    await loadProfiles();
    setGenerating(false);
  }

  async function clearProfiles() {
    if (!confirm("Remover todos os perfis desta sessao?")) return;
    await supabase.from("agent_profiles").delete().eq("session_id", sessionId);
    setProfiles([]);
    toast.success("Perfis removidos");
  }

  const roles = dimensions.filter((d) => d.dimension_type === "role");
  const industries = dimensions.filter((d) => d.dimension_type === "industry");
  const sizes = dimensions.filter((d) => d.dimension_type === "company_size");

  const totalCombinations = selectedRoles.size * selectedIndustries.size * selectedSizes.size;

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gerar Perfis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2 block">
              Cargos ({selectedRoles.size} selecionados)
            </Label>
            <div className="flex flex-wrap gap-2">
              {roles.map((d) => (
                <Badge
                  key={d.id}
                  variant={selectedRoles.has(d.value) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() =>
                    setSelectedRoles(toggleSelection(selectedRoles, d.value))
                  }
                >
                  {d.label_pt || d.value}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">
              Industrias ({selectedIndustries.size} selecionadas)
            </Label>
            <div className="flex flex-wrap gap-2">
              {industries.map((d) => (
                <Badge
                  key={d.id}
                  variant={
                    selectedIndustries.has(d.value) ? "default" : "outline"
                  }
                  className="cursor-pointer"
                  onClick={() =>
                    setSelectedIndustries(
                      toggleSelection(selectedIndustries, d.value)
                    )
                  }
                >
                  {d.label_pt || d.value}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">
              Porte ({selectedSizes.size} selecionados)
            </Label>
            <div className="flex flex-wrap gap-2">
              {sizes.map((d) => (
                <Badge
                  key={d.id}
                  variant={selectedSizes.has(d.value) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() =>
                    setSelectedSizes(toggleSelection(selectedSizes, d.value))
                  }
                >
                  {d.label_pt || d.value}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="extra">Contexto extra (opcional)</Label>
            <Textarea
              id="extra"
              value={extraContext}
              onChange={(e) => setExtraContext(e.target.value)}
              placeholder="Ex: empresa em processo de transformacao digital"
              rows={2}
            />
          </div>

          <div className="flex items-center gap-4">
            <Button onClick={generateProfiles} disabled={generating || totalCombinations === 0}>
              {generating
                ? "Gerando..."
                : `Gerar ${totalCombinations} perfis`}
            </Button>
            {profiles.length > 0 && (
              <Button variant="outline" onClick={clearProfiles}>
                Limpar perfis
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {profiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Perfis gerados ({profiles.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4">Nome</th>
                    <th className="py-2 pr-4">Cargo</th>
                    <th className="py-2 pr-4">Industria</th>
                    <th className="py-2">Porte</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="py-1.5 pr-4">{p.name}</td>
                      <td className="py-1.5 pr-4">
                        <Badge variant="secondary">{p.role}</Badge>
                      </td>
                      <td className="py-1.5 pr-4">
                        <Badge variant="outline">{p.industry}</Badge>
                      </td>
                      <td className="py-1.5">
                        <Badge variant="outline">{p.company_size}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
