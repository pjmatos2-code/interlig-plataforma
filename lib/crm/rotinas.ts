import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  CRM_PADROES,
  estadoInatividade,
  normalizarCpf,
  normalizarTelefone,
} from "@/lib/indicadores/crm";

const diasInatividade = () =>
  Number(process.env.CRM_DIAS_INATIVIDADE ?? CRM_PADROES.diasInatividade);
const diasReconciliacao = () =>
  Number(process.env.CRM_DIAS_RECONCILIACAO ?? CRM_PADROES.diasReconciliacao);

/**
 * Fechamento automático por inatividade (PRD 3.9): ticket aberto sem interação
 * há N dias (padrão 15) fecha como "não convertido — sem resposta", com
 * fechado_por = auto_inatividade. Roda no carregamento do /crm (idempotente);
 * na Fase seguinte passa a rodar pelo cron do worker.
 */
export async function fecharTicketsInativos(): Promise<number> {
  const admin = criarClienteAdmin();
  const agora = new Date().toISOString();

  const { data: abertos } = await admin
    .from("tickets")
    .select("id, etapa, atualizado_em")
    .neq("etapa", "fechado")
    .limit(2000);

  const paraFechar = (abertos ?? []).filter(
    (t) => estadoInatividade(t, agora, diasInatividade()).situacao === "fechar"
  );
  if (paraFechar.length === 0) return 0;

  const { data: motivo } = await admin
    .from("motivos_nao_conversao")
    .select("id")
    .ilike("nome", "sem resposta")
    .maybeSingle();
  if (!motivo) return 0; // sem o motivo cadastrado não há como fechar

  let fechados = 0;
  for (const t of paraFechar) {
    const { error } = await admin
      .from("tickets")
      .update({
        etapa: "fechado",
        etapa_encerramento: t.etapa, // onde a negociação parou (o quadro usa)
        desfecho: "nao_convertido",
        fechado_por: "auto_inatividade",
        motivo_id: motivo.id,
        fechado_em: agora,
      })
      .eq("id", t.id)
      .neq("etapa", "fechado"); // corrida: não refecha
    if (!error) fechados += 1;
  }
  return fechados;
}

/**
 * Virada de mês (decisão do gestor, 27/09/2026): o funil de cada mês começa
 * limpo — negociação não acumula de um mês para o outro. Nos primeiros dias
 * do mês, todo ticket ABERTO criado no mês anterior é fechado como não
 * convertido com o motivo padrão "Mês encerrado sem conversão"; a vendedora
 * pode REABRIR (até 30 dias) se a negociação continuar de verdade, e os
 * perdidos saem na exportação para o recontato.
 */
export async function fecharMesNaVirada(): Promise<number> {
  const admin = criarClienteAdmin();
  const agoraStm = new Date(Date.now() - 3 * 3600_000); // Santarém
  if (agoraStm.getUTCDate() > 3) return 0; // só nos 3 primeiros dias
  const inicioMes = `${agoraStm.toISOString().slice(0, 7)}-01`;

  const { data: abertos } = await admin
    .from("tickets")
    .select("id, etapa, criado_em")
    .neq("etapa", "fechado")
    .lt("criado_em", `${inicioMes}T00:00:00`)
    .limit(2000);
  if (!abertos || abertos.length === 0) return 0;

  // motivo padrão (cria uma única vez se não existir)
  let { data: motivo } = await admin
    .from("motivos_nao_conversao")
    .select("id")
    .ilike("nome", "mês encerrado%")
    .maybeSingle();
  if (!motivo) {
    const { data: novo } = await admin
      .from("motivos_nao_conversao")
      .insert({ nome: "Mês encerrado sem conversão", ativo: true, ordem: 90 })
      .select("id")
      .single();
    motivo = novo;
  }
  if (!motivo) return 0;

  const agora = new Date().toISOString();
  let fechados = 0;
  for (const t of abertos) {
    const { error } = await admin
      .from("tickets")
      .update({
        etapa: "fechado",
        etapa_encerramento: t.etapa,
        desfecho: "nao_convertido",
        fechado_por: "auto_inatividade",
        motivo_id: motivo.id,
        fechado_em: agora,
      })
      .eq("id", t.id)
      .neq("etapa", "fechado");
    if (!error) {
      fechados += 1;
      await admin.from("ticket_eventos").insert({
        ticket_id: t.id,
        tipo: "nota",
        dados: {
          texto:
            "🗓️ Fechado automaticamente na virada do mês (motivo padrão: Mês encerrado sem conversão). Se a negociação continua, reabra o ticket.",
        },
      });
    }
  }
  return fechados;
}

