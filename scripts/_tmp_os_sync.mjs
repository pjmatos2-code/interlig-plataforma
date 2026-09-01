// Carga inicial: importa as OS de um mês para os_tecnicas (mesma lógica do lib/sgp/os.ts)
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: cfgRow } = await sb.from("integracoes_config").select("config").eq("sistema", "sgp").maybeSingle();
const cfg = cfgRow.config; const base = String(cfg.base_url ?? "").replace(/\/+$/, "").replace(/\/admin$/, "");
const UA = "Mozilla/5.0 (plataforma-interlig)";
const cookies = new Map();
const guardar = (r) => { for (const l of r.headers.getSetCookie?.() ?? []) { const [p] = l.split(";"); const i = p.indexOf("="); if (i > 0) cookies.set(p.slice(0, i).trim(), p.slice(i + 1).trim()); } };
const pegar = async (c, e = {}) => { const r = await fetch(`${base}${c}`, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(60000), ...e, headers: { "User-Agent": UA, Cookie: [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "), ...(e.headers ?? {}) } }); guardar(r); return r; };
const t0 = await pegar("/accounts/login/"); const h0 = await t0.text();
const csrf = h0.match(/name="csrfmiddlewaretoken"[^>]*value="([^"]+)"/)?.[1] ?? cookies.get("csrftoken");
await pegar("/accounts/login/", { method: "POST", body: new URLSearchParams({ csrfmiddlewaretoken: csrf, username: cfg.painel_usuario, password: cfg.painel_senha, next: "/admin/" }).toString(), headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: `${base}/accounts/login/` } });

const limpar = (s) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const iso = (t) => { const m = (t ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/); return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}-03:00` : null; };

const [de, ate] = process.argv.slice(2); // ex.: 01/09/2026 30/09/2026
const qs = new URLSearchParams({ paginate_by: "5000", data_cadastro_inicial: `${de} 00:00:00`, data_cadastro_final: `${ate} 23:59:59` });
const todas = [];
for (let p = 1; p <= 1; p++) {
  const q = new URLSearchParams(qs); if (p > 1) q.set("page", String(p));
  const res = await pegar(`/admin/atendimento/relatorios/ocorrencia/os/?${q.toString()}`);
  const html = await res.text();
  const ths = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => limpar(m[1]).toLowerCase());
  const idx = (r) => ths.findIndex((t) => t.includes(r));
  const col = { id: idx("id"), cliente: idx("cliente"), pop: idx("pop"), bairro: idx("bairro"), tipo: idx("tipo"), motivo: idx("motivo"), status: idx("status"), criada: idx("criada"), agendamento: idx("agendamento"), checkin: idx("check-in"), encerrada: idx("encerrada"), responsavel: idx("responsável"), auxiliares: idx("auxiliar"), finalizado: idx("finalizado por"), servico: idx("serviço prestado") };
  let n = 0;
  for (const tr of html.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const tds = [...tr[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => limpar(m[1]));
    if (tds.length < ths.length - 1) continue;
    const v = (i) => (i >= 0 && tds[i] ? tds[i] : null);
    const osId = (v(col.id) ?? "").match(/\d+/)?.[0];
    if (!osId) continue;
    const cb = v(col.cliente) ?? ""; const mc = cb.match(/^(\d+)\s*-\s*(.+)$/);
    todas.push({ sgp_os_id: osId, sgp_contrato_id: mc?.[1] ?? null, cliente_nome: mc?.[2]?.trim() ?? (cb || null), pop: v(col.pop), bairro: v(col.bairro), tipo: v(col.tipo), motivo: v(col.motivo), status: v(col.status), criada_em: iso(v(col.criada)), agendamento: iso(v(col.agendamento)), checkin: iso(v(col.checkin)), encerrada_em: iso(v(col.encerrada)), responsavel: v(col.responsavel), auxiliares: v(col.auxiliares), finalizado_por: v(col.finalizado), servico_prestado: v(col.servico) });
    n++;
  }
  const temMais = new RegExp(`[?&]page=${p + 1}\\b`).test(html);
  console.log(`pagina ${p}: ${n} linhas`);
  if (!temMais || n === 0) break;
}
console.log("total lidas:", todas.length);
// dedup por sgp_os_id (o upsert do supabase-js falha com id repetido no mesmo lote)
const vistos = new Set(); const unicas = todas.filter(l => !vistos.has(l.sgp_os_id) && vistos.add(l.sgp_os_id));
for (let i = 0; i < unicas.length; i += 200) {
  const { error } = await sb.from("os_tecnicas").upsert(unicas.slice(i, i + 200), { onConflict: "sgp_os_id" });
  if (error) { console.error("ERRO upsert:", error.message); process.exit(1); }
}
console.log("gravadas:", unicas.length);
