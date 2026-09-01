"use server";

import { revalidatePath } from "next/cache";
import { ehVendedora } from "@/lib/tipos";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export type EstadoVisita = { erro?: string; ok?: boolean; ticketId?: string };

const TIPOS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const TAMANHO_MAX = 8 * 1024 * 1024;

async function subirFoto(
  admin: ReturnType<typeof criarClienteAdmin>,
  arquivo: File,
  caminho: string
): Promise<{ path?: string; erro?: string }> {
  const ext = TIPOS.get(arquivo.type);
  if (!ext) return { erro: "Foto precisa ser JPG, PNG ou WebP." };
  if (arquivo.size > TAMANHO_MAX) return { erro: "Foto acima de 8 MB." };
  const path = `${caminho}.${ext}`;
  const { error } = await admin.storage
    .from("venda-externa")
    .upload(path, arquivo, { upsert: true, contentType: arquivo.type });
  if (error) return { erro: error.message };
  return { path };
}

/**
 * Registro de visita da venda externa (mobile): cria o ticket no CRM,
 * a proposta com o plano de interesse e o anexo de campo (fotos + GPS).
 */
export async function registrarVisita(_e: EstadoVisita, dados: FormData): Promise<EstadoVisita> {
  // pap = Venda Externa (gestor/coordenador/externa); corporativo = Setor
  // Corporativo (qualquer perfil comercial pode registrar)
  const setor = dados.get("setor") === "corporativo" ? "corporativo" : "pap";
  const usuario =
    setor === "corporativo"
      ? await exigirPerfil(["gestor", "supervisor", "agente_corporativo"])
      : await exigirPerfil(["gestor", "supervisor", "vendedora_externa"]);
  const supabase = criarClienteServidor();
  const admin = criarClienteAdmin(); // só para o upload das fotos no bucket privado
  // Gravações passam pela RLS: coordenador só registra para agentes dele
  // (tickets_ins/upd por agente — migração 0025); gestor registra para qualquer um.
  const db = supabase;

  const nome = String(dados.get("cliente_nome") ?? "").trim();
  const telefone = String(dados.get("telefone") ?? "").replace(/\D/g, "");
  const planoId = String(dados.get("plano_id") ?? "") || null;
  const lat = Number(dados.get("lat")) || null;
  const lng = Number(dados.get("lng")) || null;
  const precisao = Number(dados.get("precisao")) || null;
  const fotoCasa = dados.get("foto_casa");
  const fotoDoc = dados.get("foto_doc");
  const fotoDocVerso = dados.get("foto_doc_verso");
  const ehPreCadastro = dados.get("acao") === "pre_cadastro";
  const vencimentoDia = [7, 14, 21, 28].includes(Number(dados.get("vencimento_dia")))
    ? Number(dados.get("vencimento_dia"))
    : null;

  if (!nome) return { erro: "Informe o nome do cliente." };
  if (!telefone) return { erro: "Informe o contato do cliente." };
  if (!(fotoCasa instanceof File) || fotoCasa.size === 0)
    return { erro: "Tire a foto da frente da casa." };
  // pré-cadastro é venda fechada na hora: documento e vencimento são a base
  if (ehPreCadastro && (!(fotoDoc instanceof File) || fotoDoc.size === 0))
    return { erro: "Pré-cadastro precisa da foto do documento do cliente." };
  if (ehPreCadastro && !vencimentoDia)
    return { erro: "Pré-cadastro precisa da data de vencimento (7, 14, 21 ou 28)." };

  // vendedora registra para si; gestor/supervisor pode escolher
  const vendedorForm = String(dados.get("vendedor_id") ?? "");
  const vendedorId =
    ehVendedora(usuario.perfil) ? usuario.vendedor_id : vendedorForm || usuario.vendedor_id;
  let popId = usuario.pop_id;
  if (vendedorId) {
    const { data: v } = await db
      .from("vendedores")
      .select("pop_id")
      .eq("id", vendedorId)
      .maybeSingle();
    popId = v?.pop_id ?? popId;
  }

  // 1) ticket no CRM (origem: venda externa / PAP)
  const { data: ticket, error: eTicket } = await db
    .from("tickets")
    .insert({
      origem_criacao: "manual",
      cliente_nome: nome,
      telefone,
      vendedor_id: vendedorId,
      pop_id: popId,
      // visita comum = contato inicial; pré-cadastro segue trilho próprio no funil
      etapa: ehPreCadastro ? "pre_cadastro" : "em_atendimento",
      vencimento_dia: vencimentoDia,
    })
    .select("id")
    .single();
  if (eTicket) return { erro: `Não foi possível criar o ticket: ${eTicket.message}` };

  // 2) fotos no bucket privado
  const base = `visitas/${ticket.id}`;
  const casa = await subirFoto(admin, fotoCasa, `${base}/casa`);
  if (casa.erro) return { erro: `Foto da casa: ${casa.erro}` };
  let docPath: string | null = null;
  if (fotoDoc instanceof File && fotoDoc.size > 0) {
    const doc = await subirFoto(admin, fotoDoc, `${base}/documento`);
    if (doc.erro) return { erro: `Foto do documento: ${doc.erro}` };
    docPath = doc.path ?? null;
  }
  let docVersoPath: string | null = null;
  if (fotoDocVerso instanceof File && fotoDocVerso.size > 0) {
    const verso = await subirFoto(admin, fotoDocVerso, `${base}/documento-verso`);
    if (verso.erro) return { erro: `Verso do documento: ${verso.erro}` };
    docVersoPath = verso.path ?? null;
  }

  // 3) anexo de campo
  const { error: eVisita } = await db.from("visitas_externas").insert({
    setor,
    ticket_id: ticket.id,
    vendedor_id: vendedorId,
    foto_casa_path: casa.path,
    foto_doc_path: docPath,
    foto_doc_verso_path: docVersoPath,
    lat,
    lng,
    precisao_m: precisao,
    criado_por: usuario.id,
  });
  if (eVisita) return { erro: eVisita.message };

  // 4) plano de interesse vira proposta (valor aparece no card do kanban)
  if (planoId) {
    const { data: plano } = await db
      .from("planos")
      .select("nome, valor_referencia")
      .eq("id", planoId)
      .maybeSingle();
    const valor = Number(plano?.valor_referencia ?? 0);
    if (valor > 0) {
      await db.from("ticket_propostas").insert({
        ticket_id: ticket.id,
        plano_id: planoId,
        valor,
        observacao: "Interesse registrado na visita externa.",
        criado_por: usuario.id,
      });
      await db
        .from("tickets")
        .update({ valor_estimado: valor, atualizado_em: new Date().toISOString() })
        .eq("id", ticket.id);
    }
  }

  // 5) trilha
  await db.from("ticket_eventos").insert({
    ticket_id: ticket.id,
    tipo: "nota",
    dados: {
      texto: `${ehPreCadastro ? "PRÉ-CADASTRO criado na visita" : setor === "corporativo" ? "Visita corporativa registrada" : "Visita externa registrada"}${lat ? ` (GPS ±${Math.round(precisao ?? 0)}m)` : " (sem GPS)"}${vencimentoDia ? ` · vencimento dia ${vencimentoDia}` : ""}${docPath ? ` · documento${docVersoPath ? " frente e verso" : ""} anexado` : ""}.`,
    },
    usuario_id: usuario.id,
  });

  revalidatePath(setor === "corporativo" ? "/corporativo" : "/externa");
  revalidatePath("/crm");
  return { ok: true, ticketId: ticket.id };
}
