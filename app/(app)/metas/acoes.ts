"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { comissoesDoMes } from "@/lib/comissao/dados";

export type EstadoMeta = { erro?: string; ok?: boolean };

/**
 * Cadastro de metas (PRD 3.7) — só gestor. A RLS também bloqueia no banco;
 * a checagem aqui devolve mensagem amigável em vez de erro de política.
 */
export async function salvarMeta(_estado: EstadoMeta, dados: FormData): Promise<EstadoMeta> {
  const usuario = await exigirPerfil(["gestor"]);

  const escopo = String(dados.get("escopo") ?? "");
  const referencia = String(dados.get("referencia_id") ?? "");
  const mesAno = String(dados.get("mes_ano") ?? ""); // aaaa-mm
  const quantidade = Number(dados.get("quantidade_vendas"));

  if (!["global", "pop", "vendedora"].includes(escopo)) return { erro: "Escopo inválido." };
  if (escopo !== "global" && !referencia) return { erro: "Selecione a POP ou a vendedora." };
  if (!/^\d{4}-\d{2}$/.test(mesAno)) return { erro: "Informe o mês de referência." };
  if (!Number.isInteger(quantidade) || quantidade <= 0)
    return { erro: "Quantidade de vendas deve ser um inteiro positivo." };

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("metas").upsert(
    {
      escopo,
      referencia_id: escopo === "global" ? null : referencia,
      mes_ano: `${mesAno}-01`,
      quantidade_vendas: quantidade,
      criado_por: usuario.id,
    },
    { onConflict: "escopo,referencia_id,mes_ano" }
  );

  if (error) return { erro: `Não foi possível salvar: ${error.message}` };

  revalidatePath("/metas");
  revalidatePath("/dashboard");
  revalidatePath("/vendedoras");
  return { ok: true };
}

export async function excluirMeta(id: string): Promise<EstadoMeta> {
  await exigirPerfil(["gestor"]);
  const supabase = criarClienteServidor();
  const { error } = await supabase.from("metas").delete().eq("id", id);
  if (error) return { erro: error.message };
  revalidatePath("/metas");
  return { ok: true };
}

export type EstadoFechamento = { erro?: string; fechadas?: number; total?: number };

/**
 * Fechamento de comissão do mês (PRD seção 6): grava o snapshot IMUTÁVEL por
 * vendedora em comissoes_fechadas. A partir daqui o financeiro paga sobre ESTE
 * número — nada que mude no SGP depois altera o que já foi apurado.
 *
 * O snapshot precisa se explicar sozinho numa auditoria futura, então congela
 * a regra inteira, a lista nominal de contratos e cada exceção aplicada
 * (liberação manual, dispensa de assinatura, débito) — ver lib/comissao/snapshot.
 */
export async function fecharComissoes(mesAno: string): Promise<EstadoFechamento> {
  const usuario = await exigirPerfil(["gestor"]);
  if (!/^\d{4}-\d{2}-01$/.test(mesAno)) return { erro: "Mês inválido." };

  const supabase = criarClienteServidor();
  const { montarSnapshots, montarSnapshotsRefidelizacao, montarSnapshotsRetencao } =
    await import("@/lib/comissao/snapshot");
  const [vendas, refidelizacao, retencao] = await Promise.all([
    montarSnapshots(mesAno, usuario.nome ?? null),
    montarSnapshotsRefidelizacao(mesAno, usuario.nome ?? null),
    montarSnapshotsRetencao(mesAno, usuario.nome ?? null),
  ]);
  // Atendimento e Retenção entram no mesmo fechamento: o financeiro recebe
  // todo mundo na mesma competência, com o demonstrativo no mesmo formato
  const snapshots = new Map([...vendas, ...refidelizacao, ...retencao]);
  if (snapshots.size === 0)
    return { erro: "Nenhuma vendedora com meta e regra vigente neste mês." };

  // versão preservada quando é refechamento (o histórico já guardou a anterior)
  const { data: existentes } = await supabase
    .from("comissoes_fechadas")
    .select("vendedor_id, versao")
    .eq("mes_ano", mesAno);
  const versaoDe = new Map((existentes ?? []).map((e) => [e.vendedor_id as string, e.versao as number]));

  let fechadas = 0;
  for (const [vendedorId, snap] of snapshots) {
    const { error } = await supabase.from("comissoes_fechadas").upsert(
      {
        vendedor_id: vendedorId,
        mes_ano: mesAno,
        snapshot: snap as unknown as Record<string, unknown>,
        valor_total: snap.resultado.total,
        fechado_em: snap.fechadoEm,
        fechado_por: usuario.id,
        versao: versaoDe.get(vendedorId) ?? 1,
      },
      { onConflict: "vendedor_id,mes_ano" }
    );
    if (!error) fechadas += 1;
  }
  revalidatePath("/metas");
  revalidatePath("/financeiro");
  revalidatePath("/minhas-vendas");
  return { fechadas, total: snapshots.size };
}

/**
 * Reabertura: só o Administrador, com motivo. O fechamento anterior NÃO é
 * apagado — vai para comissoes_fechadas_historico e a versão sobe, de modo que
 * um demonstrativo já entregue continue identificável pelo código de
 * verificação impresso nele.
 */
