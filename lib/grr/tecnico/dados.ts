import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { carregarDiasUteis } from "@/lib/relatorio-semanal/dias-uteis";
import { mesDeReferencia, type Semana } from "@/lib/relatorio-semanal/periodo";
import { dadosOperacao } from "@/lib/operacao/dados";
import { ehCorporativo, servicoFeito, tipoServico } from "@/lib/operacao/regras";
import { forticsConta } from "@/lib/operacao/direcionamento";
import { EMPRESA_GRR } from "../config-dados";
import type { MetaGrr } from "../config";
import { SETOR_TECNICO, UNIDADES_TECNICO, unidadeDoPop, type UnidadeTecnico } from "./catalogo";
import type { BaseTecnico, Contagem, RecorteTecnico } from "./regras";

/**
 * Leitura do GRR Técnico (Etapa 1, 21/11/2026) no espelho do SGP: contratos
 * ativados, OS técnicas, ocorrências (com a hora do direcionamento ao gestor) e
 * os estoques do quadro da Operação Técnica. A página confere o perfil antes;
 * as tabelas do SGP só abrem para o servidor.
 */

type Admin = ReturnType<typeof criarClienteAdmin>;

const somarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const inicioDoDia = (dia: string) => `${dia}T00:00:00-03:00`;
const fimDoDia = (dia: string) => `${dia}T23:59:59-03:00`;

/** motivos de OS de campo (a mesma régua da comissão técnica) */
const MOTIVOS_CAMPO = ["Instalação de equipamento", "Mudança Endereço", "Corretiva", "LOS", "Sem Acesso", "Atendimento Fortics", "Preventiva", "Troca de equipamento", "Instalação de roteador adicional", "Mudança de Comodo"];
const MOTIVOS_SUPORTE = ["Corretiva", "LOS", "Sem Acesso", "Atendimento Fortics", "Preventiva", "Troca de equipamento"];

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
async function emLotes<T>(ids: string[], ler: (lote: string[]) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const todas: T[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await ler(ids.slice(i, i + 300));
    if (error) throw new Error(error.message);
    todas.push(...((data ?? []) as T[]));
  }
  return todas;
}

type InfoContrato = { unidade: UnidadeTecnico | null; corporativo: boolean };
async function infoContratos(admin: Admin, ids: string[]): Promise<Map<string, InfoContrato>> {
  const mapa = new Map<string, InfoContrato>();
  const linhas = await emLotes<{ sgp_contrato_id: string; clientes: { cpf: string | null } | null; planos: { nome: string | null; setor_corporativo: boolean | null } | null; pops: { nome: string | null } | null }>(
    [...new Set(ids)],
    (lote) => admin.from("contratos").select("sgp_contrato_id, clientes(cpf), planos(nome, setor_corporativo), pops(nome)").in("sgp_contrato_id", lote)
  );
  for (const c of linhas) {
    mapa.set(String(c.sgp_contrato_id), {
      unidade: unidadeDoPop(c.pops?.nome),
      corporativo: ehCorporativo(c.clientes?.cpf, c.planos?.nome, Boolean(c.planos?.setor_corporativo)),
    });
  }
  return mapa;
}

