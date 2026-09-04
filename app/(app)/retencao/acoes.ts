"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil, exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export type Resultado = { erro?: string; ok?: string };

const revalidar = () => {
  revalidatePath("/retencao");
  revalidatePath("/minha-comissao");
};

/** Caso manual: cliente que chegou por telefone ou na loja. */
export async function criarCasoRetencao(
  _e: Resultado,
  dados: FormData
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  if (!["gestor", "agente_retencao"].includes(usuario.perfil))
    return { erro: "Sem permissão." };

  const nome = String(dados.get("cliente_nome") ?? "").trim();
  const contrato = String(dados.get("sgp_contrato_id") ?? "").trim();
  const telefone = String(dados.get("telefone") ?? "").trim();
  if (!nome) return { erro: "Informe o nome do cliente." };

  const admin = criarClienteAdmin();
  let contratoId: string | null = null;
  let vtv = 0;
  if (contrato) {
    const { data: c } = await admin
      .from("contratos")
      .select("id, valor_mensalidade, planos(valor_referencia)")
      .eq("sgp_contrato_id", contrato)
      .maybeSingle();
    if (!c) return { erro: `Contrato ${contrato} não encontrado na base.` };
    contratoId = c.id as string;
    const ref = Number((c.planos as unknown as { valor_referencia: number } | null)?.valor_referencia ?? 0);
    vtv = ref > 0 ? ref : Number(c.valor_mensalidade ?? 0);
  }

  // reincidência por telefone: apelido de WhatsApp não é confiável, número é
  let reincidenteDe: string | null = null;
  if (telefone) {
    const { data: ant } = await admin
      .from("casos_retencao")
      .select("id")
      .eq("telefone", telefone)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    reincidenteDe = (ant?.id as string) ?? null;
  }

  const { data: v } = await admin
    .from("vendedores")
    .select("sgp_login")
    .eq("id", usuario.vendedor_id ?? "00000000-0000-0000-0000-000000000000")
    .maybeSingle();
  const login = (v?.sgp_login as string | null)?.toLowerCase() ?? "sandryne.souza";

  const { error } = await admin.from("casos_retencao").insert({
    origem: "manual",
    cliente_nome: nome,
    telefone: telefone || null,
    contrato_id: contratoId,
    sgp_contrato_id: contrato || null,
    valor_mensal: vtv,
    agente_login: login,
    etapa: "novo",
    reincidente_de: reincidenteDe,
    criado_por: usuario.id,
  });
  if (error) return { erro: error.message };
  revalidar();
  return { ok: "Caso aberto." };
}

/** A agente registra a tratativa; retido/perdido só a auditoria carimba. */
/**
 * Nome e contrato editáveis pela agente: o nome do SZ às vezes vem só um
 * emoji/apelido, e o vínculo com o contrato preenche o VTV e o link do SGP.
 */
export async function editarIdentificacaoCaso(
  id: string,
  campos: { nome?: string; sgpContratoId?: string }
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  if (!["gestor", "agente_retencao"].includes(usuario.perfil))
    return { erro: "Sem permissão." };

  const admin = criarClienteAdmin();
  const upd: Record<string, unknown> = {};
  const nome = campos.nome?.trim();
  if (nome) upd.cliente_nome = nome;

  const contratoSgp = campos.sgpContratoId?.trim().replace(/\D/g, "");
  if (contratoSgp) {
    const { data: ct } = await admin
      .from("contratos")
      .select("id, sgp_contrato_id, valor_mensalidade, planos(valor_referencia), clientes(nome)")
      .eq("sgp_contrato_id", contratoSgp)
      .maybeSingle();
    if (!ct) return { erro: `Contrato #${contratoSgp} não encontrado na plataforma — confira o número no SGP.` };
    upd.contrato_id = ct.id;
    upd.sgp_contrato_id = ct.sgp_contrato_id;
    const ref = Number((ct.planos as unknown as { valor_referencia: number } | null)?.valor_referencia ?? 0);
    upd.valor_mensal = ref > 0 ? ref : Number(ct.valor_mensalidade ?? 0);
    // sem nome informado, aproveita o nome oficial do cadastro
    if (!nome) upd.cliente_nome = (ct.clientes as unknown as { nome: string } | null)?.nome ?? undefined;
  }
  if (Object.keys(upd).length === 0) return { erro: "Nada para salvar." };

  const { error } = await admin.from("casos_retencao").update(upd).eq("id", id);
  if (error) return { erro: error.message };
  revalidar();
  return { ok: "Identificação atualizada." };
}

