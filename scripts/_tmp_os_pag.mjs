import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: cfgRow } = await sb.from("integracoes_config").select("config").eq("sistema", "sgp").maybeSingle();
const cfg = cfgRow.config; const base = String(cfg.base_url ?? "").replace(/\/+$/, "").replace(/\/admin$/, "");
const cookies = new Map();
const guardar = (r) => { for (const l of r.headers.getSetCookie?.() ?? []) { const [p] = l.split(";"); const i = p.indexOf("="); if (i > 0) cookies.set(p.slice(0, i).trim(), p.slice(i + 1).trim()); } };
const pegar = async (c, e = {}) => { const r = await fetch(`${base}${c}`, { redirect: "manual", cache: "no-store", ...e, headers: { "User-Agent": "Mozilla/5.0", Cookie: [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; "), ...(e.headers ?? {}) } }); guardar(r); return r; };
const t0 = await pegar("/accounts/login/"); const h0 = await t0.text();
const csrf = h0.match(/name="csrfmiddlewaretoken"[^>]*value="([^"]+)"/)?.[1] ?? cookies.get("csrftoken");
await pegar("/accounts/login/", { method: "POST", body: new URLSearchParams({ csrfmiddlewaretoken: csrf, username: cfg.painel_usuario, password: cfg.painel_senha, next: "/admin/" }).toString(), headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: `${base}/accounts/login/` } });
const res = await pegar(`/admin/atendimento/relatorios/ocorrencia/os/?paginate_by=100&data_cadastro_inicial=${encodeURIComponent("01/08/2026 00:00:00")}&data_cadastro_final=${encodeURIComponent("31/08/2026 23:59:59")}`);
const html = await res.text();
// trechos com "pag" ou "page"
for (const m of html.matchAll(/.{80}pag.{160}/gi)) { console.log("---"); console.log(m[0].replace(/\s+/g," ")); if ([...html.matchAll(/pag/gi)].length > 20) break; }
console.log("=== paginate_by options ===", html.match(/<select[^>]*paginate_by[\s\S]{0,400}/)?.[0]?.replace(/\s+/g," ").slice(0,400));
console.log("total menções page=", [...html.matchAll(/page=/g)].length);
