import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { forticsConta } from "./direcionamento";
import {
  DIAS_ENCERRADAS,
  DIAS_QUADRO,
  colunaDa,
  compararCartoes,
  ehCorporativo,
  pendenteNoSgp,
  tipoServico,
  type Coluna,
  type TipoServico,
} from "./regras";

/**
 * Dados do quadro da Operação Técnica (21/11/2026). Junta as ocorrências de
 * campo dos últimos 30 dias com a OS e o cadastro do contrato. Tudo lido do
 * espelho do SGP: as tabelas são atualizadas pela rotina "operacao" do sync.
 * As tabelas do SGP não têm política para o navegador — a página confere o
 * perfil antes de chamar.
 */

export type CartaoOperacao = {
  ocorrenciaId: string;
  osId: string | null;
  coluna: Coluna;
  tipo: TipoServico;
  tipoSgp: string;
  statusOcorrencia: string | null;
  statusOs: string | null;
  pendente: boolean;
  corporativo: boolean;
  cliente: string;
  sgpContratoId: string | null;
  sgpClienteId: string | null;
  documento: string | null;
  bairro: string | null;
  unidade: string;
  plano: string | null;
  criadaEm: string;
  agendamento: string | null;
  checkin: string | null;
  osEncerradaEm: string | null;
  encerradaEm: string | null;
  tecnico: string | null;
  auxiliares: string | null;
  servicoPrestado: string | null;
  abertaPor: string | null;
};

export type DadosOperacao = {
  cartoes: CartaoOperacao[];
  desde: string;
  atualizadoEm: string | null;
  osAtualizadasEm: string | null;
};

type LinhaOc = {
  sgp_ocorrencia_id: string;
  sgp_contrato_id: string | null;
  sgp_cliente_id: string | null;
  tipo: string | null;
  status: string | null;
  criada_em: string;
  encerrada_em: string | null;
  usuario: string | null;
  pop: string | null;
  sgp_os_id: string | null;
  lido_em: string | null;
  responsavel: string | null;
};
type LinhaOs = {
  sgp_os_id: string;
  motivo: string | null;
  cliente_nome: string | null;
  bairro: string | null;
  pop: string | null;
  status: string | null;
  agendamento: string | null;
  checkin: string | null;
  encerrada_em: string | null;
  responsavel: string | null;
  auxiliares: string | null;
  servico_prestado: string | null;
  importado_em: string | null;
};
type InfoContrato = { cliente: string | null; documento: string | null; bairro: string | null; sgpClienteId: string | null; plano: string | null; planoCorporativo: boolean; unidade: string | null };

const UNIDADE_POR_POP: [RegExp, string][] = [
  [/xingu|vtx/i, "Vitória do Xingu"],
  [/brasil novo|\bbn\b/i, "Brasil Novo"],
  [/altamira|atm/i, "Altamira"],
];
function nomeUnidade(...fontes: (string | null | undefined)[]): string {
  for (const f of fontes) {
    for (const [re, nome] of UNIDADE_POR_POP) if (f && re.test(f)) return nome;
  }
  return fontes.find((f) => f && f.trim())?.trim() ?? "Sem unidade";
}

async function paginado<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(error.message);
    todas.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return todas;
}

