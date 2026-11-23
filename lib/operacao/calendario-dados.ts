import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { MOTIVOS_CALENDARIO, posicaoNoCalendario, tipoDoMotivo, type OsCalendario } from "./calendario";
import { CONTRATO_INFRAESTRUTURA, ehCorporativo, ehInfraestrutura } from "./regras";
import { forticsConta } from "./direcionamento";

/**
 * Leitura do calendário da Operação Técnica (21/11/2026): as OS de campo com
 * agendamento ou encerramento dentro do mês (só os dias do mês, 23/11/2026).
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
  servico_prestado: string | null;
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

export async function dadosCalendario(mes: string, agora = Date.now(), setor: "operacao" | "infraestrutura" = "operacao"): Promise<{ itens: OsCalendario[]; atualizadoEm: string | null }> {
  const admin = criarClienteAdmin();
  // só os dias do mês (23/11/2026): a grade mostra os dias vizinhos vazios
  const de = `${mes}-01`;
  const ate = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const ini = `${de}T00:00:00-03:00`;
  const fim = `${ate}T23:59:59-03:00`;
  const colunas = "sgp_os_id, sgp_contrato_id, cliente_nome, pop, bairro, motivo, status, agendamento, checkin, servico_prestado, encerrada_em, responsavel, importado_em";
  const filtroData = `and(agendamento.gte.${ini},agendamento.lte.${fim}),and(checkin.gte.${ini},checkin.lte.${fim}),and(encerrada_em.gte.${ini},encerrada_em.lte.${fim})`;
  const pagina = (i: number) => admin.from("os_tecnicas").select(colunas).in("motivo", MOTIVOS_CALENDARIO).or(filtroData).order("sgp_os_id").range(i, i + 999);
  // páginas de 1.000 buscadas aos pares e junto com as OS da infraestrutura (o mês cabe em ~2 páginas)
  const [pares, infra] = await Promise.all([
    Promise.all([pagina(0), pagina(1000)]),
    // OS do cliente interno da infraestrutura, com qualquer motivo
    admin.from("os_tecnicas").select(colunas).eq("sgp_contrato_id", CONTRATO_INFRAESTRUTURA).or(filtroData),
  ]);
  const linhas: LinhaOs[] = [];
  for (const { data, error } of pares) {
    if (error) throw new Error(error.message);
    linhas.push(...((data ?? []) as LinhaOs[]));
  }
  for (let i = 2000; (pares[1].data?.length ?? 0) === 1000; i += 1000) {
    const { data, error } = await pagina(i);
    if (error) throw new Error(error.message);
    linhas.push(...((data ?? []) as LinhaOs[]));
    if (!data || data.length < 1000) break;
  }
  {
    const vistas = new Set(linhas.map((l) => l.sgp_os_id));
    for (const l of (infra.data ?? []) as LinhaOs[]) if (!vistas.has(l.sgp_os_id)) linhas.push(l);
  }

  // a ocorrência de cada OS: Fortics (só a que foi para um gestor técnico) e o setor de infraestrutura
  const osIds = linhas.map((l) => l.sgp_os_id);
  // os lotes rodam em paralelo (23/11/2026): em série o calendário levava ~6 s só no banco
  const lotes = <T,>(xs: T[], n = 300) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
  const ids = [...new Set(linhas.map((l) => l.sgp_contrato_id).filter((x): x is string => Boolean(x)))];
  const [respostasOc, respostasCt] = await Promise.all([
    Promise.all(lotes(osIds).map((lote) => admin.from("ocorrencias_sgp").select("sgp_os_id, tipo, responsavel, setor_sgp").in("sgp_os_id", lote))),
    Promise.all(
      lotes(ids).map((lote) =>
        admin.from("contratos").select("sgp_contrato_id, clientes(nome, cpf, sgp_cliente_id), planos(nome, setor_corporativo)").in("sgp_contrato_id", lote)
      )
    ),
  ]);
  const respFortics = new Map<string, { tipo: string | null; responsavel: string | null; setor: string | null }>();
  for (const { data } of respostasOc)
    for (const o of data ?? []) respFortics.set(String(o.sgp_os_id), { tipo: (o.tipo as string | null) ?? null, responsavel: (o.responsavel as string | null) ?? null, setor: (o.setor_sgp as string | null) ?? null });
  const contratos = new Map<string, { cliente: string | null; documento: string | null; sgpClienteId: string | null; corporativo: boolean }>();
  for (const { data, error } of respostasCt) {
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
    const oc = respFortics.get(l.sgp_os_id);
    if (!forticsConta(l.motivo, oc?.tipo, oc?.responsavel)) continue;
    const infra = ehInfraestrutura({ sgpContratoId: l.sgp_contrato_id, tipo: oc?.tipo, setorSgp: oc?.setor });
    if ((setor === "infraestrutura") !== infra) continue;
    const tipo = infra ? ("infraestrutura" as const) : tipoDoMotivo(l.motivo);
    const pos = posicaoNoCalendario({ status: l.status, agendamento: l.agendamento, checkin: l.checkin, encerradaEm: l.encerrada_em, servicoPrestado: l.servico_prestado }, agora);
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
