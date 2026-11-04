import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { todas } from "@/lib/performance/dados/paginar";
import { carregarDiasUteis } from "@/lib/performance/config-servidor";
import {
  ALERTA_ATIVACAO_DIAS,
  ativacoesPendentes,
  ehVendaContavel,
  pendentesAssinatura,
  tempoMedioVendaAtivacao,
  type ContratoIndicador,
} from "@/lib/indicadores/regras";
import { filaDebito } from "@/lib/prevencao/dados";
import { refidelizacaoDoMes } from "@/lib/refidelizacao/dados";
import { familiaPlano } from "@/lib/sgp/fidelidade";
import { ROTULO_ORIGEM, type CategoriaOrigem } from "@/lib/tipos";
import { diasDaSemana, diasEntre, hojeSantarem, mesAnterior, mesDeReferencia, semanaAnterior, somarDias, type Semana } from "./periodo";
import type { DadosRelatorio, FaixaDebito, LinhaDistribuicao, LinhaVendedor } from "./tipos";
import { num, plural, reais } from "./formato";

/**
 * Números do Relatório Comercial Semanal, lidos com a service role (o
 * relatório também é gerado por rotina, sem sessão) e com a mesma régua das
 * telas:
 *  - venda = regra 5.1 do Dashboard (`ehVendaContavel`) pela data da venda;
 *  - Prefeitura e rede neutra ficam fora das vendas do comercial (decisão do
 *    Paulo, 24/10/2026) e aparecem à parte;
 *  - meta do mês = a do Dashboard (global; senão, a soma das unidades);
 *  - dias de expediente = tabela calendario (segunda a sábado sem feriado
 *    quando o dia não está cadastrado);
 *  - sem consulta = mesma conta da tela Vendedoras (ticket convertido sem o
 *    score da Consult Center), com o fuso de Santarém;
 *  - assinatura e instalação = mesmas regras da Esteira (5.7 e 5.8, OS
 *    aberta no SGP), todas as páginas (as telas cortam em 1.000 linhas);
 *  - base = crescimento_base (o card do Dashboard); fila = Prevenção.
 */

/** meta do ano (Dashboard, decisão de 30/09/2026) */
export const META_ATIVOS = { meta: 10_000, prazo: "2026-12-31" };

const SETORES_VENDA = ["comercial_interno", "comercial_externo", "corporativo"];
const ROTULO_SETOR_CURTO: Record<string, string> = { comercial_interno: "interno", comercial_externo: "externo", corporativo: "corporativo" };

type Bruto = ContratoIndicador & {
  id: string;
  sgp_contrato_id: string | null;
  origem_cadastro: string | null;
  vendedor_id: string | null;
  pop_id: string | null;
  clientes: { nome: string | null } | null;
  planos: { nome: string | null } | null;
};

const CAMPOS =
  "id, sgp_contrato_id, data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, desistencia_em, assinatura_dispensada, valor_mensalidade, origem_cadastro, vendedor_id, pop_id, clientes(nome), planos(nome)";

/**
 * Prefeitura e rede neutra não são vendas do time comercial (24/10/2026).
 * Escolas e conselhos escolares continuam; não filtrar por "MUNIC" (pega
 * "TELECOMUNICAÇÕES").
 */
export function foraDasVendas(cliente: string | null | undefined, plano: string | null | undefined): "Prefeitura" | "rede neutra" | null {
  const p = String(plano ?? "").toUpperCase();
  const c = String(cliente ?? "").toUpperCase();
  if (p.includes("REDE NEUTRA")) return "rede neutra";
  if (/PREFEITURA MUNICIPAL|SECRETARIA MUNICIPAL|FUNDO MUNICIPAL/.test(c) || p.startsWith("PREF ATM") || p.includes("SEMED")) return "Prefeitura";
  return null;
}

const entre = (d: string | null | undefined, de: string, ate: string) => !!d && d >= de && d <= ate;
const numero = (v: unknown) => Number(v ?? 0) || 0;

