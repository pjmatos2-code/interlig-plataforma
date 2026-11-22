import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { MOTIVOS_CALENDARIO, gradeDoMes, posicaoNoCalendario, tipoDoMotivo, type OsCalendario } from "./calendario";
import { ehCorporativo } from "./regras";
import { forticsConta } from "./direcionamento";

/**
 * Leitura do calendário da Operação Técnica (21/11/2026): as OS de campo com
 * agendamento ou encerramento dentro da grade do mês (de segunda a domingo).
 * Lê o espelho do SGP; a página confere o perfil antes.
 */

type LinhaOs = {
  sgp_os_id: string;
  sgp_contrato_id: string | null;
  cliente_nome: string | null;
  pop: string | null;
  bairro: string | null;
  motivo: string | null;
  status: string | null;
  agendamento: string | null;
  checkin: string | null;
  encerrada_em: string | null;
  responsavel: string | null;
  importado_em: string | null;
};

const unidade = (pop: string | null | undefined) => {
  const p = (pop ?? "").toLowerCase();
  if (p.startsWith("vit")) return "Vitória do Xingu";
  if (p.startsWith("brasil")) return "Brasil Novo";
  if (p.startsWith("altamira")) return "Altamira";
  return pop?.trim() || "Sem unidade";
};

export async function dadosCalendario(mes: string, agora = Date.now()): Promise<{ itens: OsCalendario[]; atualizadoEm: string | null }> {
  const admin = criarClienteAdmin();
  const { de, ate } = gradeDoMes(mes);
  const ini = `${de}T00:00:00-03:00`;
  const fim = `${ate}T23:59:59-03:00`;
  const linhas: LinhaOs[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await admin
      .from("os_tecnicas")
      .select("sgp_os_id, sgp_contrato_id, cliente_nome, pop, bairro, motivo, status, agendamento, checkin, encerrada_em, responsavel, importado_em")
      .in("motivo", MOTIVOS_CALENDARIO)
      .or(`and(agendamento.gte.${ini},agendamento.lte.${fim}),and(checkin.gte.${ini},checkin.lte.${fim}),and(encerrada_em.gte.${ini},encerrada_em.lte.${fim})`)
      .order("sgp_os_id")
      .range(i, i + 999);
    if (error) throw new Error(error.message);
    linhas.push(...((data ?? []) as LinhaOs[]));
    if (!data || data.length < 1000) break;
  }

  // Fortics: só a OS cuja ocorrência foi para um gestor técnico
  const fortics = linhas.filter((l) => /fortics/i.test(l.motivo ?? "")).map((l) => l.sgp_os_id);
  const respFortics = new Map<string, { tipo: string | null; responsavel: string | null }>();
  for (let i = 0; i < fortics.length; i += 300) {
    const { data } = await admin.from("ocorrencias_sgp").select("sgp_os_id, tipo, responsavel").in("sgp_os_id", fortics.slice(i, i + 300));
    for (const o of data ?? []) respFortics.set(String(o.sgp_os_id), { tipo: (o.tipo as string | null) ?? null, responsavel: (o.responsavel as string | null) ?? null });
  }
  const ids = [...new Set(linhas.map((l) => l.sgp_contrato_id).filter((x): x is string => Boolean(x)))];
  const contratos = new Map<string, { cliente: string | null; documento: string | null; sgpClienteId: string | null; corporativo: boolean }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await admin
      .from("contratos")
      .select("sgp_contrato_id, clientes(nome, cpf, sgp_cliente_id), planos(nome, setor_corporativo)")
      .in("sgp_contrato_id", ids.slice(i, i + 300));
    if (error) throw new Error(error.message);
    for (const c of data ?? []) {
      const cli = c.clientes as unknown as { nome: string | null; cpf: string | null; sgp_cliente_id: string | null } | null;
      const pl = c.planos as unknown as { nome: string | null; setor_corporativo: boolean | null } | null;
      contratos.set(String(c.sgp_contrato_id), {
        cliente: cli?.nome ?? null,
        documento: cli?.cpf ?? null,
        sgpClienteId: cli?.sgp_cliente_id ? String(cli.sgp_cliente_id) : null,
        corporativo: ehCorporativo(cli?.cpf, pl?.nome, Boolean(pl?.setor_corporativo)),
      });
    }
  }

  const itens: OsCalendario[] = [];
  let atualizadoEm: string | null = null;
  for (const l of linhas) {
    if (l.importado_em && (!atualizadoEm || l.importado_em > atualizadoEm)) atualizadoEm = l.importado_em;
    const tipo = tipoDoMotivo(l.motivo);
    const oc = respFortics.get(l.sgp_os_id);
    if (!forticsConta(l.motivo, oc?.tipo, oc?.responsavel)) continue;
    const pos = posicaoNoCalendario({ status: l.status, agendamento: l.agendamento, checkin: l.checkin, encerradaEm: l.encerrada_em }, agora);
    if (!tipo || !pos || pos.dia < de || pos.dia > ate) continue;
    const ct = l.sgp_contrato_id ? contratos.get(l.sgp_contrato_id) : undefined;
    itens.push({
      osId: l.sgp_os_id,
      ...pos,
      tipo,
      motivo: l.motivo ?? "",
      cliente: ct?.cliente ?? l.cliente_nome ?? "—",
      bairro: l.bairro,
      unidade: unidade(l.pop),
      tecnico: l.responsavel,
      corporativo: Boolean(ct?.corporativo) || /corporativo/i.test(l.pop ?? ""),
      sgpContratoId: l.sgp_contrato_id,
      sgpClienteId: ct?.sgpClienteId ?? null,
      documento: ct?.documento ?? null,
    });
  }
  itens.sort((a, b) => a.quando.localeCompare(b.quando));
  return { itens, atualizadoEm };
}
