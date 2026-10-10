import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Prevenção de cancelamento (10/10/2026). Desenho saído do teste retroativo
 * (jan–ago/2026, 72 mil fotografias da base):
 *  - débito é a maior parte dos cancelamentos e é previsível: atraso > 15
 *    dias → 34,5% são cancelados em 60 dias (a empresa cancela em lotes);
 *  - 86% dos voluntários cancelam no MESMO dia em que pedem: a retenção tem
 *    de acontecer na ligação — o que se mede é se o pedido passou por ela;
 *  - suporte só diferencia a insatisfação (52% tinham chamado x 21% da base).
 * Fora da base: rede neutra, permutas e órgãos públicos (no SQL).
 */

import { type ResultadoContato } from "@/lib/prevencao/resultados";
export { PERFIS_OPERAM, RESULTADOS, ROTULO_RESULTADO, type ResultadoContato } from "@/lib/prevencao/resultados";

export type UltimoContato = { resultado: ResultadoContato; observacao: string | null; em: string; por: string | null };

type BaseLinha = {
  contratoId: string;
  sgpContratoId: string;
  sgpClienteId: string | null;
  status: string;
  cliente: string;
  telefone: string | null;
  plano: string | null;
  pop: string | null;
  valor: number;
  corporativo: boolean;
  contato: UltimoContato | null;
};

export type LinhaDebito = BaseLinha & {
  boletos: number;
  valorAberto: number;
  diasAtraso: number;
  vencimentoAntigo: string;
  ultimaPromessa: string | null;
  suporte90d: number;
};

export type LinhaInsatisfacao = BaseLinha & {
  ativacao: string | null;
  chamados: number;
  tipos: string[];
  ultimo: string;
};

/** último contato registrado de cada contrato, nos últimos 60 dias */
async function ultimosContatos(ids: string[]): Promise<Map<string, UltimoContato>> {
  const admin = criarClienteAdmin();
  const mapa = new Map<string, UltimoContato>();
  const desde = new Date(Date.now() - 60 * 86_400_000).toISOString();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await admin
      .from("prevencao_contatos")
      .select("sgp_contrato_id, resultado, observacao, criado_em, usuarios(nome)")
      .in("sgp_contrato_id", ids.slice(i, i + 300))
      .gte("criado_em", desde)
      .order("criado_em", { ascending: false });
    for (const c of data ?? []) {
      const id = c.sgp_contrato_id as string;
      if (mapa.has(id)) continue;
      mapa.set(id, {
        resultado: c.resultado as ResultadoContato,
        observacao: (c.observacao as string | null) ?? null,
        em: c.criado_em as string,
        por: (c.usuarios as unknown as { nome: string } | null)?.nome ?? null,
      });
    }
  }
  return mapa;
}

const base = (r: Record<string, unknown>): Omit<BaseLinha, "contato"> => ({
  contratoId: r.contrato_id as string,
  sgpContratoId: r.sgp_contrato_id as string,
  sgpClienteId: (r.sgp_cliente_id as string | null) ?? null,
  status: r.status as string,
  cliente: r.cliente as string,
  telefone: (r.telefone as string | null) ?? null,
  plano: (r.plano as string | null) ?? null,
  pop: (r.pop as string | null) ?? null,
  valor: Number(r.valor ?? 0),
  corporativo: Boolean(r.corporativo),
});

export async function filaDebito(dias = 15): Promise<LinhaDebito[]> {
  const { data, error } = await criarClienteAdmin().rpc("prevencao_debito", { p_dias: dias }).range(0, 9999);
  if (error) throw new Error(error.message);
  const linhas = (data ?? []) as Record<string, unknown>[];
  const contatos = await ultimosContatos(linhas.map((r) => r.sgp_contrato_id as string));
  return linhas
    .map((r) => ({
      ...base(r),
      contato: contatos.get(r.sgp_contrato_id as string) ?? null,
      boletos: Number(r.boletos ?? 0),
      valorAberto: Number(r.valor_aberto ?? 0),
      diasAtraso: Number(r.dias_atraso ?? 0),
      vencimentoAntigo: r.vencimento_antigo as string,
      ultimaPromessa: (r.ultima_promessa as string | null) ?? null,
      suporte90d: Number(r.suporte_90d ?? 0),
    }))
    .sort((a, b) => b.valorAberto - a.valorAberto);
}

