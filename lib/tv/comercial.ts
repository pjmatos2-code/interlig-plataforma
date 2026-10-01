import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { vendasDoPeriodo, type ContratoIndicador } from "@/lib/indicadores/regras";
import { carregarRanking } from "@/lib/ranking/dados";

/**
 * Dashboard comercial de TV (01/10/2026, modelo aprovado pelo gestor): visão
 * da empresa inteira, sem recorte de perfil — roda num telão da sala.
 */

const hojeStm = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
/** instante UTC → data/hora de Santarém */
const paraStm = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString();

export type VendaRecente = {
  id: string;
  vendedora: string;
  foto: string | null;
  plano: string;
  valor: number;
  unidade: string;
  criadoEm: string;
};

export type DadosTvComercial = {
  hoje: string;
  comparadoCom: string;
  vendas: { hoje: number; antes: number };
  receita: { hoje: number; antes: number };
  ticket: { hoje: number; antes: number };
  ativacoes: { hoje: number; antes: number };
  agendadas: { hoje: number; semTecnico: number; proxima: string | null };
  metaGeral: { meta: number; ativos: number; unidades: { nome: string; ativos: number }[] };
  metaDiaria: number;
  porHora: { hora: number; vendas: number }[];
  funil: { leads: number; atendimento: number; contrato: number; vendas: number };
  top5: { nome: string; foto: string | null; vendas: number; receita: number }[];
  unidades: { nome: string; vendas: number; ativacoes: number; receita: number; metaDia: number }[];
  vendasRecentes: VendaRecente[];
};

const UNIDADES = ["Altamira", "Vitória do Xingu", "Brasil Novo"];

type ContratoTv = ContratoIndicador & {
  id: string;
  criado_em: string;
  vendedor_id: string | null;
  pop_id: string | null;
  vendedores: { nome: string; foto_url: string | null } | null;
  planos: { nome: string } | null;
  pops: { nome: string } | null;
};

