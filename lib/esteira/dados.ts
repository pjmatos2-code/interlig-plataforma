import { criarClienteServidor } from "@/lib/supabase/server";
import {
  vendasDoPeriodo,
  ativacoesPendentes,
  pendentesAssinatura,
  taxaInstalacaoEfetiva,
  tempoMedioVendaAtivacao,
  ALERTA_ATIVACAO_DIAS,
  ALERTA_ASSINATURA_DIAS,
  type ContratoIndicador,
} from "@/lib/indicadores/regras";
import { hojeIso, type Periodo } from "@/lib/datas";

export type ItemEsteira = {
  id: string;
  sgpClienteId: string | null;
  sgpContratoId: string | null;
  cpf: string | null;
  cliente: string;
  vendedora: string;
  pop: string;
  plano: string;
  valor: number;
  dataVenda: string;
  idadeDias: number;
  alerta: boolean;
  /** OS de instalação do SGP (só na coluna aguardando instalação) */
  temOs: boolean;
  /** filtro de entrada (17/09/2026): pendência de score/adiantamento do ticket */
  scoreSituacao?: "sem_score" | "adiantamento_pendente" | null;
  adiantamentoValor?: number | null;
  agendamento: string | null;
  responsavel: string | null;
  prontaOperacional: boolean;
};

export type DadosEsteira = {
  hoje: string;
  kpis: {
    pendentesAssinatura: { total: number; emAlerta: number };
    aguardandoInstalacao: { total: number; emAlerta: number };
    taxaInstalacao: { taxa: number | null; base: number; instaladas: number };
    tempoMedioDias: number | null;
    instaladasNoPeriodo: number;
  };
  colunas: {
    pendenteAssinatura: ItemEsteira[];
    aguardandoInstalacao: ItemEsteira[];
    instaladas: ItemEsteira[];
  };
  tempoPorPop: { nome: string; dias: number; ativacoes: number }[];
  tempoPorVendedora: { nome: string; dias: number; ativacoes: number }[];
  // assinaturas pendentes agrupadas por vendedora (ajuste do gestor)
  assinaturaPorVendedora: { vendedora: string; total: number; emAlerta: number }[];
  /** pendências de vendas ANTERIORES ao período filtrado (não somem da vista) */
  foraDoPeriodo: { assinatura: number; instalacao: number };
};

type Bruto = ContratoIndicador & {
  id: string;
  sgp_contrato_id: string | null;
  vendedor_id: string | null;
  pop_id: string | null;
  clientes: { nome: string; sgp_cliente_id: string | null; cpf: string | null } | null;
  planos: { nome: string } | null;
  vendedores: { nome: string } | null;
  pops: { nome: string } | null;
};

const CAMPOS =
  "id, sgp_contrato_id, data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, desistencia_em, assinatura_dispensada, valor_mensalidade, vendedor_id, pop_id, clientes(nome, sgp_cliente_id, cpf), planos(nome), vendedores(nome), pops(nome)";

function dias(deIso: string, ateIso: string) {
  return Math.round(
    (Date.parse(`${ateIso}T00:00:00Z`) - Date.parse(`${deIso}T00:00:00Z`)) / 86_400_000
  );
}

/**
 * Esteira de Ativação (PRD 3.5). O kanban mostra o ESTOQUE atual de pendências
 * (independe do filtro de data); taxa de instalação (5.9), tempo médio e
 * "instaladas" seguem o período filtrado. RLS limita o escopo por perfil.
 */