export async function dadosOperacao(agora = Date.now()): Promise<DadosOperacao> {
  const admin = criarClienteAdmin();
  const desde = new Date(agora - DIAS_QUADRO * 86_400_000).toISOString();
  const desdeEncerradas = agora - DIAS_ENCERRADAS * 86_400_000;

  const ocorrencias = (
    await paginado<LinhaOc>((de, ate) =>
      admin
        .from("ocorrencias_sgp")
        .select("sgp_ocorrencia_id, sgp_contrato_id, sgp_cliente_id, tipo, status, criada_em, encerrada_em, usuario, pop, sgp_os_id, lido_em, responsavel")
        .gte("criada_em", desde)
        .order("sgp_ocorrencia_id")
        .range(de, ate)
    )
  ).filter((o) => tipoServico(o.tipo) !== null);

  const idsOs = [...new Set(ocorrencias.map((o) => o.sgp_os_id).filter((x): x is string => Boolean(x)))];
  const idsContrato = [...new Set(ocorrencias.map((o) => o.sgp_contrato_id).filter((x): x is string => Boolean(x)))];

  const os = new Map<string, LinhaOs>();
  for (let i = 0; i < idsOs.length; i += 300) {
    const { data, error } = await admin
      .from("os_tecnicas")
      .select("sgp_os_id, motivo, cliente_nome, bairro, pop, status, agendamento, checkin, encerrada_em, responsavel, auxiliares, servico_prestado, importado_em")
      .in("sgp_os_id", idsOs.slice(i, i + 300));
    if (error) throw new Error(error.message);
    for (const o of (data ?? []) as LinhaOs[]) os.set(o.sgp_os_id, o);
  }

  const contratos = new Map<string, InfoContrato>();
  for (let i = 0; i < idsContrato.length; i += 300) {
    const { data, error } = await admin
      .from("contratos")
      .select("sgp_contrato_id, clientes(nome, cpf, bairro, sgp_cliente_id), planos(nome, setor_corporativo), pops(nome)")
      .in("sgp_contrato_id", idsContrato.slice(i, i + 300));
    if (error) throw new Error(error.message);
    for (const c of data ?? []) {
      const cli = c.clientes as unknown as { nome: string | null; cpf: string | null; bairro: string | null; sgp_cliente_id: string | null } | null;
      const plano = c.planos as unknown as { nome: string | null; setor_corporativo: boolean | null } | null;
      contratos.set(String(c.sgp_contrato_id), {
        cliente: cli?.nome ?? null,
        documento: cli?.cpf ?? null,
        bairro: cli?.bairro ?? null,
        sgpClienteId: cli?.sgp_cliente_id ? String(cli.sgp_cliente_id) : null,
        plano: plano?.nome ?? null,
        planoCorporativo: Boolean(plano?.setor_corporativo),
        unidade: (c.pops as unknown as { nome: string | null } | null)?.nome ?? null,
      });
    }
  }

  const cartoes: CartaoOperacao[] = [];
  for (const oc of ocorrencias) {
    const o = oc.sgp_os_id ? os.get(oc.sgp_os_id) : undefined;
    if (!forticsConta(o?.motivo, oc.tipo, oc.responsavel)) continue;
    const coluna = colunaDa(oc, o);
    if (coluna === "encerrada" && !(oc.encerrada_em && Date.parse(oc.encerrada_em) >= desdeEncerradas)) continue;
    const ct = oc.sgp_contrato_id ? contratos.get(oc.sgp_contrato_id) : undefined;
    cartoes.push({
      ocorrenciaId: oc.sgp_ocorrencia_id,
      osId: oc.sgp_os_id,
      coluna,
      tipo: tipoServico(oc.tipo)!,
      tipoSgp: oc.tipo ?? "",
      statusOcorrencia: oc.status,
      statusOs: o?.status ?? null,
      pendente: pendenteNoSgp(o?.status) || pendenteNoSgp(oc.status),
      // o SGP também separa o POP "Altamira - Corporativo" etc.
      corporativo: ehCorporativo(ct?.documento, ct?.plano, ct?.planoCorporativo) || /corporativo/i.test(`${oc.pop ?? ""} ${o?.pop ?? ""}`),
      cliente: ct?.cliente ?? o?.cliente_nome ?? "—",
      sgpContratoId: oc.sgp_contrato_id,
      sgpClienteId: oc.sgp_cliente_id ?? ct?.sgpClienteId ?? null,
      documento: ct?.documento ?? null,
      bairro: o?.bairro ?? ct?.bairro ?? null,
      unidade: nomeUnidade(ct?.unidade, oc.pop, o?.pop),
      plano: ct?.plano ?? null,
      criadaEm: oc.criada_em,
      agendamento: o?.agendamento ?? null,
      checkin: o?.checkin ?? null,
      osEncerradaEm: o?.encerrada_em ?? null,
      encerradaEm: oc.encerrada_em,
      tecnico: o?.responsavel ?? null,
      auxiliares: o?.auxiliares ?? null,
      servicoPrestado: o?.servico_prestado ?? null,
      abertaPor: oc.usuario,
    });
  }
  cartoes.sort(compararCartoes);

  const maior = (xs: (string | null | undefined)[]) => xs.reduce<string | null>((m, x) => (x && (!m || x > m) ? x : m), null);
  return {
    cartoes,
    desde,
    atualizadoEm: maior(ocorrencias.map((o) => o.lido_em)),
    osAtualizadasEm: maior([...os.values()].map((o) => o.importado_em)),
  };
}