/**
 * Reconciliação ticket ↔ contrato do SGP (PRD 3.9, regra 5.17): cruza
 * convertidos sem contrato com contratos por CPF/telefone do cliente.
 * Quando casa: grava contrato_id + reconciliado_em no ticket e a origem do
 * ticket passa a valer como origem oficial do cadastro (atualiza o contrato).
 */
export async function reconciliarTickets(): Promise<number> {
  const admin = criarClienteAdmin();

  const { data: pendentes } = await admin
    .from("tickets")
    .select("id, cpf, telefone, criado_em, fechado_em, origem_cadastro, vendedor_id")
    .eq("etapa", "fechado")
    .eq("desfecho", "convertido")
    .is("contrato_id", null)
    .limit(500);
  if (!pendentes?.length) return 0;

  // contratos dos últimos 90 dias com os dados do cliente
  const corte = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const { data: contratos } = await admin
    .from("contratos")
    .select("id, data_venda, cliente_id, clientes(cpf, telefone)")
    .gte("data_venda", corte)
    .limit(5000);

  type C = { id: string; data_venda: string; clientes: { cpf: string | null; telefone: string | null } | null };
  const porCpf = new Map<string, C[]>();
  const porTelefone = new Map<string, C[]>();
  for (const c of (contratos ?? []) as unknown as C[]) {
    const cpf = normalizarCpf(c.clientes?.cpf);
    const tel = normalizarTelefone(c.clientes?.telefone);
    if (cpf) (porCpf.get(cpf) ?? porCpf.set(cpf, []).get(cpf)!).push(c);
    if (tel) (porTelefone.get(tel) ?? porTelefone.set(tel, []).get(tel)!).push(c);
  }

  // cura ativa: pendente com CPF e SEM candidato na base pode ser um cadastro
  // que a varredura ainda não alcançou — busca direto na URA pelo CPF (até 5
  // por ciclo, só tickets fechados nos últimos 10 dias, para não martelar o
  // SGP com pendências antigas que nunca vão casar)
  {
    const corteRecente = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const semCandidato = pendentes.filter((t) => {
      const cpf = normalizarCpf(t.cpf);
      return (
        cpf &&
        (t.fechado_em ?? "") >= corteRecente &&
        !porCpf.has(cpf) &&
        !porTelefone.has(normalizarTelefone(t.telefone))
      );
    });
    if (semCandidato.length > 0) {
      const { importarClientePorCpf } = await import("@/lib/sgp/importar");
      for (const t of semCandidato.slice(0, 5)) {
        const imp = await importarClientePorCpf(t.cpf!).catch(() => null);
        if (!imp?.ok || imp.clienteIds.length === 0) continue;
        // recarrega só os contratos dos clientes importados para o casamento
        const { data: extras } = await admin
          .from("contratos")
          .select("id, data_venda, cliente_id, clientes(cpf, telefone)")
          .in("cliente_id", imp.clienteIds)
          .gte("data_venda", corte)
          .limit(50);
        for (const c of (extras ?? []) as unknown as C[]) {
          const cpf = normalizarCpf(c.clientes?.cpf);
          const tel = normalizarTelefone(c.clientes?.telefone);
          if (cpf) (porCpf.get(cpf) ?? porCpf.set(cpf, []).get(cpf)!).push(c);
          if (tel) (porTelefone.get(tel) ?? porTelefone.set(tel, []).get(tel)!).push(c);
        }
      }
    }
  }

  let reconciliados = 0;
  for (const t of pendentes) {
    const candidatos =
      porCpf.get(normalizarCpf(t.cpf)) ?? porTelefone.get(normalizarTelefone(t.telefone)) ?? [];
    // contrato vendido entre um pouco antes da criação do ticket e a janela após o fechamento
    const criacao = t.criado_em.slice(0, 10);
    const limite = new Date(
      Date.parse(t.fechado_em!) + diasReconciliacao() * 86_400_000
    )
      .toISOString()
      .slice(0, 10);
    const escolhido = candidatos
      .filter((c) => c.data_venda >= addDias(criacao, -3) && c.data_venda <= limite)
      .sort((a, b) => (a.data_venda < b.data_venda ? -1 : 1))[0];
    if (!escolhido) continue;

    const { error } = await admin
      .from("tickets")
      .update({ contrato_id: escolhido.id, reconciliado_em: new Date().toISOString() })
      .eq("id", t.id)
      .is("contrato_id", null);
    if (error) continue;
    reconciliados += 1;

    // origem do ticket vira a origem oficial do cadastro (PRD 3.9) e a
    // vendedora do ticket é ATRIBUÍDA à venda (critério D5) — sem sobrescrever
    // atribuição já existente (manual ou anterior)
    const atualizacao: Record<string, unknown> = {};
    if (t.origem_cadastro) atualizacao.origem_cadastro = t.origem_cadastro;
    if (Object.keys(atualizacao).length > 0) {
      await admin.from("contratos").update(atualizacao).eq("id", escolhido.id);
    }
    if (t.vendedor_id) {
      await admin
        .from("contratos")
        .update({ vendedor_id: t.vendedor_id })
        .eq("id", escolhido.id)
        .is("vendedor_id", null);
    }
  }
  return reconciliados;
}

function addDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Executa as rotinas do CRM em sequência; usada no carregamento do /crm. */
/**
 * Venda apareceu no SGP → o ticket ABERTO do mesmo cliente (telefone/CPF) vira
 * Vendida automaticamente. Fecha o gap: o cliente compra no meio do funil e o
 * card ficava parado em "Contato inicial" mesmo com o contrato criado.
 * Com plano no contrato → fecha como convertido; sem plano → move para
 * "aguardando" já reconciliado (Criação do contrato).
 */
export async function converterVendidosPorSgp(): Promise<number> {
  const admin = criarClienteAdmin();
  const desde = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: contratos }, { data: abertos }] = await Promise.all([
    admin
      .from("contratos")
      .select(
        "id, sgp_contrato_id, plano_id, vendedor_id, valor_mensalidade, origem_cadastro, clientes(telefone, cpf, nome)"
      )
      .gte("data_venda", desde)
      .neq("status", "cancelado")
      .limit(1000),
    admin
      .from("tickets")
      .select("id, cliente_nome, telefone, cpf, etapa, vendedor_id")
      .neq("etapa", "fechado")
      .limit(2000),
  ]);
  if (!contratos?.length || !abertos?.length) return 0;

  let convertidos = 0;
  for (const c of contratos) {
    const cli = c.clientes as unknown as { telefone: string | null; cpf: string | null; nome: string } | null;
    const tel = normalizarTelefone(cli?.telefone);
    const cpf = normalizarCpf(cli?.cpf);
    if (!tel && !cpf) continue;
    const t = abertos.find(
      (x) =>
        (tel && normalizarTelefone(x.telefone) === tel) ||
        (cpf && normalizarCpf(x.cpf) === cpf)
    );
    if (!t) continue;

    const base = {
      contrato_id: c.id,
      reconciliado_em: new Date().toISOString(),
      valor_estimado: c.valor_mensalidade,
      urgencia: null,
      followup_em: null,
      atualizado_em: new Date().toISOString(),
    };
    const { error } = c.plano_id
      ? await admin
          .from("tickets")
          .update({
            ...base,
            etapa: "fechado",
            etapa_encerramento: t.etapa,
            desfecho: "convertido",
            fechado_por: "vendedora",
            fechado_em: new Date().toISOString(),
            plano_id: c.plano_id,
            origem_cadastro: c.origem_cadastro ?? "outro",
          })
          .eq("id", t.id)
      : await admin.from("tickets").update({ ...base, etapa: "aguardando" }).eq("id", t.id);
    if (error) {
      console.error(`converterVendidos: falha no ticket ${t.id} (${t.cliente_nome}):`, error.message);
      continue;
    }

    // vendedor: completa o lado que estiver faltando
    if (!c.vendedor_id && t.vendedor_id) {
      await admin.from("contratos").update({ vendedor_id: t.vendedor_id }).eq("id", c.id).is("vendedor_id", null);
    }

    await admin.from("ticket_eventos").insert({
      ticket_id: t.id,
      tipo: "nota",
      dados: {
        texto: `💰 Venda identificada no SGP (contrato #${c.sgp_contrato_id}) — ticket ${c.plano_id ? "fechado como Vendida" : "movido para Criação do contrato"} automaticamente.`,
      },
    });
    convertidos += 1;
    // tira da lista para não converter dois tickets no mesmo contrato
    abertos.splice(abertos.indexOf(t), 1);
  }
  return convertidos;
}