export async function filaInsatisfacao(dias = 30, minimo = 2): Promise<LinhaInsatisfacao[]> {
  const { data, error } = await criarClienteAdmin()
    .rpc("prevencao_insatisfacao", { p_dias: dias, p_minimo: minimo })
    .range(0, 9999);
  if (error) throw new Error(error.message);
  const linhas = (data ?? []) as Record<string, unknown>[];
  const contatos = await ultimosContatos(linhas.map((r) => r.sgp_contrato_id as string));
  return linhas
    .map((r) => ({
      ...base(r),
      contato: contatos.get(r.sgp_contrato_id as string) ?? null,
      ativacao: (r.ativacao as string | null) ?? null,
      chamados: Number(r.chamados ?? 0),
      tipos: (r.tipos as string[] | null) ?? [],
      ultimo: r.ultimo as string,
    }))
    .sort((a, b) => b.chamados - a.chamados || (a.ultimo < b.ultimo ? 1 : -1));
}

/** efeito dos contatos: dos contatados nos últimos 60 dias, quantos foram cancelados depois */
export async function efeitoContatos(fila: "debito" | "insatisfacao"): Promise<{
  contatados: number;
  porResultado: Record<string, number>;
  canceladosDepois: number;
}> {
  const admin = criarClienteAdmin();
  const desde = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data } = await admin
    .from("prevencao_contatos")
    .select("sgp_contrato_id, resultado, criado_em")
    .eq("fila", fila)
    .gte("criado_em", desde)
    .order("criado_em", { ascending: true })
    .limit(5000);
  const primeiro = new Map<string, string>();
  const ultimoRes = new Map<string, string>();
  for (const c of data ?? []) {
    const id = c.sgp_contrato_id as string;
    if (!primeiro.has(id)) primeiro.set(id, c.criado_em as string);
    ultimoRes.set(id, c.resultado as string);
  }
  const porResultado: Record<string, number> = {};
  for (const r of ultimoRes.values()) porResultado[r] = (porResultado[r] ?? 0) + 1;
  let canceladosDepois = 0;
  const ids = [...primeiro.keys()];
  for (let i = 0; i < ids.length; i += 300) {
    const { data: cs } = await admin
      .from("cancelamentos_sgp")
      .select("sgp_contrato_id, data_cancelamento")
      .in("sgp_contrato_id", ids.slice(i, i + 300))
      .gte("data_cancelamento", desde.slice(0, 10));
    const vistos = new Set<string>();
    for (const c of cs ?? []) {
      const id = c.sgp_contrato_id as string;
      if (vistos.has(id)) continue;
      if ((c.data_cancelamento as string) >= primeiro.get(id)!.slice(0, 10)) {
        vistos.add(id);
        canceladosDepois++;
      }
    }
  }
  return { contatados: primeiro.size, porResultado, canceladosDepois };
}

// ---------------------------------------------------------------------------
// Pedidos de cancelamento x retenção
// ---------------------------------------------------------------------------

/** rede neutra, permutas, contratos internos/cortesia e órgãos públicos */
const FORA_DA_BASE =
  /REDE NEUTRA|PERMUTA|CONTROLE INTERNO|CORTESIA|PREFEITURA|FUNDO MUNICIPAL|SECRETARIA|MUNIC[IÍ]PIO|C[AÂ]MARA MUNICIPAL|SEMED|SESPA|CENTRO REGIONAL DE SA[UÚ]DE|GOVERNO|ESTADO DO PAR|FUNDA[CÇ][AÃ]O NACIONAL|FUNDA[CÇ][AÃ]O INSTITUTO BRASILEIRO|AG[EÊ]NCIA BRASILEIRA|CONSELHO ESCOLAR|CONS[OÓ]RCIO POLICL|POL[IÍ]CIA MILITAR|MINIST[EÉ]RIO P[UÚ]BLICO|TRIBUNAL|DEFENSORIA|INSTITUTO FEDERAL|UNIVERSIDADE FEDERAL/i;

export type PedidoCancelamento = {
  sgpContratoId: string;
  sgpClienteId: string | null;
  cliente: string;
  pop: string | null;
  plano: string | null;
  valor: number;
  corporativo: boolean;
  pedidoEm: string;
  atendente: string | null;
  /** caso aberto na Retenção (plataforma) ou ocorrência "Retenção de Cancelamento" no SGP */
  passouRetencao: boolean;
  desfechoRetencao: string | null;
  canceladoEm: string | null;
  motivo: string | null;
  situacao: "cancelado" | "ficou" | "aguardando";
};