/** base de uma semana: dados desde duas semanas antes (retorno em 7 dias) até o fim da semana */
export async function lerBaseTecnico(semana: Semana, hoje: string, admin: Admin = criarClienteAdmin()): Promise<BaseTecnico> {
  const ate = semana.fim <= hoje ? semana.fim : hoje;
  const ini7 = somarDias(semana.inicio, -7);
  const ini14 = somarDias(semana.inicio, -14);

  // contratos ativados (semana e anterior) com a hora do direcionamento da instalação
  const ativados = await paginado<{ sgp_contrato_id: string | null; data_ativacao: string; ativado_em: string | null; pops: { nome: string | null } | null }>((de, a) =>
    admin.from("contratos").select("sgp_contrato_id, data_ativacao, ativado_em, pops(nome)").gte("data_ativacao", ini7).lte("data_ativacao", ate).order("sgp_contrato_id").range(de, a)
  );
  const idsAtivados = ativados.map((c) => c.sgp_contrato_id).filter((x): x is string => Boolean(x));
  const direcionadas = await emLotes<{ sgp_contrato_id: string; direcionada_em: string }>(idsAtivados, (lote) =>
    admin.from("ocorrencias_sgp").select("sgp_contrato_id, direcionada_em").eq("tipo", "Operacional - Instalação equipamento").not("direcionada_em", "is", null).in("sgp_contrato_id", lote)
  );
  const direcionamento = new Map<string, string>();
  for (const d of direcionadas) {
    const atual = direcionamento.get(d.sgp_contrato_id);
    if (!atual || d.direcionada_em < atual) direcionamento.set(d.sgp_contrato_id, d.direcionada_em);
  }

  // serviços de campo feitos desde duas semanas antes (check-in do técnico; sem check-in, a baixa da OS), com a ocorrência de origem
  type LinhaServico = { sgp_os_id: string; sgp_contrato_id: string | null; pop: string | null; motivo: string | null; status: string | null; agendamento: string | null; checkin: string | null; servico_prestado: string | null; encerrada_em: string | null };
  const lidas = await paginado<LinhaServico>((de, a) =>
    admin
      .from("os_tecnicas")
      .select("sgp_os_id, sgp_contrato_id, pop, motivo, status, agendamento, checkin, servico_prestado, encerrada_em")
      .in("motivo", MOTIVOS_CAMPO)
      .or(`and(checkin.gte.${inicioDoDia(ini14)},checkin.lte.${fimDoDia(ate)}),and(checkin.is.null,status.eq.Encerrada,encerrada_em.gte.${inicioDoDia(ini14)},encerrada_em.lte.${fimDoDia(ate)})`)
      .order("sgp_os_id")
      .range(de, a)
  );
  const osEncerradasTodas = lidas
    // sem check-in e sem agendamento não houve visita (OS baixada pelo atendimento)
    .filter((o) => servicoFeito(o) && Boolean(o.checkin || o.agendamento))
    .map((o) => ({ ...o, encerrada_em: (o.checkin ?? o.encerrada_em)! }));
  const ocorrencias = await emLotes<{ sgp_os_id: string; tipo: string | null; criada_em: string; pop: string | null; responsavel: string | null }>(
    osEncerradasTodas.map((o) => o.sgp_os_id),
    (lote) => admin.from("ocorrencias_sgp").select("sgp_os_id, tipo, criada_em, pop, responsavel").in("sgp_os_id", lote)
  );
  const ocPorOs = new Map(ocorrencias.map((o) => [String(o.sgp_os_id), o]));
  // Fortics só conta quando a ocorrência foi para um gestor técnico (decisão de 21/11/2026)
  const osEncerradas = osEncerradasTodas.filter((o) => {
    const oc = ocPorOs.get(String(o.sgp_os_id));
    return forticsConta(o.motivo, oc?.tipo, oc?.responsavel);
  });
  const contratos = await infoContratos(admin, osEncerradas.map((o) => o.sgp_contrato_id).filter((x): x is string => Boolean(x)));

  const suporte: BaseTecnico["suporte"] = [];
  const mudancas: BaseTecnico["mudancas"] = [];
  for (const os of osEncerradas) {
    if (Date.parse(os.encerrada_em) < Date.parse(inicioDoDia(ini7))) continue;
    const oc = ocPorOs.get(String(os.sgp_os_id));
    if (!oc) continue;
    const tipo = tipoServico(oc.tipo);
    const ct = os.sgp_contrato_id ? contratos.get(os.sgp_contrato_id) : undefined;
    const unidade = ct?.unidade ?? unidadeDoPop(oc.pop) ?? unidadeDoPop(os.pop);
    if (tipo === "suporte" && Date.parse(os.encerrada_em) >= Date.parse(oc.criada_em)) {
      suporte.push({ unidade, abertaEm: oc.criada_em, atendidaEm: os.encerrada_em, corporativo: Boolean(ct?.corporativo) || /corporativo/i.test(`${oc.pop ?? ""} ${os.pop ?? ""}`) });
    } else if (tipo === "mudanca") {
      mudancas.push({ unidade, abertaEm: oc.criada_em, agendamento: os.agendamento, atendidaEm: os.encerrada_em });
    }
  }

  // retorno em 7 dias: nova OS de suporte do mesmo contrato depois do serviço
  const servicosBase = osEncerradas.filter((o) => o.sgp_contrato_id && Date.parse(o.encerrada_em) <= Date.parse(fimDoDia(somarDias(ate, -7))));
  const novasTodas = await emLotes<{ sgp_os_id: string; sgp_contrato_id: string; criada_em: string; motivo: string | null }>(
    [...new Set(servicosBase.map((o) => o.sgp_contrato_id!))],
    (lote) => admin.from("os_tecnicas").select("sgp_os_id, sgp_contrato_id, criada_em, motivo").in("motivo", MOTIVOS_SUPORTE).gte("criada_em", inicioDoDia(ini14)).in("sgp_contrato_id", lote)
  );
  // o retorno pelo Fortics também só conta se a ocorrência foi para um gestor técnico
  const forticsNovas = novasTodas.filter((n) => /fortics/i.test(n.motivo ?? "")).map((n) => String(n.sgp_os_id));
  const ocNovas = new Map(
    (await emLotes<{ sgp_os_id: string; tipo: string | null; responsavel: string | null }>(forticsNovas, (lote) => admin.from("ocorrencias_sgp").select("sgp_os_id, tipo, responsavel").in("sgp_os_id", lote))).map((o) => [String(o.sgp_os_id), o])
  );
  const novasSuporte = novasTodas.filter((n) => {
    const oc = ocNovas.get(String(n.sgp_os_id));
    return forticsConta(n.motivo, oc?.tipo, oc?.responsavel);
  });
  const suportePorContrato = new Map<string, { id: string; criada: number }[]>();
  for (const n of novasSuporte) {
    const l = suportePorContrato.get(n.sgp_contrato_id) ?? [];
    l.push({ id: String(n.sgp_os_id), criada: Date.parse(n.criada_em) });
    suportePorContrato.set(n.sgp_contrato_id, l);
  }
  const servicos: BaseTecnico["servicos"] = servicosBase.map((o) => {
    const fim = Date.parse(o.encerrada_em);
    const voltou = (suportePorContrato.get(o.sgp_contrato_id!) ?? []).some((n) => n.id !== String(o.sgp_os_id) && n.criada > fim && n.criada <= fim + 7 * 86_400_000);
    return { unidade: contratos.get(o.sgp_contrato_id!)?.unidade ?? unidadeDoPop(o.pop), atendidaEm: o.encerrada_em, retornou: voltou };
  });

  // agenda: OS de campo agendadas na semana e na anterior, com o técnico designado (sem o atendimento pelo Fortics)
  const agendadas = await paginado<{ responsavel: string | null; pop: string | null; agendamento: string; checkin: string | null; status: string | null }>((de, a) =>
    admin
      .from("os_tecnicas")
      .select("responsavel, pop, agendamento, checkin, status")
      .in("motivo", MOTIVOS_CAMPO.filter((m) => m !== "Atendimento Fortics"))
      .gte("agendamento", inicioDoDia(ini7))
      .lte("agendamento", fimDoDia(ate))
      .order("agendamento")
      .range(de, a)
  );

  return {
    agendadas: agendadas.map((x) => ({ unidade: unidadeDoPop(x.pop), tecnico: x.responsavel, agendamento: x.agendamento, checkin: x.checkin, status: x.status })),
    ativacoes: ativados.map((c) => ({ dia: String(c.data_ativacao).slice(0, 10), unidade: unidadeDoPop(c.pops?.nome) })),
    instalacoes: ativados.map((c) => ({
      unidade: unidadeDoPop(c.pops?.nome),
      diaAtivacao: String(c.data_ativacao).slice(0, 10),
      ativadoEm: c.ativado_em,
      direcionadaEm: c.sgp_contrato_id ? direcionamento.get(c.sgp_contrato_id) ?? null : null,
    })),
    suporte,
    mudancas,
    servicos,
    // estoques: só fazem sentido agora (semana em andamento ou fechamento de segunda)
    estoques: hoje <= somarDias(semana.fim, 1) ? await lerEstoques(admin) : null,
  };
}

