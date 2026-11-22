import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { Compromisso, Participante } from "../reunioes";
import { EMPRESA_GRR } from "../config-dados";
import { SETOR_TECNICO } from "./catalogo";
import type { CartaoTecnico } from "./regras";

/**
 * Reunião operacional do setor técnico (GRR Técnico, Etapa 2 — 21/11/2026):
 * terça-feira, coordenador técnico com a equipe. Mesmas tabelas das reuniões
 * do comercial (setor "tecnico", modalidade "operacional"). As páginas
 * conferem o perfil antes; a leitura e a gravação vão pelo servidor.
 */

export type ReuniaoTecnico = {
  id: string;
  escopo_tipo: "empresa" | "unidade";
  escopo_ref: string | null;
  escopo_rotulo: string;
  responsavel_nome: string | null;
  data_reuniao: string;
  periodo_inicio: string;
  periodo_fim: string;
  participantes: Participante[];
  observacoes: string | null;
  boas_praticas: string | null;
  situacao: "aberta" | "encerrada";
  dados: { cartoes: CartaoTecnico[]; encerradaEm: string } | null;
  encerrada_em: string | null;
  criada_em: string;
};

const CAMPOS = "id, escopo_tipo, escopo_ref, escopo_rotulo, responsavel_nome, data_reuniao, periodo_inicio, periodo_fim, participantes, observacoes, boas_praticas, situacao, encerrada_em, criada_em";
const doSetor = () => criarClienteAdmin().from("grr_reunioes").select(CAMPOS).eq("empresa", EMPRESA_GRR).eq("setor", SETOR_TECNICO).eq("modalidade", "operacional");

export async function listarReunioesTecnico(): Promise<{ disponivel: boolean; reunioes: Omit<ReuniaoTecnico, "dados">[] }> {
  const { data, error } = await doSetor().order("data_reuniao", { ascending: false }).order("criada_em", { ascending: false }).limit(60);
  if (error) return { disponivel: false, reunioes: [] };
  return { disponivel: true, reunioes: (data ?? []) as unknown as Omit<ReuniaoTecnico, "dados">[] };
}

export async function lerReuniaoTecnico(id: string): Promise<{ reuniao: ReuniaoTecnico; compromissos: Compromisso[]; pendentesAnteriores: Compromisso[] } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const admin = criarClienteAdmin();
  const { data } = await admin.from("grr_reunioes").select(`${CAMPOS}, dados`).eq("id", id).eq("setor", SETOR_TECNICO).eq("modalidade", "operacional").maybeSingle();
  if (!data) return null;
  const reuniao = data as unknown as ReuniaoTecnico;
  const [{ data: proprios }, { data: anteriores }] = await Promise.all([
    admin.from("grr_compromissos").select("*").eq("reuniao_id", id).order("criado_em"),
    // compromissos ainda abertos de reuniões anteriores do setor, para conferir nesta
    admin
      .from("grr_reunioes")
      .select("id")
      .eq("setor", SETOR_TECNICO)
      .eq("modalidade", "operacional")
      .lt("data_reuniao", reuniao.data_reuniao)
      .order("data_reuniao", { ascending: false })
      .limit(12),
  ]);
  const idsAnteriores = (anteriores ?? []).map((r) => String(r.id));
  const { data: abertos } = idsAnteriores.length
    ? await admin.from("grr_compromissos").select("*").in("reuniao_id", idsAnteriores).in("situacao", ["pendente", "em_andamento"]).order("prazo", { ascending: true, nullsFirst: false })
    : { data: [] };
  return { reuniao, compromissos: (proprios ?? []) as unknown as Compromisso[], pendentesAnteriores: (abertos ?? []) as unknown as Compromisso[] };
}

/** terça-feira da semana de hoje (ou a próxima, se já passou) e a semana completa anterior a ela */
export function proximaTerca(hoje: string): { data: string; periodo: { inicio: string; fim: string } } {
  const d = new Date(`${hoje}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 domingo … 2 terça
  const ate = (2 - dow + 7) % 7;
  d.setUTCDate(d.getUTCDate() + ate);
  const terca = d.toISOString().slice(0, 10);
  const seg = new Date(`${terca}T12:00:00Z`);
  seg.setUTCDate(seg.getUTCDate() - 8);
  const inicio = seg.toISOString().slice(0, 10);
  const fim = new Date(Date.parse(`${inicio}T12:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  return { data: terca, periodo: { inicio, fim } };
}
