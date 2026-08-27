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

export async function executarRotinasCrm() {
  const fechados = await fecharTicketsInativos();
  const vendidos = await converterVendidosPorSgp().catch(() => 0);
  const reconciliados = await reconciliarTickets();
  const { despacharLembretes } = await import("@/lib/notificacoes/lembretes");
  const lembretes = await despacharLembretes().catch(() => 0);
  return { fechados, vendidos, reconciliados, lembretes };
}