/** estoques de agora, pelas mesmas regras do quadro da Operação Técnica */
export async function lerEstoques(admin: Admin = criarClienteAdmin()): Promise<NonNullable<BaseTecnico["estoques"]>> {
  const agora = Date.now();
  const quadro = await dadosOperacao(agora);
  const agendamentosVencidos: Contagem = {};
  const faltaValidar: Contagem = {};
  const contar = (c: Contagem, u: string) => {
    if ((UNIDADES_TECNICO as readonly string[]).includes(u)) c[u as UnidadeTecnico] = (c[u as UnidadeTecnico] ?? 0) + 1;
  };
  for (const c of quadro.cartoes) {
    if (c.coluna === "agendada" && c.agendamento && Date.parse(c.agendamento) < agora) contar(agendamentosVencidos, c.unidade);
    const feitoEm = c.osEncerradaEm ?? c.checkin;
    if (c.coluna === "validar" && feitoEm && Date.parse(feitoEm) < agora - 86_400_000) contar(faltaValidar, c.unidade);
  }
  const abertas = await paginado<{ contrato_id: string; contratos: { status: string; pops: { nome: string | null } | null } | null }>((de, a) =>
    admin.from("os_instalacao").select("contrato_id, contratos!inner(status, pops(nome))").eq("situacao", "aberta").in("contratos.status", ["ativo", "suspenso"]).order("contrato_id").range(de, a)
  );
  const osParaBaixar: Contagem = {};
  const vistos = new Set<string>();
  for (const o of abertas) {
    if (vistos.has(o.contrato_id)) continue;
    vistos.add(o.contrato_id);
    const u = unidadeDoPop(o.contratos?.pops?.nome);
    if (u) osParaBaixar[u] = (osParaBaixar[u] ?? 0) + 1;
  }
  const medidoEm = new Date(agora - 3 * 3_600_000).toISOString();
  return { agendamentosVencidos, faltaValidar, osParaBaixar, medidoEm: `${medidoEm.slice(8, 10)}/${medidoEm.slice(5, 7)} ${medidoEm.slice(11, 16)}` };
}