function distribuicao(semana: Bruto[], mes: Bruto[], chave: (c: Bruto) => string): LinhaDistribuicao[] {
  const m = new Map<string, LinhaDistribuicao>();
  const linha = (nome: string) => m.get(nome) ?? (m.set(nome, { nome, semana: 0, mes: 0 }), m.get(nome)!);
  for (const c of semana) linha(chave(c)).semana++;
  for (const c of mes) linha(chave(c)).mes++;
  return [...m.values()].sort((a, b) => b.semana - a.semana || b.mes - a.mes || a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function montarDados(semana: Semana, anterior: DadosRelatorio | null): Promise<Omit<DadosRelatorio, "placar">> {
  const admin = criarClienteAdmin();
  const hoje = hojeSantarem();
  const mes = mesDeReferencia(semana);
  const ma = mesAnterior(mes, semana.fim);
  const sa = semanaAnterior(semana);
  const fimMes = mes.fechado ? mes.ate : semana.fim;

  const [vendasBrutas, pendencias, osAbertas, ativadas, cancelados, metas, vendedores, pops, tickets, base, fila, diaUtil] = await Promise.all([
    todas<Bruto>((de, ate) => admin.from("contratos").select(CAMPOS).gte("data_venda", ma.de).lte("data_venda", semana.fim).order("id").range(de, ate)),
    // estoque de pendências (todas as vendas, como "ver todas" da Esteira)
    todas<Bruto>((de, ate) =>
      admin.from("contratos").select(CAMPOS).neq("status", "cancelado").or("data_assinatura.is.null,data_ativacao.is.null").order("id").range(de, ate)
    ),
    todas<{ sgp_os_id: string; contratos: Bruto | null }>((de, ate) =>
      admin.from("os_instalacao").select(`sgp_os_id, contratos!inner(${CAMPOS})`).eq("situacao", "aberta").order("sgp_os_id").range(de, ate)
    ),
    todas<Bruto>((de, ate) => admin.from("contratos").select(CAMPOS).gte("data_ativacao", semana.inicio).lte("data_ativacao", semana.fim).order("id").range(de, ate)),
    todas<{ sgp_contrato_id: string; status_anterior: string | null }>((de, ate) =>
      admin.from("cancelamentos_sgp").select("sgp_contrato_id, status_anterior").gte("data_cancelamento", semana.inicio).lte("data_cancelamento", semana.fim).order("sgp_contrato_id").range(de, ate)
    ),
    admin.from("metas").select("escopo, referencia_id, quantidade_vendas").eq("mes_ano", mes.de).then((r) => r.data ?? []),
    admin.from("vendedores").select("id, nome, pop_id, setor, ativo, eh_coordenador").then((r) => r.data ?? []),
    admin.from("pops").select("id, nome").then((r) => r.data ?? []),
    todas<{ vendedor_id: string | null; score: number | null; score_origem: string | null; fechado_em: string }>((de, ate) =>
      admin
        .from("tickets")
        .select("id, vendedor_id, score, score_origem, fechado_em")
        .eq("etapa", "fechado")
        .eq("desfecho", "convertido")
        .gte("fechado_em", `${mes.de < semana.inicio ? mes.de : semana.inicio}T00:00:00-03:00`)
        .lte("fechado_em", `${semana.fim > fimMes ? semana.fim : fimMes}T23:59:59-03:00`)
        .order("id")
        .range(de, ate)
    ),
    admin.from("crescimento_base").select("mes, unidade, ativos, suspensos").order("mes").then((r) => r.data ?? []),
    filaDebito(),
    carregarDiasUteis(mes.de < semana.inicio ? mes.de : semana.inicio, mes.ate > semana.fim ? mes.ate : semana.fim),
  ]);

  const nomePop = new Map(pops.map((p) => [p.id as string, String(p.nome)]));
  const vend = new Map(vendedores.map((v) => [v.id as string, v]));
  const fora = (c: Bruto) => foraDasVendas(c.clientes?.nome, c.planos?.nome);

  // ---------------- vendas
  const contaveis = vendasBrutas.filter(ehVendaContavel);
  const doComercial = contaveis.filter((c) => !fora(c));
  const vSemana = doComercial.filter((c) => entre(c.data_venda, semana.inicio, semana.fim));
  const vSemanaAnt = doComercial.filter((c) => entre(c.data_venda, sa.inicio, sa.fim));
  const vMes = doComercial.filter((c) => entre(c.data_venda, mes.de, fimMes));
  const vMesAnt = doComercial.filter((c) => entre(c.data_venda, ma.de, ma.ate));
  const receita = (l: Bruto[]) => l.reduce((t, c) => t + numero(c.valor_mensalidade), 0);
  const ticket = (l: Bruto[]) => (l.length ? receita(l) / l.length : null);
  const foraSemana = contaveis.filter((c) => fora(c) && entre(c.data_venda, semana.inicio, semana.fim));
  const foraMes = contaveis.filter((c) => fora(c) && entre(c.data_venda, mes.de, fimMes));

  // meta do mês como no Dashboard: global; senão, soma das unidades (meta da
  // unidade ou, sem ela, a soma das vendedoras ativas sem coordenadores)
  const metaVend = new Map(metas.filter((m) => m.escopo === "vendedora").map((m) => [m.referencia_id as string, numero(m.quantidade_vendas)]));
  const global = metas.find((m) => m.escopo === "global");
  let metaMes: number | null = global ? numero(global.quantidade_vendas) : null;
  if (metaMes == null) {
    let soma = 0;
    let achou = false;
    for (const p of pops) {
      const mp = metas.find((m) => m.escopo === "pop" && m.referencia_id === p.id);
      if (mp) {
        soma += numero(mp.quantidade_vendas);
        achou = true;
        continue;
      }
      for (const v of vendedores) {
        if (v.pop_id === p.id && v.ativo && !v.eh_coordenador && metaVend.has(v.id as string)) {
          soma += metaVend.get(v.id as string)!;
          achou = true;
        }
      }
    }
    metaMes = achou && soma > 0 ? soma : null;
  }
  const diasMes: string[] = [];
  for (let d = mes.de; d <= mes.ate; d = somarDias(d, 1)) diasMes.push(d);
  const diasExpedienteMes = diasMes.filter(diaUtil).length;
  const diasExpedienteDecorridos = diasMes.filter((d) => d <= fimMes && diaUtil(d)).length;
  const porDia = diasDaSemana(semana).map((d) => ({
    data: d.data,
    rotulo: d.rotulo,
    vendas: vSemana.filter((c) => c.data_venda === d.data).length,
    expediente: diaUtil(d.data),
  }));

  // sem consulta (tela Vendedoras): convertido sem o score da Consult Center
  const semConsulta = (t: { score: number | null; score_origem: string | null }) => t.score === null || t.score_origem !== "consulta";
  const diaDoTicket = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10);
  const tSemana = tickets.filter((t) => t.vendedor_id && semConsulta(t) && entre(diaDoTicket(t.fechado_em), semana.inicio, semana.fim));
  const tMes = tickets.filter((t) => t.vendedor_id && semConsulta(t) && entre(diaDoTicket(t.fechado_em), mes.de, fimMes));

  const porVendedor: LinhaVendedor[] = [];
  for (const v of vendedores) {
    const id = v.id as string;
    const semanaV = vSemana.filter((c) => c.vendedor_id === id);
    const mesV = vMes.filter((c) => c.vendedor_id === id);
    const metaV = metaVend.get(id) ?? null;
    const vendeu = semanaV.length > 0 || mesV.length > 0;
    const doTime = v.ativo && SETORES_VENDA.includes(String(v.setor)) && !v.eh_coordenador;
    if (!vendeu && !doTime && !metaV) continue;
    porVendedor.push({
      nome: String(v.nome),
      praca: v.pop_id ? nomePop.get(v.pop_id as string) ?? null : null,
      setor: ROTULO_SETOR_CURTO[String(v.setor)] ?? null,
      vendasSemana: semanaV.length,
      ticketSemana: ticket(semanaV),
      semConsultaSemana: tSemana.filter((t) => t.vendedor_id === id).length,
      vendasMes: mesV.length,
      metaMes: metaV,
    });
  }

  const nomeVendedor = (c: Bruto) => (c.vendedor_id ? String(vend.get(c.vendedor_id)?.nome ?? "") || null : null);

  // ---------------- assinatura (5.8) e instalação (5.7 + OS aberta, D9)
  const pendSemana = pendentesAssinatura(vSemana, hoje).map((p) => {
    const c = p.contrato as Bruto;
    return { contrato: c.sgp_contrato_id ?? c.id.slice(0, 8), vendedor: nomeVendedor(c), idadeDias: p.idadeDias };
  });
  const pendenciasComercial = pendencias.filter((c) => !fora(c));
  const antigasSemAssinar = pendentesAssinatura(pendenciasComercial.filter((c) => c.data_venda < semana.inicio), hoje).length;

  const aguardando = new Map<string, { c: Bruto; idade: number }>();
  for (const os of osAbertas) {
    const c = os.contratos;
    if (!c || fora(c)) continue;
    aguardando.set(c.id, { c, idade: diasEntre(c.data_venda, hoje) });
  }
  for (const p of ativacoesPendentes(pendenciasComercial, hoje)) {
    const c = p.contrato as Bruto;
    if (!aguardando.has(c.id)) aguardando.set(c.id, { c, idade: p.idadeDias });
  }
  const itensAguardando = [...aguardando.values()];
  const recentes = somarDias(hoje, -60);

  // ---------------- base (o card do Dashboard: a linha mais recente de cada
  // unidade). No começo do mês os suspensos por débito sobem e os ativos
  // caem — por isso os suspensos e o fechamento do mês anterior vão junto.
  const UNIDADES = ["Altamira", "Vitória do Xingu", "Brasil Novo"];
  const ultimaPorUnidade = new Map<string, { mes: string; ativos: number; suspensos: number }>();
  for (const b of base) ultimaPorUnidade.set(String(b.unidade), { mes: String(b.mes).slice(0, 10), ativos: numero(b.ativos), suspensos: numero(b.suspensos) }); // ordem por mês: fica a mais recente
  const porPraca = UNIDADES.filter((u) => ultimaPorUnidade.has(u)).map((u) => ({ nome: u, ativos: ultimaPorUnidade.get(u)!.ativos, suspensos: ultimaPorUnidade.get(u)!.suspensos }));
  const ativos = porPraca.reduce((t, p) => t + p.ativos, 0);
  const suspensos = porPraca.reduce((t, p) => t + p.suspensos, 0);
  const mesAtualBase = [...ultimaPorUnidade.values()].map((x) => x.mes).sort().at(-1) ?? null;
  const mesFechado = mesAtualBase ? new Date(Date.UTC(Number(mesAtualBase.slice(0, 4)), Number(mesAtualBase.slice(5, 7)) - 2, 1)).toISOString().slice(0, 10) : null;
  const linhasFechadas = base.filter((b) => String(b.mes).slice(0, 10) === mesFechado && UNIDADES.includes(String(b.unidade)));
  const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const fechamento =
    mesFechado && linhasFechadas.length === UNIDADES.length
      ? {
          mes: NOMES_MES[Number(mesFechado.slice(5, 7)) - 1],
          ativos: linhasFechadas.reduce((t, b) => t + numero(b.ativos), 0),
          suspensos: linhasFechadas.reduce((t, b) => t + numero(b.suspensos), 0),
        }
      : null;

  // ---------------- fila de débito (Prevenção)
  const agora = Date.now();
  const contatados7d = fila.filter((l) => l.contato && agora - Date.parse(l.contato.em) <= 7 * 86_400_000).length;
  const FAIXAS: [string, number, number][] = [
    ["16 a 30 dias", 16, 30],
    ["31 a 60 dias", 31, 60],
    ["61 a 90 dias", 61, 90],
    ["Mais de 90 dias", 91, Number.MAX_SAFE_INTEGER],
  ];
  const faixas: FaixaDebito[] = FAIXAS.map(([faixa, de, ate]) => {
    const l = fila.filter((x) => x.diasAtraso >= de && x.diasAtraso <= ate);
    return { faixa, clientes: l.length, valor: l.reduce((t, x) => t + x.valor, 0) };
  });

  // ---------------- refidelização (aditivos válidos das agentes)
  const meses = [...new Set([mes.de, `${semana.fim.slice(0, 7)}-01`, `${semana.inicio.slice(0, 7)}-01`])];
  const refis = await Promise.all(meses.map((m) => refidelizacaoDoMes(m)));
  const nomesAgentes = new Map<string, string>();
  for (const r of refis) for (const a of r.agentes) nomesAgentes.set(a.agente, a.nome ?? a.agente);
  const refMes = refis[0];
  const refidelizacao = [...nomesAgentes].map(([agente, nome]) => {
    const linhasSemana = refis.flatMap((r) => r.agentes.filter((a) => a.agente === agente).flatMap((a) => a.linhas)).filter((l) => l.conta && entre(l.data, semana.inicio, semana.fim));
    const doMes = refMes.agentes.find((a) => a.agente === agente);
    return {
      nome,
      semana: linhasSemana.length,
      mes: doMes?.validos ?? 0,
      receitaSemana: linhasSemana.reduce((t, l) => t + l.valorMensal, 0),
      receitaMes: doMes?.vtv ?? 0,
    };
  });

  // ---------------- o que conferir no sistema (inconsistências dos dados)
  const conferir: string[] = [];
  const semVendSemana = vSemana.filter((c) => !c.vendedor_id);
  if (semVendSemana.length)
    conferir.push(
      `${plural(semVendSemana.length, "venda da semana está", "vendas da semana estão")} sem vendedor no SGP (${semVendSemana.map((c) => `#${c.sgp_contrato_id}`).join(", ")}): somam no total, mas não em ninguém.`
    );
  const foraPendentes = pendentesAssinatura(foraSemana, hoje).filter((p) => p.alerta);
  for (const p of foraPendentes) {
    const c = p.contrato as Bruto;
    conferir.push(`Contrato #${c.sgp_contrato_id} (${fora(c)}, ${reais(numero(c.valor_mensalidade))}) segue sem assinatura há ${plural(p.idadeDias, "dia", "dias")}. Fica fora das vendas do comercial.`);
  }
  const ativadosSemAssinar = pendenciasComercial.filter((c) => c.data_assinatura === null && !c.assinatura_dispensada && c.data_ativacao !== null && c.data_venda >= somarDias(hoje, -60));
  if (ativadosSemAssinar.length)
    conferir.push(
      `${plural(ativadosSemAssinar.length, "contrato aparece", "contratos aparecem")} como instalado e ainda sem assinatura (${ativadosSemAssinar.slice(0, 6).map((c) => `#${c.sgp_contrato_id}`).join(", ")}${ativadosSemAssinar.length > 6 ? "…" : ""}).`
    );
  const filaSuspeita = fila.filter((l) => /TESTE/i.test(l.cliente) || l.diasAtraso > 365);
  if (filaSuspeita.length)
    conferir.push(
      `Fila de débito: ${plural(filaSuspeita.length, "registro parece", "registros parecem")} cadastro de teste ou atraso de mais de um ano (${filaSuspeita.slice(0, 4).map((l) => `#${l.sgpContratoId}, ${num(l.diasAtraso)} dias`).join("; ")}${filaSuspeita.length > 4 ? "…" : ""}). Limpar a fila deixa o número real.`
    );
  if (metaMes == null) conferir.push(`Não há meta de vendas cadastrada para ${mes.nome}: sem ela não há ritmo nem cobrança por vendedor.`);
  if (refMes.totais.validos === 0 && diasExpedienteDecorridos >= 5)
    conferir.push(`Refidelização zerada em ${mes.nome}: nenhum aditivo válido das agentes. Conferir se a leitura dos aditivos do SGP está rodando.`);
  const varBase = anterior ? ativos - anterior.base.ativos : null;
  const ativacoesSemana = ativadas.length;
  const cancelamentosSemana = cancelados.filter((c) => /^(ativo|suspenso)$/i.test(String(c.status_anterior ?? ""))).length;
  if (varBase != null && varBase > ativacoesSemana)
    conferir.push(`A base subiu ${num(varBase)} com ${plural(ativacoesSemana, "ativação", "ativações")} na semana: há reativação ou ajuste de cadastro no número de ativos.`);
  if (!porPraca.length) conferir.push("A base de ativos não foi lida do SGP (crescimento_base vazio).");
  if (fechamento && fechamento.ativos - ativos >= 50 && suspensos - fechamento.suspensos >= 0.6 * (fechamento.ativos - ativos))
    conferir.push(
      `A base tem ${num(fechamento.ativos - ativos)} ativos a menos que no fechamento de ${fechamento.mes} (${num(fechamento.ativos)}), e os suspensos subiram de ${num(fechamento.suspensos)} para ${num(suspensos)}: é o ciclo de cobrança do começo do mês, não cancelamento. Quem paga volta para os ativos.`
    );

  return {
    versao: 1,
    leitura: { semana, mes, mesAnterior: { mes: ma.mes, nome: ma.nome }, lidoEm: new Date().toISOString() },
    vendas: {
      semana: vSemana.length,
      semanaAnterior: vSemanaAnt.length,
      porDia,
      metaDiaria: metaMes && diasExpedienteMes ? metaMes / diasExpedienteMes : null,
      receitaSemana: receita(vSemana),
      ticketSemana: ticket(vSemana),
      ticketSemanaAnterior: ticket(vSemanaAnt),
      mes: vMes.length,
      receitaMes: receita(vMes),
      ticketMes: ticket(vMes),
      metaMes,
      diasExpedienteMes,
      diasExpedienteDecorridos,
      mesAnterior: vMesAnt.length,
      receitaMesAnterior: receita(vMesAnt),
      porVendedor,
      semVendedorSemana: semVendSemana.length,
      semVendedorMes: vMes.filter((c) => !c.vendedor_id).length,
      semVendedorContratos: semVendSemana.map((c) => String(c.sgp_contrato_id ?? "")),
      fora: {
        semana: foraSemana.map((c) => ({ contrato: String(c.sgp_contrato_id ?? ""), tipo: fora(c)!, valor: numero(c.valor_mensalidade) })),
        mes: foraMes.length,
        receitaMes: receita(foraMes),
        mesPorTipo: foraMes.reduce<Record<string, number>>((m, c) => ((m[fora(c)!] = (m[fora(c)!] ?? 0) + 1), m), {}),
      },
      porPraca: distribuicao(vSemana, vMes, (c) => (c.pop_id ? nomePop.get(c.pop_id) ?? "Sem praça" : "Sem praça")).sort((a, b) => b.mes - a.mes),
      mix: distribuicao(vSemana, vMes, (c) => familiaPlano(c.planos?.nome)),
      origem: distribuicao(vSemana, vMes, (c) => ROTULO_ORIGEM[(c.origem_cadastro ?? "outro") as CategoriaOrigem] ?? "Outro"),
    },
    consulta: { vendasSemana: vSemana.length, semConsultaSemana: Math.min(tSemana.length, vSemana.length), semConsultaMes: Math.min(tMes.length, vMes.length) },
    assinatura: {
      pendentesSemana: pendSemana,
      acima48hSemana: pendSemana.filter((p) => p.idadeDias >= 2).length,
      antigasSemAssinar,
    },
    esteira: {
      ativacoesSemana,
      cancelamentosSemana,
      diasVendaAtivacao: tempoMedioVendaAtivacao(ativadas),
      aguardandoSemana: itensAguardando.filter((i) => entre(i.c.data_venda, semana.inicio, semana.fim)).length,
      paradasMais7Dias: itensAguardando.filter((i) => i.c.data_venda >= recentes && i.idade > ALERTA_ATIVACAO_DIAS).length,
      antigasAguardando: itensAguardando.filter((i) => i.c.data_venda < semana.inicio).length,
    },
    base: {
      ativos,
      suspensos,
      porPraca,
      fechamento,
      meta: META_ATIVOS.meta,
      prazo: META_ATIVOS.prazo,
      diasRestantes: Math.max(0, diasEntre(hoje, META_ATIVOS.prazo)),
      faltam: META_ATIVOS.meta - ativos,
      ativosAnterior: anterior?.base.ativos ?? null,
      porPracaAnterior: anterior?.base.porPraca ?? null,
    },
    debito: {
      clientes: fila.length,
      emRisco: fila.reduce((t, l) => t + l.valor, 0),
      emAberto: fila.reduce((t, l) => t + l.valorAberto, 0),
      boletos: fila.reduce((t, l) => t + l.boletos, 0),
      contatados7d,
      faixas,
      anterior: anterior ? { clientes: anterior.debito.clientes, emRisco: anterior.debito.emRisco, faixas: anterior.debito.faixas } : null,
    },
    refidelizacao,
    conferir,
  };
}
