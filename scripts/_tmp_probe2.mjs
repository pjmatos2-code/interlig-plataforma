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
const home = await pegar("/admin/");
console.log("/admin/ →", home.status, home.headers.get("location") ?? "");
const h = home.status === 200 ? await home.text() : "";
if (h) {
  writeFileSync("scripts/_tmp_admin_home.html", h);
  const links = [...new Set([...h.matchAll(/href="(\/admin\/[^"#?]*)"/g)].map(m => m[1]))];
  console.log(links.filter(l => /client|cadastro|venda|relat|contrat/i.test(l)).slice(0, 40).join("\n"));
}