export async function atualizarCaso(
  id: string,
  campos: {
    etapa?: string;
    trilha?: string;
    motivoDeclarado?: string;
    alcadaUsada?: string;
    resumo?: string;
    desfecho?: "irreversivel" | "perdido" | "transferido" | "sem_resposta" | "";
    irreversivelMotivo?: string;
  }
): Promise<Resultado> {
  const usuario = await exigirUsuario();
  if (!["gestor", "agente_retencao"].includes(usuario.perfil))
    return { erro: "Sem permissão." };

  if (campos.desfecho === "irreversivel" && !campos.irreversivelMotivo?.trim())
    return { erro: "Irreversível exige o motivo (mudança sem cobertura, inviabilidade...)." };
  // perdido manual (negociação encerrada): exige a tratativa registrada, para
  // o caso não morrer sem contexto — pedido da gestão em 04/09/2026
  if (campos.desfecho === "perdido" && !campos.motivoDeclarado?.trim())
    return { erro: "Perdido exige o motivo declarado pelo cliente." };

  const admin = criarClienteAdmin();
  const upd: Record<string, unknown> = {};
  if (campos.etapa) upd.etapa = campos.etapa;
  if (campos.trilha !== undefined) upd.trilha = campos.trilha || null;
  if (campos.motivoDeclarado !== undefined) upd.motivo_declarado = campos.motivoDeclarado || null;
  if (campos.alcadaUsada !== undefined) upd.alcada_usada = campos.alcadaUsada || null;
  if (campos.resumo !== undefined) upd.resumo = campos.resumo || null;
  if (campos.desfecho) {
    upd.desfecho = campos.desfecho;
    upd.desfecho_em = new Date().toISOString();
    upd.desfecho_auto = false;
    upd.etapa = "fechado";
    if (campos.desfecho === "irreversivel") {
      upd.irreversivel_motivo = campos.irreversivelMotivo;
      // proposta da agente: fica pendente até o gestor aprovar com evidência
      upd.irreversivel_status = "pendente";
    }
  }
  const { error } = await admin.from("casos_retencao").update(upd).eq("id", id);
  if (error) return { erro: error.message };
  revalidar();
  return { ok: "Caso atualizado." };
}

/** Auditoria manual: carimba retido/perdido/em risco pelo status do SGP. */
export async function rodarAuditoria(): Promise<Resultado & { detalhe?: string }> {
  await exigirPerfil(["gestor"]);
  const { auditarRetencao } = await import("@/lib/retencao/auditoria");
  const r = await auditarRetencao();
  if (!r.ok) return { erro: r.erro };
  revalidar();
  return {
    ok: "Auditoria concluída.",
    detalhe: `${r.verificados} verificados · ${r.retidos} retidos · ${r.perdidos} perdidos · ${r.emRisco} em risco · ${r.clawbacks} clawback(s)`,
  };
}

