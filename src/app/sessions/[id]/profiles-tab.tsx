"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
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
  name: string, roleLabel: string, industryLabel: string,
  sizeLabel: string, extraContext?: string
): string {
  let prompt = `Voce e ${name}, ${roleLabel} em uma empresa de ${sizeLabel} do setor de ${industryLabel}. `;
  prompt += `Responda todas as perguntas com base na sua experiencia profissional neste cargo, industria e porte de empresa. `;
  prompt += `Seja especifico e realista. Traga exemplos concretos do seu dia a dia quando possivel. `;
  prompt += `Responda em portugues.`;
  if (extraContext) prompt += ` Contexto adicional: ${extraContext}`;
  return prompt;
}

const SECTION_ICONS = {
  role: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  industry: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  size: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
};

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
    const { data } = await supabase.from("profile_dimensions").select("*").order("dimension_type").order("label_pt");
    if (data) setDimensions(data);
  }

  async function loadProfiles() {
    const { data } = await supabase.from("agent_profiles").select("*").eq("session_id", sessionId).order("created_at");
    if (data) setProfiles(data);
  }

  function toggle(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  }

  async function generateProfiles() {
    if (selectedRoles.size === 0 || selectedIndustries.size === 0 || selectedSizes.size === 0) {
      toast.error("Selecione pelo menos um valor em cada dimensao");
      return;
    }
    setGenerating(true);
    const roles = dimensions.filter((d) => d.dimension_type === "role" && selectedRoles.has(d.value));
    const industries = dimensions.filter((d) => d.dimension_type === "industry" && selectedIndustries.has(d.value));
    const sizes = dimensions.filter((d) => d.dimension_type === "company_size" && selectedSizes.has(d.value));

    const newProfiles: Omit<Profile, "id">[] = [];
    let idx = profiles.length;
    for (const role of roles) {
      for (const industry of industries) {
        for (const size of sizes) {
          const name = generateName(idx++);
          newProfiles.push({
            name, role: role.value, industry: industry.value, company_size: size.value,
            extra_context: extraContext.trim() || null,
            system_prompt: buildSystemPrompt(name, role.label_pt || role.value, industry.label_pt || industry.value, size.label_pt || size.value, extraContext.trim() || undefined),
          });
        }
      }
    }
    for (let i = 0; i < newProfiles.length; i += 100) {
      const batch = newProfiles.slice(i, i + 100).map((p) => ({ ...p, session_id: sessionId }));
      const { error } = await supabase.from("agent_profiles").insert(batch);
      if (error) { toast.error(`Erro ao inserir batch ${i}: ${error.message}`); break; }
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

  if (loading) return (
    <div className="animate-pulse space-y-4">
      <div className="h-40 bg-muted rounded-xl" />
      <div className="h-20 bg-muted rounded-xl" />
    </div>
  );

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b bg-muted/30">
          <h3 className="font-semibold text-sm">Selecionar Dimensoes</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Escolha os valores para gerar perfis combinatorios
          </p>
        </div>
        <div className="p-6 space-y-6">
          {[
            { label: "Cargos", icon: SECTION_ICONS.role, items: roles, selected: selectedRoles, setSelected: setSelectedRoles },
            { label: "Industrias", icon: SECTION_ICONS.industry, items: industries, selected: selectedIndustries, setSelected: setSelectedIndustries },
            { label: "Porte", icon: SECTION_ICONS.size, items: sizes, selected: selectedSizes, setSelected: setSelectedSizes },
          ].map(({ label, icon, items, selected, setSelected }) => (
            <div key={label}>
              <Label className="mb-2.5 flex items-center gap-2 text-sm font-medium">
                <span className="text-muted-foreground">{icon}</span>
                {label}
                <span className="text-xs text-muted-foreground font-normal">
                  ({selected.size}/{items.length})
                </span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {items.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setSelected(toggle(selected, d.value))}
                    className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      selected.has(d.value)
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-card text-foreground border-border hover:border-primary/40 hover:bg-accent/50"
                    }`}
                  >
                    {d.label_pt || d.value}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="space-y-2">
            <Label htmlFor="extra" className="text-sm font-medium">
              Contexto extra
              <span className="text-muted-foreground font-normal ml-1">(opcional)</span>
            </Label>
            <Textarea
              id="extra"
              value={extraContext}
              onChange={(e) => setExtraContext(e.target.value)}
              placeholder="Ex: empresa em processo de transformacao digital"
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={generateProfiles}
              disabled={generating || totalCombinations === 0}
              className="gradient-bg border-0 shadow-md shadow-primary/20"
            >
              {generating ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  Gerando...
                </span>
              ) : (
                `Gerar ${totalCombinations} perfis`
              )}
            </Button>
            {profiles.length > 0 && (
              <Button variant="ghost" onClick={clearProfiles} className="text-muted-foreground hover:text-destructive">
                Limpar todos
              </Button>
            )}
            {totalCombinations > 0 && (
              <span className="text-xs text-muted-foreground">
                {selectedRoles.size} cargos x {selectedIndustries.size} industrias x {selectedSizes.size} portes
              </span>
            )}
          </div>
        </div>
      </div>

      {profiles.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/30 flex items-center justify-between">
            <h3 className="font-semibold text-sm">
              Perfis gerados
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {profiles.length} agentes
              </span>
            </h3>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b">
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="py-3 px-6 font-medium">Nome</th>
                  <th className="py-3 px-4 font-medium">Cargo</th>
                  <th className="py-3 px-4 font-medium">Industria</th>
                  <th className="py-3 px-4 font-medium">Porte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {profiles.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-6 font-medium">{p.name}</td>
                    <td className="py-2.5 px-4">
                      <Badge variant="secondary" className="text-[11px]">{p.role}</Badge>
                    </td>
                    <td className="py-2.5 px-4">
                      <Badge variant="outline" className="text-[11px]">{p.industry}</Badge>
                    </td>
                    <td className="py-2.5 px-4">
                      <Badge variant="outline" className="text-[11px]">{p.company_size}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
