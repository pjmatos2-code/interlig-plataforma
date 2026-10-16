"use server";

import { randomUUID } from "node:crypto";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { enviarPush } from "@/lib/interchat/push";

export type Resposta<T = undefined> = { erro?: string; dados?: T };

const TIPOS_ANEXO = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf|application\/(msword|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.ms-excel)|text\/plain)$/;
const LIMITE_ANEXO = 10 * 1024 * 1024;

/** Envia a mensagem (a RLS garante que só quem participa escreve) e avisa os outros. */
export async function enviarMensagem(
  conversaId: string,
  texto: string,
  anexo?: { path: string; nome: string; tipo: string; tamanho: number } | null
): Promise<Resposta<{ id: string; criado_em: string }>> {
  const usuario = await exigirUsuario();
  const limpo = (texto ?? "").replace(/\s+$/g, "").slice(0, 4000);
  if (!limpo.trim() && !anexo) return { erro: "Mensagem vazia." };
  if (anexo && !anexo.path.startsWith(`${conversaId}/`)) return { erro: "Anexo inválido." };

  const supabase = criarClienteServidor();
  const { data: msg, error } = await supabase
    .from("chat_mensagens")
    .insert({
      conversa_id: conversaId,
      autor_id: usuario.id,
      texto: limpo.trim() ? limpo : null,
      anexo_path: anexo?.path ?? null,
      anexo_nome: anexo?.nome?.slice(0, 200) ?? null,
      anexo_tipo: anexo?.tipo ?? null,
      anexo_tamanho: anexo?.tamanho ?? null,
    })
    .select("id, criado_em")
    .single();
  if (error || !msg) return { erro: error?.message.includes("row-level security") ? "Você não participa desta conversa." : error?.message ?? "Falha ao enviar." };

  // aviso nos dispositivos dos outros participantes
  try {
    const admin = criarClienteAdmin();
    const [{ data: conv }, { data: membros }] = await Promise.all([
      admin.from("chat_conversas").select("tipo, nome").eq("id", conversaId).single(),
      admin.from("chat_membros").select("usuario_id").eq("conversa_id", conversaId).neq("usuario_id", usuario.id),
    ]);
    const previa = limpo.trim() ? limpo.trim().slice(0, 140) : `📎 ${anexo?.nome ?? "anexo"}`;
    await enviarPush(
      (membros ?? []).map((m) => m.usuario_id as string),
      {
        titulo: conv?.tipo === "grupo" ? `${conv.nome} · ${usuario.nome}` : usuario.nome,
        corpo: previa,
        url: `/interchat?c=${conversaId}`,
        tag: `ic-${conversaId}`,
      }
    );
  } catch (e) {
    console.error("interchat aviso:", e);
  }
  return { dados: { id: msg.id as string, criado_em: msg.criado_em as string } };
}

/** Link de upload direto para o anexo (até 10 MB) — só para quem participa. */
export async function prepararAnexo(
  conversaId: string,
  nome: string,
  tipo: string,
  tamanho: number
): Promise<Resposta<{ path: string; token: string }>> {
  await exigirUsuario();
  if (tamanho > LIMITE_ANEXO) return { erro: "Arquivo maior que 10 MB." };
  if (!TIPOS_ANEXO.test(tipo)) return { erro: "Tipo de arquivo não aceito (fotos, PDF, Word, Excel ou texto)." };
  const { data: conv } = await criarClienteServidor().from("chat_conversas").select("id").eq("id", conversaId).maybeSingle();
  if (!conv) return { erro: "Você não participa desta conversa." };
  const seguro = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
  const path = `${conversaId}/${randomUUID()}-${seguro}`;
  const { data, error } = await criarClienteAdmin().storage.from("interchat").createSignedUploadUrl(path);
  if (error || !data) return { erro: error?.message ?? "Falha ao preparar o envio." };
  return { dados: { path, token: data.token } };
}

/** Guarda a inscrição de aviso deste navegador/dispositivo. */
export async function salvarInscricaoPush(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  dispositivo: string
): Promise<Resposta> {
  const usuario = await exigirUsuario();
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return { erro: "Inscrição inválida." };
  const { error } = await criarClienteAdmin()
    .from("push_inscricoes")
    .upsert(
      { usuario_id: usuario.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, dispositivo: dispositivo.slice(0, 200) },
      { onConflict: "endpoint" }
    );
  return error ? { erro: error.message } : {};
}

export async function removerInscricaoPush(endpoint: string): Promise<Resposta> {
  const usuario = await exigirUsuario();
  await criarClienteAdmin().from("push_inscricoes").delete().eq("endpoint", endpoint).eq("usuario_id", usuario.id);
  return {};
}

/** Teste: manda um aviso para os próprios dispositivos. */
export async function testarAviso(): Promise<Resposta<{ enviados: number }>> {
  const usuario = await exigirUsuario();
  const enviados = await enviarPush([usuario.id], {
    titulo: "InterChat",
    corpo: "Avisos ativados neste dispositivo ✓",
    url: "/interchat",
    tag: "ic-teste",
  });
  return { dados: { enviados } };
}

export async function criarGrupo(nome: string, membros: string[]): Promise<Resposta<{ id: string }>> {
  const usuario = await exigirUsuario();
  if (usuario.perfil !== "gestor") return { erro: "Só o administrador cria grupos." };
  const { data, error } = await criarClienteServidor().rpc("chat_criar_grupo", { p_nome: nome, p_membros: membros });
  if (error) return { erro: error.message };
  return { dados: { id: data as string } };
}

export async function alterarMembrosGrupo(conversaId: string, adicionar: string[], remover: string[]): Promise<Resposta> {
  const usuario = await exigirUsuario();
  if (usuario.perfil !== "gestor") return { erro: "Só o administrador mexe nos grupos." };
  const { error } = await criarClienteServidor().rpc("chat_membros_grupo", {
    p_conversa: conversaId,
    p_adicionar: adicionar,
    p_remover: remover,
  });
  return error ? { erro: error.message } : {};
}