/** dias de expediente do mês da semana, da semana inteira e da semana até hoje */
export async function expedienteDaSemana(semana: Semana, hoje: string): Promise<{ mes: number; semana: number; ateHoje: number }> {
  const mes = mesDeReferencia(semana);
  const de = mes.de < semana.inicio ? mes.de : semana.inicio;
  const ate = mes.ate > semana.fim ? mes.ate : semana.fim;
  const ehExpediente = await carregarDiasUteis(de, ate);
  const contar = (a: string, b: string) => {
    let n = 0;
    for (let d = a; d <= b; d = somarDias(d, 1)) if (ehExpediente(d)) n++;
    return n;
  };
  return { mes: contar(mes.de, mes.ate), semana: contar(semana.inicio, semana.fim), ateHoje: contar(semana.inicio, semana.fim <= hoje ? semana.fim : hoje) };
}

/** metas do setor técnico */
export async function lerMetasTecnico(admin: Admin = criarClienteAdmin()): Promise<{ disponivel: boolean; metas: MetaGrr[] }> {
  const { data, error } = await admin
    .from("grr_metas")
    .select("id, indicador, escopo_tipo, escopo_ref, vigente_desde, meta, limite_atencao, observacao, criado_em, criado_por")
    .eq("empresa", EMPRESA_GRR)
    .eq("setor", SETOR_TECNICO)
    .order("criado_em", { ascending: false })
    .limit(1000);
  if (error) return { disponivel: false, metas: [] };
  return {
    disponivel: true,
    metas: (data ?? []).map((m) => ({
      ...(m as unknown as MetaGrr),
      vigente_desde: String(m.vigente_desde).slice(0, 10),
      meta: m.meta == null ? null : Number(m.meta),
      limite_atencao: m.limite_atencao == null ? null : Number(m.limite_atencao),
    })),
  };
}

/** recortes do setor técnico: a empresa e as três unidades (pelo id do POP, como no comercial) */
export async function recortesTecnico(admin: Admin = criarClienteAdmin()): Promise<RecorteTecnico[]> {
  const { data } = await admin.from("pops").select("id, nome");
  const recortes: RecorteTecnico[] = [{ tipo: "empresa", unidade: null, chave: { tipo: "empresa", ref: null }, rotulo: "Empresa" }];
  for (const u of UNIDADES_TECNICO) {
    const pop = (data ?? []).find((p) => unidadeDoPop(String(p.nome)) === u);
    if (pop) recortes.push({ tipo: "unidade", unidade: u, chave: { tipo: "unidade", ref: String(pop.id) }, rotulo: u });
  }
  return recortes;
}