export async function refazerFechamento(
  mesAno: string,
  motivo?: string
): Promise<EstadoFechamento> {
  const usuario = await exigirPerfil(["gestor"]);
  const texto = (motivo ?? "").trim();
  if (texto.length < 5)
    return { erro: "Descreva o motivo da reabertura (mín. 5 caracteres) — ele fica no histórico." };

  const admin = criarClienteAdmin();
  const { data: atuais } = await admin
    .from("comissoes_fechadas")
    .select("vendedor_id, mes_ano, versao, snapshot, valor_total, fechado_em, fechado_por")
    .eq("mes_ano", mesAno);

  if (atuais && atuais.length > 0) {
    await admin.from("comissoes_fechadas_historico").insert(
      atuais.map((a) => ({
        vendedor_id: a.vendedor_id,
        mes_ano: a.mes_ano,
        versao: a.versao,
        snapshot: a.snapshot,
        valor_total: a.valor_total,
        fechado_em: a.fechado_em,
        fechado_por: a.fechado_por,
        motivo: texto,
      }))
    );
    // pagamento e versão são zerados/incrementados no refechamento
    for (const a of atuais) {
      await admin
        .from("comissoes_fechadas")
        .update({
          versao: (a.versao as number) + 1,
          reaberto_em: new Date().toISOString(),
          reaberto_por: usuario.id,
          reaberto_motivo: texto,
          pago_em: null,
          pago_por: null,
        })
        .eq("vendedor_id", a.vendedor_id)
        .eq("mes_ano", mesAno);
    }
  }
  return fecharComissoes(mesAno);
}

// ---------------------------------------------------------------------------
// Regras de comissão por agente/equipe/global (PRD seção 6)
// ---------------------------------------------------------------------------
export type EstadoRegra = { erro?: string; ok?: boolean };

export async function salvarRegraComissao(
  _e: EstadoRegra,
  dados: FormData
): Promise<EstadoRegra> {
  await exigirPerfil(["gestor"]);

  const escopo = String(dados.get("escopo") ?? "");
  const referencia = String(dados.get("referencia_id") ?? "") || null;
  const inicio = String(dados.get("vigencia_inicio") ?? ""); // aaaa-mm
  const fim = String(dados.get("vigencia_fim") ?? ""); // aaaa-mm ou vazio
  const estorno = Number(dados.get("estorno_dias") ?? 90);

  if (!["global", "pop", "vendedora"].includes(escopo)) return { erro: "Escopo inválido." };
  if (escopo !== "global" && !referencia)
    return { erro: "Selecione a vendedora ou a equipe (POP)." };
  if (!/^\d{4}-\d{2}$/.test(inicio)) return { erro: "Informe o mês de início da vigência." };
  if (fim && !/^\d{4}-\d{2}$/.test(fim)) return { erro: "Mês de fim da vigência inválido." };
  if (!Number.isInteger(estorno) || estorno < 0 || estorno > 365)
    return { erro: "Estorno deve ser um número de dias entre 0 e 365." };

  let degraus: unknown;
  let gatilhos: unknown;
  try {
    degraus = JSON.parse(String(dados.get("degraus") ?? "[]"));
    gatilhos = JSON.parse(String(dados.get("gatilhos") ?? "[]"));
  } catch {
    return { erro: "Degraus/gatilhos malformados." };
  }
  if (!Array.isArray(degraus) || degraus.length === 0)
    return { erro: "Cadastre ao menos um degrau." };
  for (const d of degraus as Record<string, unknown>[]) {
    const min = Number(d.atingimento_min);
    const valor = Number(d.valor);
    if (!Number.isFinite(min) || min < 0) return { erro: "Degrau com % mínimo inválido." };
    if (!Number.isFinite(valor) || valor <= 0) return { erro: "Degrau com valor inválido." };
    if (!["valor_por_venda", "percentual_receita"].includes(String(d.tipo)))
      return { erro: "Tipo de degrau inválido." };
  }

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("regras_comissao").insert({
    escopo,
    referencia_id: escopo === "global" ? null : referencia,
    vigencia_inicio: `${inicio}-01`,
    vigencia_fim: fim ? `${fim}-01` : null,
    degraus,
    gatilhos: Array.isArray(gatilhos) ? gatilhos : [],
    estorno_dias: estorno,
  });
  if (error) return { erro: error.message };

  revalidatePath("/metas");
  return { ok: true };
}

/** Encerra a vigência (preserva o histórico — PRD 3.10). */
export async function encerrarRegra(id: string, fimMes: string): Promise<EstadoRegra> {
  await exigirPerfil(["gestor"]);
  if (!/^\d{4}-\d{2}$/.test(fimMes)) return { erro: "Mês de encerramento inválido." };
  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("regras_comissao")
    .update({ vigencia_fim: `${fimMes}-01` })
    .eq("id", id);
  if (error) return { erro: error.message };
  revalidatePath("/metas");
  return { ok: true };
}

export async function excluirRegra(id: string): Promise<EstadoRegra> {
  await exigirPerfil(["gestor"]);
  const supabase = criarClienteServidor();
  const { error } = await supabase.from("regras_comissao").delete().eq("id", id);
  if (error) return { erro: error.message };
  revalidatePath("/metas");
  return { ok: true };
}
