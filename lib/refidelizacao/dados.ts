import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { primeiroDiaDoMes, ultimoDiaDoMes, hojeIso } from "@/lib/datas";

/**
 * Setor de Atendimento — refidelização de planos (regras de 30/08/2026).
 *
 * Comissiona quem GEROU o aditivo, desde que aprovado no SGP e com as DUAS
 * assinaturas no SGPsign. O "aprovado" sozinho não vale como prova porque a
 * própria agente aprova o que cria; a assinatura do cliente é o carimbo que
 * ela não controla.
 *
 * Base: VTV (valor MENSAL) dos planos refidelizados. O desconto concedido é o
 * benefício dado em troca da fidelidade e não entra na conta.
 *
 * Faixas sobre o atingimento da meta de 150 planos, sem acúmulo entre elas.
 */

export { META_REFIDELIZACAO, FAIXAS_REFIDELIZACAO, faixaDe } from "./regras";
import { META_REFIDELIZACAO, faixaDe } from "./regras";

export type AditivoLinha = {
  id: string;
  sgpAditivoId: string;
  sgpContratoId: string | null;
  /** id do cliente no SGP — abre a aba de aditivos dele no painel */
  sgpClienteId: string | null;
  cliente: string;
  agente: string;
  plano: string | null;
  descricao: string;
  desconto: number;
  valorMensal: number;
  valorAjustado: number | null;
  ajusteMotivo: string | null;
  data: string;
  statusSgp: string;
  assinado: boolean;
  decisao: "aprovado" | "reprovado" | null;
  decisaoMotivo: string | null;
  conta: boolean;
  pendencia: string | null;
  /** data da venda do contrato — separa refidelização de venda nova */
  dataVendaContrato: string | null;
  /** contrato novo demais: o aditivo provavelmente é o termo da venda */
  vendaRecente: boolean;
};

export type ResultadoAgente = {
  agente: string;
  nome: string | null;
  foto: string | null;
  validos: number;
  pendentes: number;
  reprovados: number;
  vtv: number;
  atingimentoPct: number;
  faixa: string;
  percentual: number;
  comissao: number;
  linhas: AditivoLinha[];
};

export type RefidelizacaoMes = {
  competencia: string;
  agentes: ResultadoAgente[];
  totais: { validos: number; pendentes: number; vtv: number; comissao: number };
};

/** valor que vale para a comissão: o ajuste manual tem precedência */
const valorDe = (a: { valor_mensal: number; valor_mensal_ajustado: number | null }) =>
  a.valor_mensal_ajustado !== null ? Number(a.valor_mensal_ajustado) : Number(a.valor_mensal ?? 0);

export const AGENTES_SETOR = ["talia.marques", "myllena.araujo"];