/**
 * Venda cadastrada DIRETO no SGP (sem ticket na plataforma) vira ticket
 * automaticamente, já com os dados do cadastro — nome, telefone, CPF, plano,
 * valor e vendedora. Com plano → nasce fechado como Vendida (coluna Contrato
 * assinado); sem plano → nasce em "Criação do contrato". Pedido de 01/09.
 */
type ContratoSemTicket = {
  id: string;
  sgp_contrato_id: string | number | null;
  plano_id: string | null;
  pop_id: string | null;
  vendedor_id: string | null;
  valor_mensalidade: number | null;
  origem_cadastro: string | null;
  data_venda: string;
  cli: { telefone: string | null; cpf: string | null; nome: string } | null;
};

/** chaves de cliente (telefone e CPF normalizados) de um ticket ou contrato */
function chavesDoCliente(telefone: string | null | undefined, cpf: string | null | undefined): string[] {
  const tel = normalizarTelefone(telefone);
  const doc = normalizarCpf(cpf);
  return [tel ? `t:${tel}` : null, doc ? `c:${doc}` : null].filter((k): k is string => Boolean(k));
}

/**
 * Vendas dos últimos 5 dias que ainda não têm ticket em lugar nenhum (só
 * leitura). Já tem ticket: (1) qualquer ticket, de qualquer origem e data,
 * ligado ao contrato; (2) qualquer ticket dos últimos 45 dias do mesmo
 * cliente (telefone/CPF) — a conversão/reconciliação cuida dos abertos.
 *
 * Correção de 09/11/2026: antes a rotina lia "todos os tickets de 45 dias"
 * numa consulta só, e a API da Supabase entrega no máximo 1.000 linhas.
 * Quando a base passou disso (1.141 em nov/2026), parte dos tickets sumiu da
 * conferência: a rotina recriava a cada 5 min um ticket automático que o
 * descarte de duplicados apagava logo depois, e cada criação disparava o
 * aviso "Novo ticket no CRM" (uns 7 mil por dia). Agora a conferência pelo
 * contrato é direta e a de telefone/CPF lê todas as páginas. Se alguma
 * leitura falhar, nada é criado nesta volta.
 */
