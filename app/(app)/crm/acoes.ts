"use server";

import { revalidatePath } from "next/cache";
import { ehAgenteCrm } from "@/lib/tipos";
import { redirect } from "next/navigation";
import { exigirUsuario, exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import {
  normalizarCpf,
  normalizarTelefone,
  podeReabrir,
} from "@/lib/indicadores/crm";

export type EstadoAcao = {
  erro?: string;
  ok?: boolean;
  /** ticket aberto já existente para o mesmo telefone/CPF (anti-duplicidade) */
  ticketExistenteId?: string;
  /** ticket fechado há ≤30 dias que pode ser reaberto */
  ticketReabrivelId?: string;
};

function revalidar() {
  revalidatePath("/crm");
}

// ---------------------------------------------------------------------------
// Criação manual (PRD 3.9): formulário de 20 segundos + anti-duplicidade
// ---------------------------------------------------------------------------
export async function criarTicket(_e: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  const supabase = criarClienteServidor();

  const nome = String(dados.get("cliente_nome") ?? "").trim();
  const telefone = String(dados.get("telefone") ?? "").trim();
  const cpf = String(dados.get("cpf") ?? "").trim();
  const email = String(dados.get("email") ?? "").trim().toLowerCase();
  const forcar = dados.get("forcar") === "sim";
  // venda externa: lead sondado na rua entra direto no funil Pré-Cadastro
  const preCadastro = dados.get("modo") === "pre_cadastro";

  if (!nome) return { erro: "Informe o nome do cliente." };
  if (!telefone && !cpf) return { erro: "Informe telefone ou CPF (obrigatório para reconciliar com o SGP)." };

  // ---------- anti-duplicidade ----------
  if (!forcar) {
    const tel = normalizarTelefone(telefone);
    const doc = normalizarCpf(cpf);
    const { data: candidatos } = await supabase
      .from("tickets")
      .select("id, etapa, desfecho, fechado_em, telefone, cpf")
      .order("criado_em", { ascending: false })
      .limit(500);

    const agora = new Date().toISOString();
    for (const t of candidatos ?? []) {
      const mesmoContato =
        (tel && normalizarTelefone(t.telefone) === tel) ||
        (doc && normalizarCpf(t.cpf) === doc);
      if (!mesmoContato) continue;
      if (t.etapa !== "fechado") return { ticketExistenteId: t.id };
      if (podeReabrir(t, agora)) return { ticketReabrivelId: t.id };
    }
  }

  // vendedora cria para si; supervisor/gestor podem deixar "não atribuído"
  const vendedorForm = String(dados.get("vendedor_id") ?? "");
  const vendedorId =
    ehAgenteCrm(usuario.perfil) ? usuario.vendedor_id : vendedorForm || null;

  let popId = usuario.pop_id;
  if (vendedorId) {
    const { data: v } = await supabase
      .from("vendedores").select("pop_id").eq("id", vendedorId).maybeSingle();
    popId = v?.pop_id ?? popId;
  }

  const { data: novo, error } = await supabase
    .from("tickets")
    .insert({
      origem_criacao: "manual",
      cliente_nome: nome,
      telefone: telefone || null,
      cpf: cpf || null,
      email: email || null,
      vendedor_id: vendedorId,
      pop_id: popId,
      etapa: preCadastro ? "pre_cadastro" : "novo",
    })
    .select("id")
    .single();

  if (error) return { erro: `Não foi possível criar: ${error.message}` };
  revalidar();
  redirect(`/crm/${novo.id}`);
}

// ---------------------------------------------------------------------------
// Etapas, notas, follow-up, reatribuição
// ---------------------------------------------------------------------------
const ETAPAS_ABERTAS = ["novo", "em_atendimento", "proposta", "aguardando"];

export async function mudarEtapa(ticketId: string, etapa: string): Promise<EstadoAcao> {
  await exigirUsuario();
  if (!ETAPAS_ABERTAS.includes(etapa))
    return { erro: "Para fechar, use o fechamento com desfecho." };
  const supabase = criarClienteServidor();
  const { error } = await supabase.from("tickets").update({ etapa }).eq("id", ticketId);
  if (error) return { erro: error.message };
  revalidar();
  revalidatePath(`/crm/${ticketId}`);
  return { ok: true };
}

export async function adicionarNota(_e: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  const ticketId = String(dados.get("ticket_id") ?? "");
  const texto = String(dados.get("texto") ?? "").trim();
  if (!texto) return { erro: "Escreva a nota." };

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("ticket_eventos").insert({
    ticket_id: ticketId,
    tipo: "nota",
    dados: { texto },
    usuario_id: usuario.id,
  });
  if (error) return { erro: error.message };
  // nota conta como interação: renova o relógio de inatividade
  await supabase
    .from("tickets")
    .update({ atualizado_em: new Date().toISOString() })
    .eq("id", ticketId);
  revalidatePath(`/crm/${ticketId}`);
  revalidar();
  return { ok: true };
}

export async function agendarFollowup(_e: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  await exigirUsuario();
  const ticketId = String(dados.get("ticket_id") ?? "");
  const quando = String(dados.get("followup_em") ?? "");
  if (!quando) return { erro: "Informe a data de retorno." };

  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("tickets")
    .update({ followup_em: `${quando}T12:00:00` })
    .eq("id", ticketId);
  if (error) return { erro: error.message };
  revalidatePath(`/crm/${ticketId}`);
  revalidar();
  return { ok: true };
}

export async function reatribuirTicket(_e: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  await exigirPerfil(["gestor", "supervisor"]); // PRD seção 2: reatribuição é do supervisor/gestor
  const ticketId = String(dados.get("ticket_id") ?? "");
  const vendedorId = String(dados.get("vendedor_id") ?? "");
  if (!vendedorId) return { erro: "Selecione a vendedora." };

  const supabase = criarClienteServidor();
  const { data: v } = await supabase
    .from("vendedores").select("pop_id").eq("id", vendedorId).maybeSingle();
  const { error } = await supabase
    .from("tickets")
    .update({ vendedor_id: vendedorId, pop_id: v?.pop_id ?? null })
    .eq("id", ticketId);
  if (error) return { erro: error.message };
  revalidatePath(`/crm/${ticketId}`);
  revalidar();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Fechamento obrigatório com desfecho (regra central do módulo)
// ---------------------------------------------------------------------------
export async function fecharTicket(_e: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  await exigirUsuario();
  const ticketId = String(dados.get("ticket_id") ?? "");
  const desfecho = String(dados.get("desfecho") ?? "");

  const supabase = criarClienteServidor();

  // padrão RD: perdida fica na coluna do funil onde parou (com o selo);
  // guardamos a etapa atual antes de fechar
  const { data: atual } = await supabase
    .from("tickets")
    .select("etapa")
    .eq("id", ticketId)
    .maybeSingle();
  const etapaEncerramento =
    atual && atual.etapa !== "fechado" ? (atual.etapa as string) : null;

  if (desfecho === "convertido") {
    const planoId = String(dados.get("plano_id") ?? "");
    const origem = String(dados.get("origem_cadastro") ?? "");
    const cpf = String(dados.get("cpf") ?? "").trim();
  const email = String(dados.get("email") ?? "").trim().toLowerCase();
    const telefone = String(dados.get("telefone") ?? "").trim();

    if (!planoId) return { erro: "Convertido exige o plano vendido." };
    if (!origem) return { erro: "Convertido exige a origem de entrada." };
    if (!cpf && !telefone)
      return { erro: "Convertido exige CPF ou telefone para reconciliar com o SGP." };

    const { error } = await supabase
      .from("tickets")
      .update({
        etapa: "fechado",
        etapa_encerramento: etapaEncerramento,
        desfecho: "convertido",
        fechado_por: "vendedora",
        plano_id: planoId,
        origem_cadastro: origem,
        cpf: cpf || null,
      email: email || null,
        telefone: telefone || null,
      })
      .eq("id", ticketId);
    if (error) return { erro: `O banco recusou o fechamento: ${error.message}` };
  } else if (desfecho === "nao_convertido") {
    const motivoId = String(dados.get("motivo_id") ?? "");
    const observacao = String(dados.get("observacao") ?? "").trim();
    if (!motivoId) return { erro: "Não convertido exige o motivo." };

    const { error } = await supabase
      .from("tickets")
      .update({
        etapa: "fechado",
        etapa_encerramento: etapaEncerramento,
        desfecho: "nao_convertido",
        fechado_por: "vendedora",
        motivo_id: motivoId,
      })
      .eq("id", ticketId);
    if (error) return { erro: `O banco recusou o fechamento: ${error.message}` };

    if (observacao) {
      const usuario = await exigirUsuario();
      await supabase.from("ticket_eventos").insert({
        ticket_id: ticketId,
        tipo: "nota",
        dados: { texto: `Observação do fechamento: ${observacao}` },
        usuario_id: usuario.id,
      });
    }
  } else {
    return { erro: "Não existe fechar sem desfecho (PRD 3.9)." };
  }

  revalidatePath(`/crm/${ticketId}`);
  revalidar();
  return { ok: true };
}

export async function reabrirTicket(ticketId: string): Promise<EstadoAcao> {
  await exigirUsuario();
  const supabase = criarClienteServidor();

  const { data: t } = await supabase
    .from("tickets")
    .select("etapa, desfecho, fechado_em")
    .eq("id", ticketId)
    .maybeSingle();
  if (!t) return { erro: "Ticket não encontrado." };
  if (!podeReabrir(t, new Date().toISOString()))
    return { erro: "Só é possível reabrir ticket não convertido fechado há até 30 dias." };

  const { error } = await supabase
    .from("tickets")
    .update({ etapa: "em_atendimento" }) // trigger limpa desfecho/motivo/fechado_em
    .eq("id", ticketId);
  if (error) return { erro: error.message };
  revalidatePath(`/crm/${ticketId}`);
  revalidar();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tratativa (histórico/agenda): nota datada + retorno combinado opcional.
// Cliente corporativo leva mais tempo — cada contato fica registrado no
// histórico do ticket, e o retorno combinado vira ação agendada com lembrete.
// ---------------------------------------------------------------------------
export async function registrarTratativa(_e: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  const ticketId = String(dados.get("ticket_id") ?? "");
  const texto = String(dados.get("texto") ?? "").trim();
  const retornoData = String(dados.get("retorno_data") ?? "");
  const retornoHora = String(dados.get("retorno_hora") ?? "");
  if (!texto) return { erro: "Descreva a tratativa (o que foi conversado)." };
  if ((retornoData && !retornoHora) || (!retornoData && retornoHora))
    return { erro: "Para combinar retorno, informe data E hora." };

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("ticket_eventos").insert({
    ticket_id: ticketId,
    tipo: "nota",
    dados: {
      texto: `📞 Tratativa: ${texto}${
        retornoData ? ` · retorno combinado para ${retornoData.split("-").reverse().join("/")} às ${retornoHora}` : ""
      }`,
    },
    usuario_id: usuario.id,
  });
  if (error) return { erro: error.message };

  if (retornoData && retornoHora) {
    await supabase.from("ticket_acoes").insert({
      ticket_id: ticketId,
      descricao: "Retornar para o cliente (combinado na tratativa)",
      quando: `${retornoData}T${retornoHora}:00-03:00`,
      criado_por: usuario.id,
    });
  }
  // tratativa conta como interação: renova o relógio de inatividade
  await supabase
    .from("tickets")
    .update({ atualizado_em: new Date().toISOString() })
    .eq("id", ticketId);
  revalidatePath(`/crm/${ticketId}`);
  revalidar();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Follow-up pendente: marcar como FEITO com o retorno obtido
// ---------------------------------------------------------------------------
export async function concluirFollowupIa(_e: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  const ticketId = String(dados.get("ticket_id") ?? "");
  const retorno = String(dados.get("retorno") ?? "").trim();

  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("tickets")
    .update({
      urgencia: null, // sai da fila de follow-ups pendentes
      followup_feito_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", ticketId);
  if (error) return { erro: error.message };

  await supabase.from("ticket_eventos").insert({
    ticket_id: ticketId,
    tipo: "nota",
    dados: {
      texto: `✅ Follow-up concluído${retorno ? ` · retorno: ${retorno}` : ""}.`,
    },
    usuario_id: usuario.id,
  });
  revalidatePath(`/crm/${ticketId}`);
  revalidar();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ações agendadas do ticket ("ligar amanhã às 10:00") com lembrete
// ---------------------------------------------------------------------------
export async function criarAcaoTicket(_e: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  const ticketId = String(dados.get("ticket_id") ?? "");
  const descricao = String(dados.get("descricao") ?? "").trim();
  const data = String(dados.get("data") ?? "");
  const hora = String(dados.get("hora") ?? "");
  if (!descricao) return { erro: "Descreva a ação (ex.: ligar para o cliente)." };
  if (!data || !hora) return { erro: "Informe data e hora do lembrete." };

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("ticket_acoes").insert({
    ticket_id: ticketId,
    descricao,
    quando: `${data}T${hora}:00-03:00`, // horário de Santarém
    criado_por: usuario.id,
  });
  if (error) return { erro: error.message };
  revalidatePath(`/crm/${ticketId}`);
  return { ok: true };
}

export async function concluirAcaoTicket(acaoId: string, ticketId: string): Promise<EstadoAcao> {
  await exigirUsuario();
  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("ticket_acoes")
    .update({ concluida_em: new Date().toISOString() })
    .eq("id", acaoId);
  if (error) return { erro: error.message };
  revalidatePath(`/crm/${ticketId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Atualizar do SGP sob demanda: força a busca do status do contrato
// (ativo/inativo), assinaturas e OS/agendamento — sem esperar o sync.
// ---------------------------------------------------------------------------
export type ResumoSgp = {
  erro?: string;
  statusSgp?: string;
  termoAssinado?: boolean;
  fidelidadeAssinada?: boolean;
  osAbertas?: { protocolo: string | null; agendamento: string | null; responsavel: string | null }[];
};

export async function atualizarTicketDoSgp(ticketId: string): Promise<ResumoSgp> {
  await exigirUsuario();
  const supabase = criarClienteServidor();
  const { data: t } = await supabase
    .from("tickets")
    .select("contrato_id, cpf, telefone")
    .eq("id", ticketId)
    .maybeSingle();
  let contratoId = t?.contrato_id as string | null;
  if (!contratoId) {
    // sem vínculo ainda: busca ATIVA no SGP pelo CPF do ticket, importa o
    // cliente/contrato na hora e reconcilia — sem esperar a varredura passar
    if (!t?.cpf)
      return {
        erro: "Ticket sem CPF — inclua o CPF do cliente para buscar o contrato no SGP.",
      };
    const { importarClientePorCpf } = await import("@/lib/sgp/importar");
    const imp = await importarClientePorCpf(t.cpf);
    if (!imp.ok) return { erro: `Busca no SGP: ${imp.erro}` };
    const { reconciliarTickets } = await import("@/lib/crm/rotinas");
    await reconciliarTickets();
    const { data: depois } = await supabase
      .from("tickets")
      .select("contrato_id")
      .eq("id", ticketId)
      .maybeSingle();
    contratoId = (depois?.contrato_id as string | null) ?? null;
    if (!contratoId)
      return {
        erro:
          imp.contratos > 0 || imp.clientes > 0
            ? "Cadastro encontrado no SGP, mas nenhum contrato casou com a janela deste ticket — confira o CPF e a data da venda."
            : "CPF encontrado, mas sem contrato novo no SGP ainda.",
      };
  }

  const { atualizarContratoDoSgp } = await import("@/lib/sgp/atualizar");
  const r = await atualizarContratoDoSgp(contratoId);
  if (!r.ok) return { erro: r.erro ?? "Falha ao consultar o SGP." };
  revalidatePath(`/crm/${ticketId}`);
  revalidar();
  return {
    statusSgp: r.statusSgp,
    termoAssinado: r.termoAssinado,
    fidelidadeAssinada: r.fidelidadeAssinada,
    osAbertas: r.osAbertas,
  };
}

// Exclusão administrativa (só gestor): remove o ticket e seus filhos.
// A regra geral é "ticket não se exclui" (auditoria); esta é a exceção do
// Administrador para limpeza (ex.: apagar tickets de teste). RLS + gatilho
// (migração 0029) garantem que só o gestor consegue.
export async function excluirTicket(ticketId: string): Promise<EstadoAcao> {
  await exigirPerfil(["gestor"]);
  const supabase = criarClienteServidor();
  // apaga os filhos primeiro (FKs on delete restrict)
  await supabase.from("ticket_eventos").delete().eq("ticket_id", ticketId);
  await supabase.from("ticket_propostas").delete().eq("ticket_id", ticketId);
  await supabase.from("visitas_externas").delete().eq("ticket_id", ticketId);
  const { error } = await supabase.from("tickets").delete().eq("id", ticketId);
  if (error) return { erro: `Não foi possível excluir: ${error.message}` };
  revalidar();
  redirect("/crm");
}

export async function adicionarProposta(_e: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  const ticketId = String(dados.get("ticket_id") ?? "");
  const planoId = String(dados.get("plano_id") ?? "") || null;
  const descricao = String(dados.get("descricao") ?? "").trim() || null;
  const valor = Number(dados.get("valor"));
  const observacao = String(dados.get("observacao") ?? "").trim() || null;

  if (!Number.isFinite(valor) || valor <= 0) return { erro: "Informe o valor da proposta." };
  if (!planoId && !descricao) return { erro: "Escolha o plano ou descreva o produto." };

  const supabase = criarClienteServidor();
  const { error } = await supabase.from("ticket_propostas").insert({
    ticket_id: ticketId,
    plano_id: planoId,
    descricao,
    valor,
    observacao,
    criado_por: usuario.id,
  });
  if (error) return { erro: error.message };

  // valor da negociação = última proposta (aparece no card/kanban)
  await supabase.from("tickets").update({ valor_estimado: valor, atualizado_em: new Date().toISOString() }).eq("id", ticketId);
  // registra na trilha
  await supabase.from("ticket_eventos").insert({
    ticket_id: ticketId,
    tipo: "nota",
    dados: { texto: `Proposta registrada: R$ ${valor.toFixed(2)}${descricao ? ` — ${descricao}` : ""}` },
    usuario_id: usuario.id,
  });
  revalidatePath(`/crm/${ticketId}`);
  revalidar();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Fechar o dia: concluir/empurrar follow-ups sem abrir o ticket
// ---------------------------------------------------------------------------
export async function concluirFollowup(ticketId: string): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("tickets")
    .update({ followup_em: null, atualizado_em: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) return { erro: error.message };
  await supabase.from("ticket_eventos").insert({
    ticket_id: ticketId,
    tipo: "nota",
    dados: { texto: "Retorno realizado (fechar o dia)." },
    usuario_id: usuario.id,
  });
  revalidar();
  return { ok: true };
}

export async function adiarFollowup(ticketId: string, dias: number): Promise<EstadoAcao> {
  await exigirUsuario();
  const quando = new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("tickets")
    .update({ followup_em: `${quando}T12:00:00` })
    .eq("id", ticketId);
  if (error) return { erro: error.message };
  revalidar();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Follow-up por IA (analista de conversas)
// ---------------------------------------------------------------------------

/** Analisa a conversa SZ deste ticket e grava a sugestão de follow-up nele. */
export async function analisarFollowup(ticketId: string): Promise<{ erro?: string; ok?: string }> {
  const usuario = await exigirUsuario();
  if (!["gestor", "supervisor", "vendedora", "vendedora_externa", "agente_corporativo"].includes(usuario.perfil))
    return { erro: "Sem permissão." };
  const { analisarFollowupTicket } = await import("@/lib/crm/followup-ia");
  const r = await analisarFollowupTicket(ticketId);
  if (!r.ok) return { erro: r.erro };
  revalidar();
  return { ok: "Conversa analisada — sugestão de follow-up gravada no ticket." };
}

/** Lote do gestor: analisa os tickets abertos com conversa nova sem análise. */
export async function analisarFollowupsEmLote(): Promise<{ erro?: string; ok?: string }> {
  await exigirPerfil(["gestor", "supervisor"]);
  const { analisarFollowupsPendentes } = await import("@/lib/crm/followup-ia");
  const r = await analisarFollowupsPendentes(20);
  revalidar();
  return {
    ok: `${r.analisados} ticket(s) analisado(s)${r.erros ? ` · ${r.erros} com erro (${r.detalhes.join("; ")})` : ""}`,
  };
}

const TIPOS_ANEXO = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

/**
 * Complemento MANUAL da visita pelo ticket (prospecção lançada da base):
 * fotos da casa e do documento (frente/verso) e endereço informado pelo
 * cliente — para o pré-cadastro sair mesmo sem a agente estar no local.
 */
export async function anexarVisitaManual(_e: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  if (!["gestor", "supervisor"].includes(usuario.perfil) && !ehAgenteCrm(usuario.perfil))
    return { erro: "Sem permissão." };

  const ticketId = String(dados.get("ticket_id") ?? "");
  if (!ticketId) return { erro: "Ticket ausente." };
  const endereco = String(dados.get("endereco_manual") ?? "").trim();

  const { criarClienteAdmin } = await import("@/lib/supabase/admin");
  const admin = criarClienteAdmin();

  const { data: t } = await admin
    .from("tickets")
    .select("id, vendedor_id, pop_id, etapa")
    .eq("id", ticketId)
    .maybeSingle();
  if (!t) return { erro: "Ticket não encontrado." };
  // agente só mexe no próprio ticket; gestor/coordenador em qualquer um
  if (ehAgenteCrm(usuario.perfil) && t.vendedor_id && t.vendedor_id !== usuario.vendedor_id)
    return { erro: "Este ticket é de outra agente." };

  const subir = async (campo: string, sufixo: string): Promise<string | null | { erro: string }> => {
    const arquivo = dados.get(campo);
    if (!(arquivo instanceof File) || arquivo.size === 0) return null;
    const ext = TIPOS_ANEXO.get(arquivo.type);
    if (!ext) return { erro: "Foto precisa ser JPG, PNG ou WebP." };
    if (arquivo.size > 8 * 1024 * 1024) return { erro: "Foto acima de 8 MB." };
    const path = `visitas/${ticketId}/${sufixo}.${ext}`;
    const { error } = await admin.storage
      .from("venda-externa")
      .upload(path, arquivo, { upsert: true, contentType: arquivo.type });
    return error ? { erro: error.message } : path;
  };

  const casa = await subir("foto_casa", "casa");
  if (casa && typeof casa === "object") return { erro: `Foto da casa: ${casa.erro}` };
  const doc = await subir("foto_doc", "documento");
  if (doc && typeof doc === "object") return { erro: `Documento: ${doc.erro}` };
  const verso = await subir("foto_doc_verso", "documento-verso");
  if (verso && typeof verso === "object") return { erro: `Verso: ${verso.erro}` };

  if (!casa && !doc && !verso && !endereco)
    return { erro: "Anexe ao menos uma foto ou informe o endereço." };

  // completa a visita existente ou cria o registro do zero (sem GPS)
  const { data: visita } = await admin
    .from("visitas_externas")
    .select("id")
    .eq("ticket_id", ticketId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const campos: Record<string, unknown> = {};
  if (casa) campos.foto_casa_path = casa;
  if (doc) campos.foto_doc_path = doc;
  if (verso) campos.foto_doc_verso_path = verso;
  if (endereco) campos.endereco_manual = endereco;

  const { error } = visita
    ? await admin.from("visitas_externas").update(campos).eq("id", visita.id)
    : await admin.from("visitas_externas").insert({
        setor: "pap",
        ticket_id: ticketId,
        vendedor_id: t.vendedor_id,
        criado_por: usuario.id,
        ...campos,
      });
  if (error) return { erro: error.message };

  const partes = [
    casa ? "foto da casa" : null,
    doc ? "documento" : null,
    verso ? "verso do documento" : null,
    endereco ? `endereço informado: ${endereco}` : null,
  ].filter(Boolean);
  await admin.from("ticket_eventos").insert({
    ticket_id: ticketId,
    tipo: "nota",
    dados: { texto: `📎 Anexos do pré-cadastro incluídos manualmente (${partes.join(" · ")}).` },
    usuario_id: usuario.id,
  });

  revalidatePath(`/crm/${ticketId}`);
  revalidatePath("/crm");
  return { ok: true };
}


/** Inclui ou corrige o e-mail do cliente no ticket (opcional em todos). */
export async function salvarCpfTicket(_e: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  if (!["gestor", "supervisor"].includes(usuario.perfil) && !ehAgenteCrm(usuario.perfil))
    return { erro: "Sem permissão." };
  const ticketId = String(dados.get("ticket_id") ?? "");
  const cpf = String(dados.get("cpf") ?? "").trim();
  if (!ticketId) return { erro: "Ticket ausente." };
  const digitos = cpf.replace(/\D/g, "");
  if (cpf && digitos.length !== 11 && digitos.length !== 14)
    return { erro: "Documento inválido — CPF tem 11 dígitos, CNPJ tem 14." };

  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("tickets")
    .update({ cpf: cpf || null, atualizado_em: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) return { erro: error.message };
  revalidatePath(`/crm/${ticketId}`);
  revalidar();
  return { ok: true };
}

export async function salvarEmailTicket(_e: EstadoAcao, dados: FormData): Promise<EstadoAcao> {
  const usuario = await exigirUsuario();
  if (!["gestor", "supervisor"].includes(usuario.perfil) && !ehAgenteCrm(usuario.perfil))
    return { erro: "Sem permissão." };
  const ticketId = String(dados.get("ticket_id") ?? "");
  const email = String(dados.get("email") ?? "").trim().toLowerCase();
  if (!ticketId) return { erro: "Ticket ausente." };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { erro: "E-mail inválido." };

  const supabase = criarClienteServidor();
  const { error } = await supabase
    .from("tickets")
    .update({ email: email || null, atualizado_em: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) return { erro: error.message };
  revalidatePath(`/crm/${ticketId}`);
  return { ok: true };
}