export async function refidelizacaoDoMes(
  mesIso?: string,
  logins: string[] = AGENTES_SETOR
): Promise<RefidelizacaoMes> {
  const admin = criarClienteAdmin();
  const mes = primeiroDiaDoMes(mesIso ?? hojeIso());
  const fim = ultimoDiaDoMes(mes);

  const [{ data }, { data: vends }] = await Promise.all([
    admin
      .from("aditivos")
      .select(
        "id, sgp_aditivo_id, sgp_contrato_id, cliente_nome, agente_login, plano_rotulo, descricao, desconto, valor_mensal, valor_mensal_ajustado, valor_ajuste_motivo, data_aditivo, status_sgp, finalizado, decisao, decisao_motivo, contratos(data_venda, clientes(sgp_cliente_id))"
      )
      .gte("data_aditivo", mes)
      .lte("data_aditivo", fim)
      .in("agente_login", logins)
      .order("data_aditivo"),
    admin.from("vendedores").select("nome, sgp_login, foto_url"),
  ]);

  const nomeDe = new Map(
    (vends ?? []).filter((v) => v.sgp_login).map((v) => [String(v.sgp_login).toLowerCase(), v.nome])
  );
  const fotoDe = new Map(
    (vends ?? [])
      .filter((v) => v.sgp_login)
      .map((v) => [String(v.sgp_login).toLowerCase(), (v.foto_url as string | null) ?? null])
  );

  const porAgente = new Map<string, AditivoLinha[]>();
  for (const a of data ?? []) {
    const rel = a.contratos as unknown as
      | { data_venda: string | null; clientes: { sgp_cliente_id: string | null } | null }
      | null;
    const dataVendaContrato = rel?.data_venda ?? null;

    // Aditivo de fidelidade num contrato vendido na PRÓPRIA competência não é
    // refidelização: é o termo da venda nova, que já remunera a vendedora.
    // Pagar os dois seria comissionar a mesma assinatura duas vezes.
    const vendaRecente = dataVendaContrato !== null && dataVendaContrato >= mes;

    const assinado = a.finalizado === true;
    const decisao = (a.decisao as "aprovado" | "reprovado" | null) ?? null;
    // a decisão do gestor manda; sem decisão, vale a assinatura — e a venda
    // nova só entra se o gestor aprovar explicitamente
    const conta =
      decisao === "reprovado"
        ? false
        : decisao === "aprovado"
          ? true
          : assinado && !vendaRecente;
    const pendencia = conta
      ? null
      : decisao === "reprovado"
        ? (a.decisao_motivo as string) || "reprovado pela gestão"
        : vendaRecente
          ? `contrato vendido em ${dataVendaContrato?.slice(8, 10)}/${dataVendaContrato?.slice(5, 7)} — é venda nova, não refidelização`
          : "aguardando assinatura do cliente ou do provedor";

    const linha: AditivoLinha = {
      id: a.id as string,
      sgpAditivoId: a.sgp_aditivo_id as string,
      sgpContratoId: (a.sgp_contrato_id as string) ?? null,
      sgpClienteId: rel?.clientes?.sgp_cliente_id ?? null,
      cliente: (a.cliente_nome as string) ?? "—",
      agente: a.agente_login as string,
      plano: (a.plano_rotulo as string) ?? null,
      descricao: (a.descricao as string) ?? "",
      desconto: Number(a.desconto ?? 0),
      valorMensal: valorDe(a as never),
      valorAjustado: a.valor_mensal_ajustado !== null ? Number(a.valor_mensal_ajustado) : null,
      ajusteMotivo: (a.valor_ajuste_motivo as string) ?? null,
      data: a.data_aditivo as string,
      statusSgp: (a.status_sgp as string) ?? "",
      assinado,
      decisao,
      decisaoMotivo: (a.decisao_motivo as string) ?? null,
      conta,
      pendencia,
      dataVendaContrato,
      vendaRecente,
    };
    porAgente.set(linha.agente, [...(porAgente.get(linha.agente) ?? []), linha]);
  }

  const agentes: ResultadoAgente[] = [...porAgente.entries()]
    .map(([agente, linhas]) => {
      const validas = linhas.filter((l) => l.conta);
      const vtv = validas.reduce((s, l) => s + l.valorMensal, 0);
      const atingimentoPct = (validas.length / META_REFIDELIZACAO) * 100;
      const f = faixaDe(atingimentoPct);
      return {
        agente,
        nome: nomeDe.get(agente) ?? null,
        foto: fotoDe.get(agente) ?? null,
        validos: validas.length,
        pendentes: linhas.filter((l) => !l.conta && l.decisao !== "reprovado").length,
        reprovados: linhas.filter((l) => l.decisao === "reprovado").length,
        vtv,
        atingimentoPct,
        faixa: f?.nome ?? "abaixo da mínima",
        percentual: f?.pct ?? 0,
        comissao: ((f?.pct ?? 0) / 100) * vtv,
        linhas,
      };
    })
    .sort((a, b) => b.validos - a.validos);

  return {
    competencia: mes,
    agentes,
    totais: {
      validos: agentes.reduce((s, a) => s + a.validos, 0),
      pendentes: agentes.reduce((s, a) => s + a.pendentes, 0),
      vtv: agentes.reduce((s, a) => s + a.vtv, 0),
      comissao: agentes.reduce((s, a) => s + a.comissao, 0),
    },
  };
}