export async function contratosSemTicket(): Promise<ContratoSemTicket[]> {
  const admin = criarClienteAdmin();
  const desde = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
  const { data: contratos, error } = await admin
    .from("contratos")
    .select(
      "id, sgp_contrato_id, plano_id, pop_id, vendedor_id, valor_mensalidade, origem_cadastro, data_venda, clientes(telefone, cpf, nome)"
    )
    .gte("data_venda", desde)
    .neq("status", "cancelado")
    .limit(1000);
  if (error) throw new Error(`contratos recentes: ${error.message}`);
  if (!contratos?.length) return [];

  // (1) tickets ligados aos contratos da vez — consulta direta, sem janela
  const comTicket = new Set<string>();
  const ids = contratos.map((c) => c.id as string);
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error: e } = await admin.from("tickets").select("contrato_id").in("contrato_id", ids.slice(i, i + 150));
    if (e) throw new Error(`tickets por contrato: ${e.message}`);
    for (const t of data ?? []) comTicket.add(t.contrato_id as string);
  }
  const candidatos = contratos.filter((c) => !comTicket.has(c.id as string));
  if (!candidatos.length) return [];

  // (2) tickets recentes do mesmo cliente — todas as páginas, em ordem fixa
  const chaves = new Set<string>();
  const desde45 = new Date(Date.now() - 45 * 86_400_000).toISOString();
  for (let de = 0; ; de += 1000) {
    const { data, error: e } = await admin
      .from("tickets")
      .select("telefone, cpf")
      .gte("criado_em", desde45)
      .order("id")
      .range(de, de + 999);
    if (e) throw new Error(`tickets recentes: ${e.message}`);
    for (const t of data ?? []) for (const k of chavesDoCliente(t.telefone, t.cpf)) chaves.add(k);
    if (!data || data.length < 1000) break;
  }

  const sem: ContratoSemTicket[] = [];
  for (const c of candidatos) {
    const cli = c.clientes as unknown as ContratoSemTicket["cli"];
    const ks = chavesDoCliente(cli?.telefone, cli?.cpf);
    if (!ks.length) continue; // identificação mínima do ticket
    if (ks.some((k) => chaves.has(k))) continue;
    ks.forEach((k) => chaves.add(k)); // dois contratos do mesmo cliente na mesma volta: um ticket só
    sem.push({
      id: c.id as string,
      sgp_contrato_id: c.sgp_contrato_id as string | number | null,
      plano_id: c.plano_id as string | null,
      pop_id: c.pop_id as string | null,
      vendedor_id: c.vendedor_id as string | null,
      valor_mensalidade: c.valor_mensalidade as number | null,
      origem_cadastro: c.origem_cadastro as string | null,
      data_venda: c.data_venda as string,
      cli,
    });
  }
  return sem;
}

export async function criarTicketsDeVendasSgp(): Promise<number> {
  const admin = criarClienteAdmin();
  let criados = 0;
  for (const c of await contratosSemTicket()) {
    const agora = new Date().toISOString();
    const base = {
      origem_criacao: "sgp_auto" as const,
      cliente_nome: c.cli?.nome ?? "Cliente do SGP",
      telefone: c.cli?.telefone ?? null,
      cpf: c.cli?.cpf ?? null,
      vendedor_id: c.vendedor_id,
      pop_id: c.pop_id,
      contrato_id: c.id,
      reconciliado_em: agora,
      valor_estimado: c.valor_mensalidade,
    };
    const { data: novo, error } = c.plano_id
      ? await admin
          .from("tickets")
          .insert({
            ...base,
            etapa: "fechado",
            etapa_encerramento: "novo",
            desfecho: "convertido",
            fechado_por: "vendedora",
            fechado_em: agora,
            plano_id: c.plano_id,
            origem_cadastro: c.origem_cadastro ?? "outro",
          })
          .select("id")
          .single()
      : await admin
          .from("tickets")
          .insert({ ...base, etapa: "aguardando" })
          .select("id")
          .single();
    // Erro inclui o índice único de 0132 (um sgp_auto por contrato): se outra
    // execução (cron e abertura do /crm ao mesmo tempo) gravou primeiro, esta
    // desiste em silêncio — o ticket já existe.
    if (error || !novo) continue;

    await admin.from("ticket_eventos").insert({
      ticket_id: novo.id,
      tipo: "nota",
      dados: {
        texto: `🤖 Ticket criado automaticamente: venda cadastrada direto no SGP (contrato #${c.sgp_contrato_id}, venda em ${c.data_venda}) — dados importados do cadastro.`,
      },
    });
    criados += 1;
  }
  return criados;
}

