"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
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
 * Fechamento de comissão do mês (PRD seção 6): gera snapshot IMUTÁVEL por
 * vendedora em comissoes_fechadas. Recalcular exige refazer explicitamente.
 */
export async function fecharComissoes(mesAno: string): Promise<EstadoFechamento> {
  const usuario = await exigirPerfil(["gestor"]);
  if (!/^\d{4}-\d{2}-01$/.test(mesAno)) return { erro: "Mês inválido." };

  const supabase = criarClienteServidor();
  const comissoes = await comissoesDoMes(mesAno);
  const calculaveis = comissoes.filter((c) => c.resultado !== null);
  if (calculaveis.length === 0)
    return { erro: "Nenhuma vendedora com meta e regra vigente neste mês." };

  let fechadas = 0;
  for (const c of calculaveis) {
    const { error } = await supabase.from("comissoes_fechadas").upsert(
      {
        vendedor_id: c.vendedorId,
        mes_ano: mesAno,
        snapshot: {
          regra_id: c.regra!.id,
          meta: c.metaMensal,
          resultado: c.resultado,
          fechado_em: new Date().toISOString(),
        },
        valor_total: c.resultado!.total,
        fechado_por: usuario.id,
      },
      { onConflict: "vendedor_id,mes_ano", ignoreDuplicates: true }
    );
    if (!error) fechadas += 1;
  }
  revalidatePath("/metas");
  return { fechadas, total: calculaveis.length };
}

/** Recálculo retroativo: só por ação explícita do gestor (PRD 6). */
export async function refazerFechamento(mesAno: string): Promise<EstadoFechamento> {
  await exigirPerfil(["gestor"]);
  const supabase = criarClienteServidor();
  const { error } = await supabase.from("comissoes_fechadas").delete().eq("mes_ano", mesAno);
  if (error) return { erro: error.message };
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
