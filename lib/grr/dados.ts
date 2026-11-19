import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { timeComMetaNoMes, timeDoCoordenador } from "@/lib/coordenacao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { todas } from "@/lib/supabase/paginar";
import { foraDasVendas } from "@/lib/relatorio-semanal/dados";
import { carregarDiasUteis } from "@/lib/relatorio-semanal/dias-uteis";
import { hojeSantarem, mesDeReferencia, somarDias, type Semana } from "@/lib/relatorio-semanal/periodo";
import type { CadastroGrr, EquipeGrr, EscopoGrr, VendedorGrr } from "./escopo";
import { montarGrr, type BaseGrr, type ContratoGrr, type DadosGrr, type TicketGrr } from "./montar";
import type { MetaLinha } from "./regras";

/**
 * Leitura do GRR Comercial (Etapa 1, só leitura). Os dados vêm do banco com
 * a sessão de quem abriu a tela: a permissão por linha decide o que a
 * coordenação enxerga, e o recorte do GRR é aplicado por cima. Nada é
 * gravado e nenhum sistema externo é consultado.
 */

const CAMPOS_CONTRATO =
  "id, sgp_contrato_id, data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, desistencia_em, assinatura_dispensada, valor_mensalidade, vendedor_id, pop_id, clientes(nome), planos(nome)";

const CAMPOS_TICKET =
  "id, cliente_nome, telefone, vendedor_id, pop_id, etapa, criado_em, primeira_tratativa_em, followup_em, followup_feito_em, fechado_em, desfecho, origem_criacao, contrato_id, reconciliado_em, atualizado_em, contratos!tickets_contrato_id_fkey(data_venda), motivos_nao_conversao(nome)";

type ContratoBruto = Omit<ContratoGrr, "fora" | "valor_mensalidade"> & {
  valor_mensalidade: number | string | null;
  clientes: { nome: string | null } | null;
  planos: { nome: string | null } | null;
};

type TicketBruto = Omit<TicketGrr, "data_venda_contrato"> & { contratos: { data_venda: string | null } | null };

const contrato = (c: ContratoBruto): ContratoGrr => {
  const { clientes, planos, ...resto } = c;
  return { ...resto, valor_mensalidade: Number(c.valor_mensalidade ?? 0) || 0, fora: foraDasVendas(clientes?.nome, planos?.nome) };
};

const ticket = (t: TicketBruto): TicketGrr => {
  const { contratos, ...resto } = t;
  return { ...resto, data_venda_contrato: contratos?.data_venda ?? null };
};

/**
 * Cadastro usado nos filtros, nas quebras e nas fotos: unidades, agentes e a
 * equipe de cada coordenador. A equipe é a mesma do Dashboard: quem o
 * coordenador acompanha (equipe e apoio) e que vale no mês de referência.
 */
export async function carregarCadastroGrr(mesDe: string): Promise<CadastroGrr> {
  const admin = criarClienteAdmin();
  const [{ data: pops }, { data: vendedores }, { data: coordenadores }] = await Promise.all([
    admin.from("pops").select("id, nome").order("nome"),
    admin.from("vendedores").select("id, nome, pop_id, setor, ativo, eh_coordenador, coordenador_id").order("nome"),
    admin.from("usuarios").select("id, nome").eq("perfil", "supervisor").eq("ativo", true).order("nome"),
  ]);
  const times = await Promise.all(
    (coordenadores ?? []).map(async (c) => {
      const acompanhados = await timeDoCoordenador(c.id as string);
      return { coordenadorId: c.id as string, nome: String(c.nome), vendedorIds: acompanhados ? await timeComMetaNoMes(acompanhados, mesDe) : [] };
    })
  );
  const equipes: EquipeGrr[] = times.filter((t) => t.vendedorIds.length > 0);
  return { pops: (pops ?? []).map((p) => ({ id: p.id as string, nome: String(p.nome) })), vendedores: (vendedores ?? []) as VendedorGrr[], equipes };
}