export async function carregarTvComercial(): Promise<DadosTvComercial> {
  const admin = criarClienteAdmin();
  const hoje = hojeStm();
  const inicioMes = `${hoje.slice(0, 7)}-01`;

  const [{ data: cal }, { data: pops }] = await Promise.all([
    admin.from("calendario").select("data, dia_util").gte("data", inicioMes).lte("data", `${hoje.slice(0, 7)}-31`),
    admin.from("pops").select("id, nome"),
  ]);
  const diasUteisMes = (cal ?? []).filter((d) => d.dia_util).length || 26;

  // dia útil anterior (seg–sáb): base do comparativo
  const { data: anteriores } = await admin
    .from("calendario")
    .select("data")
    .lt("data", hoje)
    .eq("dia_util", true)
    .order("data", { ascending: false })
    .limit(1);
  const antes = (anteriores?.[0]?.data as string | undefined) ?? hoje;

  const CAMPOS =
    "id, data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, desistencia_em, valor_mensalidade, criado_em, vendedor_id, pop_id, vendedores(nome, foto_url), planos(nome), pops(nome)";

  const [{ data: brutos }, { data: ativadosBrutos }, { data: osBrutas }, { data: ticketsHoje }] =
    await Promise.all([
      admin.from("contratos").select(CAMPOS).gte("data_venda", antes).lte("data_venda", hoje).limit(2000),
      admin
        .from("contratos")
        .select("data_ativacao, pop_id")
        .gte("data_ativacao", antes)
        .lte("data_ativacao", hoje)
        .limit(2000),
      admin
        .from("os_instalacao")
        .select("agendamento, responsavel")
        .eq("situacao", "aberta")
        .not("agendamento", "is", null)
        .gte("agendamento", `${hoje}T00:00:00-03:00`)
        .lte("agendamento", `${hoje}T23:59:59-03:00`)
        .limit(500),
      admin
        .from("tickets")
        .select("etapa, desfecho, primeira_tratativa_em")
        .gte("criado_em", `${hoje}T00:00:00-03:00`)
        .limit(3000),
    ]);

  const contratos = (brutos ?? []) as unknown as ContratoTv[];
  const vendasHoje = vendasDoPeriodo(contratos, hoje, hoje) as ContratoTv[];
  const vendasAntes = vendasDoPeriodo(contratos, antes, antes) as ContratoTv[];
  const soma = (l: ContratoTv[]) => l.reduce((t, c) => t + Number(c.valor_mensalidade ?? 0), 0);
  const ticket = (l: ContratoTv[]) => (l.length ? soma(l) / l.length : 0);

  const ativ = ativadosBrutos ?? [];
  const ativHoje = ativ.filter((c) => c.data_ativacao === hoje);

  // ---------- instalações agendadas hoje ----------
  const os = osBrutas ?? [];
  const agora = paraStm(new Date().toISOString());
  const proximas = os
    .map((o) => paraStm(o.agendamento as string))
    .filter((h) => h >= agora)
    .sort();

  // ---------- meta (mesma régua do dashboard: unidade cadastrada ?? agentes) ----------
  const [{ data: metasDoMes }, { data: vends }] = await Promise.all([
    admin.from("metas").select("escopo, referencia_id, quantidade_vendas").eq("mes_ano", inicioMes),
    admin.from("vendedores").select("id, pop_id, eh_coordenador").eq("ativo", true),
  ]);
  // mês novo ainda sem metas cadastradas: a TV usa as do último mês que tem
  // (a tela não pode ficar com "meta 0" nos primeiros dias do mês)
  let metas = metasDoMes ?? [];
  if (metas.length === 0) {
    const { data: ultimo } = await admin
      .from("metas")
      .select("mes_ano")
      .lt("mes_ano", inicioMes)
      .order("mes_ano", { ascending: false })
      .limit(1);
    if (ultimo?.[0]) {
      const { data: anteriores } = await admin
        .from("metas")
        .select("escopo, referencia_id, quantidade_vendas")
        .eq("mes_ano", ultimo[0].mes_ano);
      metas = anteriores ?? [];
    }
  }
  const metaVend = new Map(
    metas.filter((m) => m.escopo === "vendedora").map((m) => [m.referencia_id as string, Number(m.quantidade_vendas)])
  );
  const metaUnidade = (popId: string) =>
    Number(metas.find((m) => m.escopo === "pop" && m.referencia_id === popId)?.quantidade_vendas ?? 0) ||
    (vends ?? [])
      .filter((v) => v.pop_id === popId && !v.eh_coordenador)
      .reduce((t, v) => t + (metaVend.get(v.id as string) ?? 0), 0);
  const popsUnid = UNIDADES.map((nome) => (pops ?? []).find((p) => p.nome === nome)).filter(Boolean) as {
    id: string;
    nome: string;
  }[];
  const metaGlobal = Number(metas.find((m) => m.escopo === "global")?.quantidade_vendas ?? 0);
  const metaMes = metaGlobal || popsUnid.reduce((t, p) => t + metaUnidade(p.id), 0);

  // ---------- base ativa (Relatórios > Crescimento, 1x/dia) ----------
  const { data: base } = await admin
    .from("crescimento_base")
    .select("mes, unidade, ativos")
    .order("mes", { ascending: false })
    .limit(30);
  const unidadesBase = UNIDADES.map((nome) => ({
    nome,
    ativos: Number((base ?? []).find((b) => b.unidade === nome)?.ativos ?? 0),
  }));

  // ---------- evolução por hora (horário em que o cadastro entrou) ----------
  const porHora = Array.from({ length: 13 }, (_, i) => ({ hora: i + 8, vendas: 0 }));
  for (const c of vendasHoje) {
    const h = Number(paraStm(c.criado_em).slice(11, 13));
    const slot = porHora.find((p) => p.hora === Math.min(20, Math.max(8, h)));
    if (slot) slot.vendas += 1;
  }

  // ---------- funil do dia ----------
  const tk = ticketsHoje ?? [];
  const funil = {
    leads: tk.length,
    atendimento: tk.filter((t) => t.primeira_tratativa_em).length,
    contrato: tk.filter((t) => t.etapa === "aguardando" || (t.etapa === "fechado" && t.desfecho === "convertido")).length,
    vendas: vendasHoje.length,
  };

  // ---------- top 5 do dia ----------
  const ranking = await carregarRanking(null);
  const top5 = ranking.podios.dia
    .filter((l) => l.vendas > 0)
    .slice(0, 5)
    .map((l) => ({ nome: l.nome, foto: l.foto, vendas: l.vendas, receita: l.receita }));

  // ---------- por unidade ----------
  const unidades = popsUnid.map((p) => {
    const v = vendasHoje.filter((c) => c.pop_id === p.id);
    return {
      nome: p.nome,
      vendas: v.length,
      ativacoes: ativHoje.filter((c) => c.pop_id === p.id).length,
      receita: soma(v),
      metaDia: metaUnidade(p.id) / diasUteisMes,
    };
  });

  // ---------- vendas recentes (alerta de nova venda) ----------
  const vendasRecentes: VendaRecente[] = [...vendasHoje]
    .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1))
    .slice(0, 30)
    .map((c) => ({
      id: c.id,
      vendedora: c.vendedores?.nome ?? "Equipe Interlig",
      foto: c.vendedores?.foto_url ?? null,
      plano: c.planos?.nome ?? "Plano",
      valor: Number(c.valor_mensalidade ?? 0),
      unidade: c.pops?.nome ?? "",
      criadoEm: c.criado_em,
    }));

  return {
    hoje,
    comparadoCom: antes,
    vendas: { hoje: vendasHoje.length, antes: vendasAntes.length },
    receita: { hoje: soma(vendasHoje), antes: soma(vendasAntes) },
    ticket: { hoje: ticket(vendasHoje), antes: ticket(vendasAntes) },
    ativacoes: { hoje: ativHoje.length, antes: ativ.filter((c) => c.data_ativacao === antes).length },
    agendadas: {
      hoje: os.length,
      semTecnico: os.filter((o) => !o.responsavel).length,
      proxima: proximas[0]?.slice(11, 16) ?? null,
    },
    metaGeral: { meta: 10_000, ativos: unidadesBase.reduce((t, u) => t + u.ativos, 0), unidades: unidadesBase },
    metaDiaria: metaMes / diasUteisMes,
    porHora,
    funil,
    top5,
    unidades,
    vendasRecentes,
  };
}