/** Analisa a conversa do caso com IA (motivo real, oferta, divergência). */
export async function analisarCaso(id: string, transcript: string): Promise<Resultado> {
  const usuario = await exigirUsuario();
  if (!["gestor", "agente_retencao"].includes(usuario.perfil))
    return { erro: "Sem permissão." };
  if (transcript.trim().length < 40) return { erro: "Cole a conversa (mínimo de contexto)." };

  const admin = criarClienteAdmin();
  const { data: caso } = await admin
    .from("casos_retencao")
    .select("motivo_declarado, alcada_usada, desfecho")
    .eq("id", id)
    .maybeSingle();
  if (!caso) return { erro: "Caso não encontrado." };

  const { analisarConversaRetencao } = await import("@/lib/ia/analista");
  try {
    const analise = await analisarConversaRetencao(transcript, {
      motivo: caso.motivo_declarado as string,
      alcada: caso.alcada_usada as string,
      desfecho: caso.desfecho as string,
    });
    if (!analise) return { erro: "A análise não retornou um resultado válido." };
    await admin
      .from("casos_retencao")
      .update({ analise, analisado_em: new Date().toISOString() })
      .eq("id", id);
    revalidar();
    return { ok: "Conversa analisada." };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Busca manual das conversas do canal de cancelamento no SZ (dia corrente). */
export async function buscarConversasCanal(): Promise<Resultado & { detalhe?: string }> {
  await exigirPerfil(["gestor"]);
  const { rodarRoboRetencao } = await import("@/lib/retencao/robo");
  const r = await rodarRoboRetencao();
  if (!r.ok) return { erro: r.erro };
  revalidar();
  return {
    ok: "Canal varrido.",
    detalhe: `${r.lidas} conversa(s) no canal · ${r.criados} caso(s) novo(s) · ${r.reincidentes} reincidente(s)`,
  };
}

/**
 * Decisão do gestor sobre um irreversível proposto. Aprovado sai do
 * denominador da taxa; rejeitado volta ao fluxo normal e a auditoria carimba
 * pelo status do SGP na próxima rodada.
 */
export async function decidirIrreversivel(
  id: string,
  aprovar: boolean,
  observacao?: string
): Promise<Resultado> {
  const usuario = await exigirPerfil(["gestor"]);
  const admin = criarClienteAdmin();
  if (aprovar) {
    const { error } = await admin
      .from("casos_retencao")
      .update({
        irreversivel_status: "aprovado",
        irreversivel_decidido_por: usuario.id,
        irreversivel_decidido_em: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("desfecho", "irreversivel");
    if (error) return { erro: error.message };
  } else {
    const { data: caso } = await admin
      .from("casos_retencao")
      .select("irreversivel_motivo")
      .eq("id", id)
      .maybeSingle();
    const { error } = await admin
      .from("casos_retencao")
      .update({
        desfecho: null,
        desfecho_em: null,
        desfecho_auto: false,
        etapa: "negociacao",
        irreversivel_status: "rejeitado",
        irreversivel_decidido_por: usuario.id,
        irreversivel_decidido_em: new Date().toISOString(),
        resumo: observacao
          ? `[gestor rejeitou irreversível: ${observacao}] motivo proposto: ${caso?.irreversivel_motivo ?? "-"}`
          : undefined,
      })
      .eq("id", id);
    if (error) return { erro: error.message };
  }
  revalidar();
  return { ok: aprovar ? "Irreversível aprovado — sai da conta da taxa." : "Rejeitado — o caso volta ao fluxo e a auditoria vai carimbar pelo SGP." };
}

/**
 * Reabre um caso encerrado por engano (só gestor). Dois destinos:
 * - como irreversível PENDENTE: para o caso que estava em análise de mudança
 *   real — fica aguardando a aprovação da gestão e a auditoria não o recarimba;
 * - reaberto em negociação: desfecho limpo. Atenção: se o contrato estiver
 *   cancelado no SGP, a PRÓXIMA auditoria volta a carimbar "perdido" — use o
 *   destino irreversível quando for esse o caso.
 */
export async function reabrirCaso(
  id: string,
  comoIrreversivel: boolean,
  motivo?: string
): Promise<Resultado> {
  const usuario = await exigirPerfil(["gestor"]);
  const texto = (motivo ?? "").trim();
  const admin = criarClienteAdmin();

  const { data: caso } = await admin
    .from("casos_retencao")
    .select("desfecho, resumo")
    .eq("id", id)
    .maybeSingle();
  if (!caso) return { erro: "Caso não encontrado." };
  if (!caso.desfecho) return { erro: "O caso já está aberto." };

  const nota = `[gestor reabriu (era ${caso.desfecho})${texto ? `: ${texto}` : ""}]`;
  const resumo = caso.resumo ? `${nota} ${caso.resumo}` : nota;

  const { error } = await admin
    .from("casos_retencao")
    .update(
      comoIrreversivel
        ? {
            desfecho: "irreversivel",
            desfecho_em: new Date().toISOString(),
            desfecho_auto: false,
            irreversivel_status: "pendente",
            irreversivel_motivo: texto || "reaberto pela gestão para análise de irreversível",
            irreversivel_decidido_por: null,
            irreversivel_decidido_em: null,
            clawback_em: null,
            resumo,
          }
        : {
            desfecho: null,
            desfecho_em: null,
            desfecho_auto: false,
            etapa: "negociacao",
            clawback_em: null,
            resumo,
          }
    )
    .eq("id", id);
  if (error) return { erro: error.message };
  void usuario;
  revalidar();
  return {
    ok: comoIrreversivel
      ? "Caso voltou para irreversível — aguardando sua aprovação."
      : "Caso reaberto em negociação.",
  };
}
