"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";
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