export async function carregarEsteira(
  periodo: Periodo,
  popId: string | null,
  /** true = ignora o período e mostra TODAS as pendências (link "ver todas") */
  todasAsPendencias = false
): Promise<DadosEsteira> {
  const supabase = criarClienteServidor();
  const hoje = hojeIso();

  // pendências: estoque atual por padrão; na busca por período, só as vendas
  // feitas dentro do intervalo selecionado
  let consultaPendencias = supabase
    .from("contratos")
    .select(CAMPOS)
    .neq("status", "cancelado")
    .or("data_assinatura.is.null,data_ativacao.is.null")
    .limit(3000);
  if (popId) consultaPendencias = consultaPendencias.eq("pop_id", popId);

  // vendas do período (para 5.9) e ativações do período (tempo médio + coluna)
  let consultaVendas = supabase
    .from("contratos")
    .select(CAMPOS)
    .gte("data_venda", periodo.de)
    .lte("data_venda", periodo.ate)
    .limit(3000);
  if (popId) consultaVendas = consultaVendas.eq("pop_id", popId);

  let consultaAtivadas = supabase
    .from("contratos")
    .select(CAMPOS)
    .gte("data_ativacao", periodo.de)
    .lte("data_ativacao", periodo.ate)
    .limit(3000);
  if (popId) consultaAtivadas = consultaAtivadas.eq("pop_id", popId);

  // OS de instalação abertas no SGP (start do operacional — decisão D9)
  let consultaOs = supabase
    .from("os_instalacao")
    .select(`sgp_os_id, responsavel, agendamento, contratos!inner(${CAMPOS})`)
    .eq("situacao", "aberta")
    .limit(500);
  if (popId) consultaOs = consultaOs.eq("contratos.pop_id", popId);

  const [{ data: pendenciasBrutas }, { data: vendasBrutas }, { data: ativadasBrutas }, { data: osBrutas }] =
    await Promise.all([consultaPendencias, consultaVendas, consultaAtivadas, consultaOs]);

  const pendencias = (pendenciasBrutas ?? []) as unknown as Bruto[];
  const vendas = (vendasBrutas ?? []) as unknown as Bruto[];
  const ativadas = (ativadasBrutas ?? []) as unknown as Bruto[];

  const paraItem = (c: Bruto, idadeDias: number, alerta: boolean): ItemEsteira => ({
    id: c.id,
    sgpClienteId: c.clientes?.sgp_cliente_id ?? null,
    sgpContratoId: c.sgp_contrato_id,
    cpf: c.clientes?.cpf ?? null,
    cliente: c.clientes?.nome ?? "—",
    vendedora: c.vendedores?.nome ?? "Não atribuída",
    pop: c.pops?.nome ?? "—",
    plano: c.planos?.nome ?? "—",
    valor: c.valor_mensalidade,
    dataVenda: c.data_venda,
    idadeDias,
    alerta,
    temOs: false,
    agendamento: null,
    responsavel: null,
    prontaOperacional: false,
  });

  // D9: OS com responsável atribuído = apta para instalação (start do
  // operacional). No painel quem atribui é José Galdino / Aline Santos
  // (Railson Costa em VTX); a API expõe o técnico designado — a presença
  // dele é o sinal de que o start foi dado.
  const ehStart = (r: string | null) => (r ?? "").trim() !== "";

  // 5.8 — sem assinatura; idade desde a venda; alerta ≥ 48h
  // ordem: mais recentes no topo, mais atrasados no fim (pedido do gestor)
  const noPeriodo = (i: ItemEsteira) =>
    todasAsPendencias || (i.dataVenda >= periodo.de && i.dataVenda <= periodo.ate);
  const semAssinaturaTudo = pendentesAssinatura(pendencias, hoje)
    .map((p) => paraItem(p.contrato as Bruto, p.idadeDias, p.alerta))
    .sort((a, b) => a.idadeDias - b.idadeDias);
  const semAssinatura = semAssinaturaTudo.filter(noPeriodo);

  // 5.7 — aguardando instalação = OS de instalação ABERTA no SGP (D9) ∪
  // assinados sem ativação; idade desde a venda; alerta > 7 dias
  type OsBruta = { sgp_os_id: string; responsavel: string | null; agendamento: string | null; contratos: Bruto };
  const osAbertas = (osBrutas ?? []) as unknown as OsBruta[];
  const comOs = new Map<string, ItemEsteira>();
  for (const os of osAbertas) {
    const c = os.contratos;
    if (!c) continue;
    const idade = dias(c.data_venda, hoje);
    const item = paraItem(c, idade, idade > ALERTA_ATIVACAO_DIAS);
    item.temOs = true;
    item.agendamento = os.agendamento;
    item.responsavel = os.responsavel;
    item.prontaOperacional = ehStart(os.responsavel);
    comOs.set(c.id, item);
  }
  const semAtivacaoTudo = [
    ...comOs.values(),
    ...ativacoesPendentes(pendencias, hoje)
      .filter((p) => !comOs.has((p.contrato as Bruto).id))
      .map((p) => paraItem(p.contrato as Bruto, p.idadeDias, p.alerta)),
  ].sort((a, b) => a.idadeDias - b.idadeDias); // recentes no topo, atrasados no fim
  const semAtivacao = semAtivacaoTudo.filter(noPeriodo);

  // filtro de entrada: pendências de score/adiantamento dos tickets vinculados
  {
    const admin = (await import("@/lib/supabase/admin")).criarClienteAdmin();
    const alvos = [...semAssinatura, ...semAtivacao];
    const ids = [...new Set(alvos.map((i) => i.id))];
    if (ids.length > 0) {
      const porContrato = new Map<string, { score: number | null; valor: number | null; recebido: string | null; setor: string | null }>();
      for (let i = 0; i < ids.length; i += 400) {
        const { data: tk } = await admin
          .from("tickets")
          .select("contrato_id, score, adiantamento_valor, adiantamento_recebido_em, vendedores(setor)")
          .in("contrato_id", ids.slice(i, i + 400));
        for (const t of tk ?? []) {
          if (!t.contrato_id) continue;
          porContrato.set(t.contrato_id as string, {
            score: (t.score as number | null) ?? null,
            valor: (t.adiantamento_valor as number | null) ?? null,
            recebido: (t.adiantamento_recebido_em as string | null) ?? null,
            setor: (t.vendedores as unknown as { setor?: string } | null)?.setor ?? null,
          });
        }
      }
      for (const item of alvos) {
        const info = porContrato.get(item.id);
        if (!info || info.setor === "corporativo") continue;
        if (info.score === null) {
          item.scoreSituacao = "sem_score";
        } else if ((info.valor ?? 0) > 0 && !info.recebido) {
          item.scoreSituacao = "adiantamento_pendente";
          item.adiantamentoValor = info.valor;
        }
      }
    }
  }

  // instaladas no período (idade = venda → ativação; nunca alerta)
  // ordem: instalação mais recente no topo
  const instaladas = [...ativadas]
    .sort((a, b) => (a.data_ativacao! < b.data_ativacao! ? 1 : -1))
    .map((c) => paraItem(c, dias(c.data_venda, c.data_ativacao!), false));

  // ---------- tempo médio por POP e por vendedora ----------
  const agrupar = (chave: (c: Bruto) => string) => {
    const grupos = new Map<string, Bruto[]>();
    for (const c of ativadas) {
      const k = chave(c);
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(c);
    }
    return [...grupos.entries()]
      .map(([nome, lista]) => ({
        nome,
        dias: tempoMedioVendaAtivacao(lista) ?? 0,
        ativacoes: lista.length,
      }))
      .sort((a, b) => a.dias - b.dias);
  };

  const vendasContaveis = vendasDoPeriodo(vendas, periodo.de, periodo.ate);

  return {
    hoje,
    kpis: {
      pendentesAssinatura: {
        total: semAssinatura.length,
        emAlerta: semAssinatura.filter((i) => i.alerta).length,
      },
      aguardandoInstalacao: {
        total: semAtivacao.length,
        emAlerta: semAtivacao.filter((i) => i.alerta).length,
      },
      taxaInstalacao: taxaInstalacaoEfetiva(vendasContaveis, hoje),
      tempoMedioDias: tempoMedioVendaAtivacao(ativadas),
      instaladasNoPeriodo: instaladas.length,
    },
    colunas: {
      pendenteAssinatura: semAssinatura,
      aguardandoInstalacao: semAtivacao,
      instaladas,
    },
    tempoPorPop: agrupar((c) => c.pops?.nome ?? "—"),
    tempoPorVendedora: agrupar((c) => c.vendedores?.nome ?? "Não atribuída"),
    foraDoPeriodo: {
      assinatura: semAssinaturaTudo.length - semAssinatura.length,
      instalacao: semAtivacaoTudo.length - semAtivacao.length,
    },
    assinaturaPorVendedora: (() => {
      const grupos = new Map<string, { total: number; emAlerta: number }>();
      for (const i of semAssinatura) {
        const g = grupos.get(i.vendedora) ?? { total: 0, emAlerta: 0 };
        g.total += 1;
        if (i.alerta) g.emAlerta += 1;
        grupos.set(i.vendedora, g);
      }
      return [...grupos.entries()]
        .map(([vendedora, v]) => ({ vendedora, ...v }))
        .sort((a, b) => b.total - a.total);
    })(),
  };
}

export { ALERTA_ATIVACAO_DIAS, ALERTA_ASSINATURA_DIAS };