export async function pedidosCancelamento(mesIso: string): Promise<PedidoCancelamento[]> {
  const admin = criarClienteAdmin();
  const ini = `${mesIso.slice(0, 7)}-01`;
  const [a, m] = ini.split("-").map(Number);
  const fim = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
  const { data: ocs } = await admin
    .from("ocorrencias_sgp")
    .select("sgp_contrato_id, sgp_cliente_id, tipo, criada_em, usuario")
    .in("tipo", ["Cancelamento Contrato", "Retenção de Cancelamento"])
    .gte("criada_em", `${ini}T00:00:00-03:00`)
    .lt("criada_em", `${fim}T00:00:00-03:00`)
    .order("criada_em", { ascending: true })
    .limit(5000);
  // um pedido por contrato no mês (o primeiro); a ocorrência de retenção marca a passagem
  const pedidos = new Map<string, { clienteSgp: string | null; em: string; usuario: string | null; retencaoSgp: boolean }>();
  for (const o of ocs ?? []) {
    const id = o.sgp_contrato_id as string | null;
    if (!id) continue;
    const atual = pedidos.get(id);
    const ehRetencao = o.tipo === "Retenção de Cancelamento";
    if (!atual) {
      pedidos.set(id, {
        clienteSgp: (o.sgp_cliente_id as string | null) ?? null,
        em: o.criada_em as string,
        usuario: ehRetencao ? null : ((o.usuario as string | null) ?? null),
        retencaoSgp: ehRetencao,
      });
    } else {
      if (ehRetencao) atual.retencaoSgp = true;
      else if (!atual.usuario) atual.usuario = (o.usuario as string | null) ?? null;
    }
  }
  const ids = [...pedidos.keys()];
  const contratos = new Map<string, { cliente: string; cpf: string | null; fone: string; pop: string | null; plano: string | null; valor: number }>();
  const casos = new Map<string, { criado: string; desfecho: string | null }[]>();
  const cancelamentos = new Map<string, { data: string; motivo: string | null }[]>();
  for (let i = 0; i < ids.length; i += 300) {
    const lote = ids.slice(i, i + 300);
    const [{ data: cts }, { data: cr }, { data: cs }] = await Promise.all([
      admin
        .from("contratos")
        .select("sgp_contrato_id, valor_mensalidade, clientes(nome, cpf, telefone), planos(nome), pops(nome)")
        .in("sgp_contrato_id", lote),
      admin.from("casos_retencao").select("sgp_contrato_id, criado_em, desfecho").in("sgp_contrato_id", lote),
      admin
        .from("cancelamentos_sgp")
        .select("sgp_contrato_id, data_cancelamento, motivo")
        .in("sgp_contrato_id", lote)
        .gte("data_cancelamento", ini),
    ]);
    for (const c of cts ?? []) {
      const cl = c.clientes as unknown as { nome: string; cpf: string | null; telefone: string | null } | null;
      contratos.set(c.sgp_contrato_id as string, {
        cliente: cl?.nome ?? "—",
        cpf: cl?.cpf ?? null,
        fone: (cl?.telefone ?? "").replace(/\D/g, "").slice(-8),
        plano: (c.planos as unknown as { nome: string } | null)?.nome ?? null,
        pop: (c.pops as unknown as { nome: string } | null)?.nome ?? null,
        valor: Number(c.valor_mensalidade ?? 0),
      });
    }
    for (const c of cr ?? []) {
      const l = casos.get(c.sgp_contrato_id as string) ?? [];
      l.push({ criado: c.criado_em as string, desfecho: (c.desfecho as string | null) ?? null });
      casos.set(c.sgp_contrato_id as string, l);
    }
    for (const c of cs ?? []) {
      const l = cancelamentos.get(c.sgp_contrato_id as string) ?? [];
      l.push({ data: c.data_cancelamento as string, motivo: (c.motivo as string | null) ?? null });
      cancelamentos.set(c.sgp_contrato_id as string, l);
    }
  }
  // casos abertos pelo WhatsApp às vezes ficam sem contrato: casa pelo telefone
  const { data: semContrato } = await admin
    .from("casos_retencao")
    .select("telefone, criado_em, desfecho")
    .is("sgp_contrato_id", null)
    .not("telefone", "is", null)
    .gte("criado_em", new Date(Date.parse(ini) - 31 * 86_400_000).toISOString())
    .lt("criado_em", new Date(Date.parse(fim) + 4 * 86_400_000).toISOString());
  const casosPorFone = new Map<string, { criado: string; desfecho: string | null }[]>();
  for (const c of semContrato ?? []) {
    const f = String(c.telefone).replace(/\D/g, "").slice(-8);
    if (f.length < 8) continue;
    const l = casosPorFone.get(f) ?? [];
    l.push({ criado: c.criado_em as string, desfecho: (c.desfecho as string | null) ?? null });
    casosPorFone.set(f, l);
  }
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const dia = 86_400_000;
  const saida: PedidoCancelamento[] = [];
  for (const [id, p] of pedidos) {
    const ct = contratos.get(id);
    if (ct && FORA_DA_BASE.test(`${ct.cliente} ${ct.plano ?? ""}`)) continue;
    const t = Date.parse(p.em);
    // caso de retenção aberto de 30 dias antes até 3 dias depois do pedido
    const naJanela = (c: { criado: string }) => Date.parse(c.criado) >= t - 30 * dia && Date.parse(c.criado) <= t + 3 * dia;
    const caso =
      (casos.get(id) ?? []).find(naJanela) ??
      (ct?.fone && ct.fone.length === 8 ? (casosPorFone.get(ct.fone) ?? []).find(naJanela) : undefined);
    const canc = (cancelamentos.get(id) ?? [])
      .filter((c) => c.data >= p.em.slice(0, 10) || Date.parse(c.data) >= t - dia)
      .sort((x, y) => (x.data < y.data ? -1 : 1))[0];
    const diasDesde = (Date.parse(hoje) - t) / dia;
    const cpf = (ct?.cpf ?? "").replace(/\D/g, "");
    saida.push({
      sgpContratoId: id,
      sgpClienteId: p.clienteSgp,
      cliente: ct?.cliente ?? "—",
      pop: ct?.pop ?? null,
      plano: ct?.plano ?? null,
      valor: ct?.valor ?? 0,
      corporativo: cpf.length === 14 || /CORPORATE|\bPJ\b|DEDICADO|EMPRESARIAL|COMERCIAL/i.test(ct?.plano ?? ""),
      pedidoEm: p.em,
      atendente: p.usuario,
      passouRetencao: Boolean(caso) || p.retencaoSgp,
      desfechoRetencao: caso?.desfecho ?? null,
      canceladoEm: canc?.data ?? null,
      motivo: canc?.motivo ?? null,
      situacao: canc ? "cancelado" : diasDesde >= 7 ? "ficou" : "aguardando",
    });
  }
  return saida.sort((a, b) => (a.pedidoEm < b.pedidoEm ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Motivos dos cancelamentos
// ---------------------------------------------------------------------------

export type MotivosMes = {
  mes: string;
  voluntarios: number;
  debito: number;
  naoInstalou: number;
  porMotivo: Record<string, number>;
};

export async function motivosCancelamento(meses = 6, popNome?: string | null): Promise<MotivosMes[]> {
  const admin = criarClienteAdmin();
  const agora = new Date(Date.now() - 3 * 3600_000);
  const ini = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - (meses - 1), 1)).toISOString().slice(0, 10);
  const linhas: { sgp_contrato_id: string; data_cancelamento: string; motivo: string | null; status_anterior: string | null; cliente: string | null }[] = [];
  for (let de = 0; ; de += 1000) {
    const { data } = await admin
      .from("cancelamentos_sgp")
      .select("sgp_contrato_id, data_cancelamento, motivo, status_anterior, cliente")
      .gte("data_cancelamento", ini)
      .order("sgp_contrato_id")
      .order("data_cancelamento")
      .range(de, de + 999);
    linhas.push(...((data ?? []) as typeof linhas));
    if (!data || data.length < 1000) break;
  }
  // unidade e exclusões pelo cadastro do contrato
  const ids = [...new Set(linhas.map((l) => l.sgp_contrato_id))];
  const info = new Map<string, { pop: string | null; plano: string }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await admin
      .from("contratos")
      .select("sgp_contrato_id, planos(nome), pops(nome)")
      .in("sgp_contrato_id", ids.slice(i, i + 300));
    for (const c of data ?? []) {
      info.set(c.sgp_contrato_id as string, {
        pop: (c.pops as unknown as { nome: string } | null)?.nome ?? null,
        plano: (c.planos as unknown as { nome: string } | null)?.nome ?? "",
      });
    }
  }
  const porMes = new Map<string, MotivosMes>();
  for (let k = 0; k < meses; k++) {
    const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - (meses - 1) + k, 1));
    const mes = d.toISOString().slice(0, 7);
    porMes.set(mes, { mes, voluntarios: 0, debito: 0, naoInstalou: 0, porMotivo: {} });
  }
  for (const l of linhas) {
    const i = info.get(l.sgp_contrato_id);
    if (popNome && i?.pop !== popNome) continue;
    if (FORA_DA_BASE.test(`${l.cliente ?? ""} ${i?.plano ?? ""}`)) continue;
    const m = porMes.get(l.data_cancelamento.slice(0, 7));
    if (!m) continue;
    if (l.status_anterior === "Ativo") {
      m.voluntarios++;
      const motivo = (l.motivo ?? "").replace(/^Cancelamento - /, "").trim() || "Sem motivo";
      m.porMotivo[motivo] = (m.porMotivo[motivo] ?? 0) + 1;
    } else if (l.status_anterior === "Suspenso") m.debito++;
    else m.naoInstalou++;
  }
  return [...porMes.values()];
}
