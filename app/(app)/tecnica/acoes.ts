"use server";

import { revalidatePath } from "next/cache";
import { exigirPerfil } from "@/lib/auth";

export type Resultado = { erro?: string; ok?: string };

/** Busca as OS do mês no relatório do painel do SGP e atualiza a base. */
export async function sincronizarOsDoMes(mes: string): Promise<Resultado> {
  await exigirPerfil(["gestor"]);
  const { sincronizarOs } = await import("@/lib/sgp/os");
  const r = await sincronizarOs(mes);
  if (!r.ok) return { erro: r.erro ?? "Falha na sincronização." };
  revalidatePath("/tecnica");
  return { ok: `${r.lidas} OS lidas · ${r.gravadas} gravadas.` };
}

const TIPOS_FOTO = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

/** Foto do técnico — mesmo fluxo das vendedoras (bucket avatars). */
export async function salvarFotoTecnico(
  _e: { erro?: string; ok?: boolean },
  dados: FormData
): Promise<{ erro?: string; ok?: boolean }> {
  const { exigirPerfil } = await import("@/lib/auth");
  await exigirPerfil(["gestor"]);
  const tecnicoId = String(dados.get("tecnico_id") ?? "");
  const arquivo = dados.get("foto");
  if (!tecnicoId || !(arquivo instanceof File) || arquivo.size === 0)
    return { erro: "Escolha a imagem." };
  const ext = TIPOS_FOTO.get(arquivo.type);
  if (!ext) return { erro: "Use JPG, PNG ou WebP." };
  if (arquivo.size > 4 * 1024 * 1024) return { erro: "Imagem acima de 4 MB." };

  const { criarClienteAdmin } = await import("@/lib/supabase/admin");
  const admin = criarClienteAdmin();
  const caminho = `tecnicos/${tecnicoId}.${ext}`;
  const { error: eUp } = await admin.storage
    .from("avatars")
    .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });
  if (eUp) return { erro: eUp.message };
  const { data: publica } = admin.storage.from("avatars").getPublicUrl(caminho);
  const { error: eDb } = await admin
    .from("tecnicos")
    .update({ foto_url: `${publica.publicUrl}?v=${Date.now()}` })
    .eq("id", tecnicoId);
  if (eDb) return { erro: eDb.message };
  revalidatePath("/tecnica");
  return { ok: true };
}