/** lê a base da semana pedida: 8 semanas de vendas, ativações e tickets, mais o estoque de pendências */
export async function lerBaseGrr(semana: Semana, supabase: SupabaseClient = criarClienteServidor()): Promise<{ base: BaseGrr; ehExpediente: (dia: string) => boolean }> {
  const mes = mesDeReferencia(semana);
  const inicioJanela = [somarDias(semana.inicio, -49), mes.de].sort()[0];
  const fechadosDesde = `${somarDias(inicioJanela, -10)}T00:00:00-03:00`;

  const [vendas, ativados, pendencias, osAbertas, ticketsAbertos, ticketsFechados, acoes, metas, ehExpediente] = await Promise.all([
    todas<ContratoBruto>((de, ate) => supabase.from("contratos").select(CAMPOS_CONTRATO).gte("data_venda", inicioJanela).lte("data_venda", semana.fim).order("id").range(de, ate)),
    todas<ContratoBruto>((de, ate) => supabase.from("contratos").select(CAMPOS_CONTRATO).gte("data_ativacao", inicioJanela).lte("data_ativacao", semana.fim).order("id").range(de, ate)),
    todas<ContratoBruto>((de, ate) =>
      supabase.from("contratos").select(CAMPOS_CONTRATO).neq("status", "cancelado").or("data_assinatura.is.null,data_ativacao.is.null").order("id").range(de, ate)
    ),
    todas<{ sgp_os_id: string; contratos: ContratoBruto | null }>((de, ate) =>
      supabase.from("os_instalacao").select(`sgp_os_id, contratos!inner(${CAMPOS_CONTRATO})`).eq("situacao", "aberta").order("sgp_os_id").range(de, ate)
    ),
    todas<TicketBruto>((de, ate) => supabase.from("tickets").select(CAMPOS_TICKET).neq("etapa", "fechado").order("id").range(de, ate)),
    todas<TicketBruto>((de, ate) => supabase.from("tickets").select(CAMPOS_TICKET).eq("etapa", "fechado").gte("fechado_em", fechadosDesde).order("id").range(de, ate)),
    todas<{ quando: string; concluida_em: string | null; tickets: { vendedor_id: string | null; pop_id: string | null; etapa: string } | null }>((de, ate) =>
      supabase.from("ticket_acoes").select("id, quando, concluida_em, tickets!inner(vendedor_id, pop_id, etapa)").gte("quando", `${inicioJanela}T00:00:00-03:00`).order("id").range(de, ate)
    ).catch(() => []),
    supabase
      .from("metas")
      .select("escopo, referencia_id, quantidade_vendas")
      .eq("mes_ano", mes.de)
      .then((r) => (r.data ?? []) as MetaLinha[]),
    carregarDiasUteis(inicioJanela < mes.de ? inicioJanela : mes.de, semana.fim > mes.ate ? semana.fim : mes.ate),
  ]);

  return {
    base: {
      vendas: vendas.map(contrato),
      ativados: ativados.map(contrato),
      pendencias: pendencias.map(contrato),
      osAbertas: osAbertas.filter((o) => o.contratos).map((o) => contrato(o.contratos!)),
      ticketsAbertos: ticketsAbertos.map(ticket),
      ticketsFechados: ticketsFechados.map(ticket),
      acoes: acoes.map((x) => ({ quando: x.quando, concluida_em: x.concluida_em, vendedor_id: x.tickets?.vendedor_id ?? null, pop_id: x.tickets?.pop_id ?? null, ticketAberto: x.tickets?.etapa !== "fechado" })),
      metas,
    },
    ehExpediente,
  };
}

/** tudo o que o resumo e o detalhe do GRR Comercial mostram, no recorte de quem abriu a tela */
export async function carregarGrrComercial(semana: Semana, escopo: EscopoGrr, cadastro: CadastroGrr): Promise<DadosGrr> {
  const { base, ehExpediente } = await lerBaseGrr(semana);
  return montarGrr(base, semana, escopo, cadastro, ehExpediente, hojeSantarem());
}