/**
 * Vendedora do ticket vendido segue a do CONTRATO (01/10/2026): o ticket
 * automático da venda no SGP nasce no mesmo instante em que o leitor de
 * painel identifica a vendedora — às vezes um segundo antes, e ficava órfão
 * para sempre. Preenche só quem está sem vendedora (não sobrescreve escolha
 * de gestor/coordenador).
 */
export async function herdarVendedoraDoContrato(): Promise<number> {
  const admin = criarClienteAdmin();
  // tickets tem duas ligações com contratos (contrato_id e, desde o Meu Dia,
  // indicado_por_contrato_id): sem o nome da ligação a consulta falhava
  // (PGRST201) e esta rotina não fazia nada desde meados de outubro.
  const { data, error } = await admin
    .from("tickets")
    .select("id, contratos!tickets_contrato_id_fkey!inner(vendedor_id, pop_id)")
    .is("vendedor_id", null)
    .not("contrato_id", "is", null)
    .not("contratos.vendedor_id", "is", null)
    .limit(500);
  if (error) throw new Error(`tickets sem vendedora: ${error.message}`);
  let n = 0;
  for (const t of data ?? []) {
    const ct = t.contratos as unknown as { vendedor_id: string; pop_id: string | null };
    const { error } = await admin
      .from("tickets")
      .update({ vendedor_id: ct.vendedor_id, ...(ct.pop_id ? { pop_id: ct.pop_id } : {}) })
      .eq("id", t.id)
      .is("vendedor_id", null);
    if (!error) n += 1;
  }
  return n;
}

/**
 * Mesma venda com dois tickets (01/10/2026): o automático do SGP
 * (`sgp_auto`, sem interação humana) nasce antes de a vendedora fechar o
 * ticket da conversa — os dois acabam no mesmo contrato e a venda conta em
 * dobro na conversão. O automático é descartado; o da conversa (com
 * histórico e consulta) fica.
 */
export async function descartarTicketsSgpDuplicados(): Promise<number> {
  const admin = criarClienteAdmin();
  const desde = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data: autos } = await admin
    .from("tickets")
    .select("id, contrato_id")
    .eq("origem_criacao", "sgp_auto")
    .not("contrato_id", "is", null)
    .gte("criado_em", desde)
    .limit(1000);
  if (!autos?.length) return 0;
  const comReal = new Set<string>();
  const contratosAuto = [...new Set(autos.map((a) => a.contrato_id as string))];
  for (let i = 0; i < contratosAuto.length; i += 150) {
    const { data: reais } = await admin
      .from("tickets")
      .select("contrato_id")
      .neq("origem_criacao", "sgp_auto")
      .in("contrato_id", contratosAuto.slice(i, i + 150));
    for (const r of reais ?? []) comReal.add(r.contrato_id as string);
  }
  let n = 0;
  for (const a of autos) {
    if (!comReal.has(a.contrato_id as string)) continue;
    const { data: ok } = await admin.rpc("descartar_ticket_automatico", { p_ticket_id: a.id });
    if (ok === true) n += 1;
  }
  return n;
}

export async function executarRotinasCrm() {
  const viradaMes = await fecharMesNaVirada().catch(() => 0);
  const fechados = (await fecharTicketsInativos()) + viradaMes;
  const vendidos = await converterVendidosPorSgp().catch(() => 0);
  const criados = await criarTicketsDeVendasSgp().catch(() => 0);
  await herdarVendedoraDoContrato().catch((e) => {
    console.error("[crm] herdarVendedoraDoContrato:", e instanceof Error ? e.message : e);
    return 0;
  });
  await descartarTicketsSgpDuplicados().catch(() => 0);
  const reconciliados = await reconciliarTickets();
  const { despacharLembretes } = await import("@/lib/notificacoes/lembretes");
  const lembretes = await despacharLembretes().catch(() => 0);
  return { fechados, vendidos, criados, reconciliados, lembretes };
}
