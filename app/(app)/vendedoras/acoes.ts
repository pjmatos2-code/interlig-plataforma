"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil, exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";

const TIPOS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const TAMANHO_MAX = 4 * 1024 * 1024; // 4 MB

export type EstadoFoto = { erro?: string; ok?: boolean };

/** Upload da foto de perfil da vendedora (bucket público `avatars`). */
export async function salvarFotoVendedora(_e: EstadoFoto, dados: FormData): Promise<EstadoFoto> {
  await exigirPerfil(["gestor", "supervisor"]);
  const vendedorId = String(dados.get("vendedor_id") ?? "");
  const arquivo = dados.get("foto");
  if (!vendedorId || !(arquivo instanceof File) || arquivo.size === 0)
    return { erro: "Escolha a imagem." };
  const ext = TIPOS.get(arquivo.type);
  if (!ext) return { erro: "Use JPG, PNG ou WebP." };
  if (arquivo.size > TAMANHO_MAX) return { erro: "Imagem acima de 4 MB." };

  const admin = criarClienteAdmin();
  const caminho = `vendedoras/${vendedorId}.${ext}`;
  const { error: eUp } = await admin.storage
    .from("avatars")
    .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });
  if (eUp) return { erro: eUp.message };

  const { data: publica } = admin.storage.from("avatars").getPublicUrl(caminho);
  // cache-buster para a troca aparecer na hora no totem
  const url = `${publica.publicUrl}?v=${Date.now()}`;
  const { error: eDb } = await admin
    .from("vendedores")
    .update({ foto_url: url })
    .eq("id", vendedorId);
  if (eDb) return { erro: eDb.message };

  revalidatePath("/vendedoras");
  revalidatePath("/tv/ranking");
  revalidatePath("/ranking");
  return { ok: true };
}


/**
 * Atualização forçada com o SGP (pedido do gestor, 29/09/2026): repassa os
 * contratos NÃO FINAIS da vendedora (aguardando ativação / suspensos dos
 * últimos 120 dias) pelo mesmo motor do botão do ticket — status, assinaturas
 * e OS na hora, sem esperar a varredura rotativa (que pode levar dias).
 * Orçamento de 50s por clique; o aviso diz se sobrou algo para novo clique.
 */
export async function atualizarVendasDoSgp(vendedorId: string): Promise<{
  ok?: boolean; erro?: string; verificados?: number; mudaram?: number; restantes?: number;
}> {
  const usuario = await exigirUsuario();
  const proprio = usuario.vendedor_id === vendedorId;
  if (!proprio && !["gestor", "supervisor"].includes(usuario.perfil))
    return { erro: "Sem permissão." };

  const admin = criarClienteAdmin();
  const corte = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const { data: cts } = await admin
    .from("contratos")
    .select("id")
    .eq("vendedor_id", vendedorId)
    .in("status", ["aguardando_ativacao", "suspenso"])
    .gte("data_venda", corte)
    .order("data_venda", { ascending: false })
    .limit(60);
  if (!cts || cts.length === 0) return { ok: true, verificados: 0, mudaram: 0, restantes: 0 };

  const { atualizarContratoDoSgp } = await import("@/lib/sgp/atualizar");
  const limite = Date.now() + 50_000;
  let verificados = 0;
  let mudaram = 0;
  for (const c of cts) {
    if (Date.now() > limite) break;
    const r = await atualizarContratoDoSgp(c.id as string).catch(() => null);
    if (r?.ok) {
      verificados += 1;
      if ((r.mudancas ?? []).length > 0) mudaram += 1;
    }
  }
  revalidatePath("/vendedoras");
  revalidatePath("/minhas-vendas");
  revalidatePath("/esteira");
  return { ok: true, verificados, mudaram, restantes: Math.max(0, cts.length - verificados) };
}
