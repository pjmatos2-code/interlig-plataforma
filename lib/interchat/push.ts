import "server-only";
import webpush from "web-push";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Notificações do InterChat (web push) em todos os dispositivos em que a
 * pessoa ativou o aviso: celular (Android; iPhone com o app instalado),
 * computador e tablet. Inscrição vencida (404/410) é apagada.
 */

let configurado: { publica: string } | null = null;

export async function chavePublicaPush(): Promise<string | null> {
  const { data } = await criarClienteAdmin().from("integracoes_config").select("config").eq("sistema", "interchat").maybeSingle();
  return ((data?.config as Record<string, string> | null)?.vapid_publica as string | undefined) ?? null;
}

async function configurar(): Promise<boolean> {
  if (configurado) return true;
  const { data } = await criarClienteAdmin().from("integracoes_config").select("config").eq("sistema", "interchat").maybeSingle();
  const c = (data?.config ?? {}) as Record<string, string>;
  if (!c.vapid_publica || !c.vapid_privada) return false;
  webpush.setVapidDetails(c.contato || "mailto:contato@interlig.com", c.vapid_publica, c.vapid_privada);
  configurado = { publica: c.vapid_publica };
  return true;
}

export type AvisoPush = { titulo: string; corpo: string; url: string; tag: string; icone?: string | null };

export async function enviarPush(usuarioIds: string[], aviso: AvisoPush): Promise<number> {
  if (usuarioIds.length === 0 || !(await configurar())) return 0;
  const admin = criarClienteAdmin();
  const { data: subs } = await admin.from("push_inscricoes").select("id, endpoint, p256dh, auth").in("usuario_id", usuarioIds);
  const corpo = JSON.stringify(aviso);
  let enviados = 0;
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          corpo,
          { TTL: 60 * 60 * 24, urgency: "high", topic: aviso.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) }
        );
        enviados++;
        await admin.from("push_inscricoes").update({ ultimo_envio: new Date().toISOString() }).eq("id", s.id as string);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await admin.from("push_inscricoes").delete().eq("id", s.id as string);
        else console.error("push interchat:", status, (e as Error).message);
      }
    })
  );
  return enviados;
}
