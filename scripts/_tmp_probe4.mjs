import { readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { createClient } = await import("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: cfgRow } = await s.from("integracoes_config").select("config").eq("sistema", "sgp").maybeSingle();
const cfg = cfgRow.config;
const base = cfg.base_url.replace(/\/admin\/?$/, "");
const cookies = new Map();
const guardar = res => { for (const l of res.headers.getSetCookie?.() ?? []) { const [par] = l.split(";"); const i = par.indexOf("="); if (i > 0) cookies.set(par.slice(0, i).trim(), par.slice(i + 1).trim()); } };
const hdr = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
const pegar = async (caminho, extra = {}) => {
  const res = await fetch(`${base}${caminho}`, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30000), ...extra, headers: { "User-Agent": "Mozilla/5.0 (plataforma)", Cookie: hdr(), ...(extra.headers ?? {}) } });
  guardar(res); return res;
};
const tela = await pegar("/accounts/login/");
const html0 = await tela.text();
const csrf = html0.match(/name="csrfmiddlewaretoken"[^>]*value="([^"]+)"/)?.[1] ?? cookies.get("csrftoken");
await pegar("/accounts/login/", { method: "POST", body: new URLSearchParams({ csrfmiddlewaretoken: csrf, username: cfg.painel_usuario, password: cfg.painel_senha, next: "/admin/" }).toString(), headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: `${base}/accounts/login/` } });
// dpb_token vem da página
const pag = await pegar("/admin/cliente/list/ultimos/");
const h0 = await pag.text();
const dpb = h0.match(/name='dpb_token' value='([^']+)'/)?.[1] ?? "";
for (const st of ["6", "1"]) {
  const r2 = await pegar(`/admin/cliente/list/ultimos/?dpb_token=${dpb}&pop=&plano=&quantidade=30&status=${st}&crm=`);
  const h2 = await r2.text();
  writeFileSync(`scripts/_tmp_ultimos_st${st}.html`, h2);
  const linhas2 = [...h2.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  console.log(`status=${st}: ${r2.status}, tamanho ${h2.length}, <tr> ${linhas2.length}`);
  for (const l of linhas2.slice(0, 6)) {
    const tds = [...l[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    const links = [...l[1].matchAll(/href="([^"]+)"/g)].map(m => m[1]);
    if (tds.length) console.log("  |", tds.join(" ; ").slice(0, 180), "||", links.slice(0, 2).join(" "));
  }
}
const r = { status: 200, text: async () => "" };
console.log("status:", r.status);
const h = await r.text();
writeFileSync("scripts/_tmp_ultimos2.html", h);
console.log("tamanho:", h.length);
const linhas = [...h.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
console.log("linhas <tr>:", linhas.length);
for (const l of linhas.slice(0, 8)) {
  const tds = [...l[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  const links = [...l[1].matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  if (tds.length) console.log(" |", tds.join(" ; ").slice(0, 200), "||", links.slice(0, 2).join(" "));
}
