// Dry-run: acessa Relatórios > Atendimento > Ordem de Serviço no painel do SGP
// e confere se conseguimos filtrar e ler as OS encerradas com técnico.
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2];
}
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: cfgRow } = await sb.from("integracoes_config").select("config").eq("sistema", "sgp").maybeSingle();
const cfg = cfgRow.config ?? {};
const base = String(cfg.base_url ?? process.env.SGP_BASE_URL ?? "").replace(/\/+$/, "").replace(/\/admin$/, "");
console.log("base:", base ? "ok" : "VAZIA");
const UA = "Mozilla/5.0 (plataforma-interlig)";

const cookies = new Map();
const guardar = (res) => { for (const l of res.headers.getSetCookie?.() ?? []) { const [p] = l.split(";"); const i = p.indexOf("="); if (i > 0) cookies.set(p.slice(0, i).trim(), p.slice(i + 1).trim()); } };
const header = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
const pegar = async (caminho, extra = {}) => {
  const res = await fetch(`${base}${caminho}`, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(45000), ...extra,
    headers: { "User-Agent": UA, Cookie: header(), ...(extra.headers ?? {}) } });
  guardar(res); return res;
};

// login Django
const tela = await pegar("/accounts/login/");
const html0 = await tela.text();
const csrf0 = html0.match(/name="csrfmiddlewaretoken"[^>]*value="([^"]+)"/)?.[1] ?? cookies.get("csrftoken") ?? "";
await pegar("/accounts/login/", { method: "POST",
  body: new URLSearchParams({ csrfmiddlewaretoken: csrf0, username: cfg.painel_usuario, password: cfg.painel_senha, next: "/admin/" }).toString(),
  headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: `${base}/accounts/login/` } });
console.log("login:", [...cookies.keys()].some(k => /session/i.test(k)) ? "OK" : "FALHOU");

// tela do relatório de OS
const rel = await pegar("/admin/atendimento/relatorios/ocorrencia/os/");
console.log("GET relatório OS:", rel.status);
const html = await rel.text();
console.log("é a tela certa?", html.includes("Relatório de Ordem de Serviço") || html.includes("Ordem de Serv"));

// campos do formulário (nomes dos filtros)
const campos = [...html.matchAll(/<(?:select|input|textarea)[^>]*name="([^"]+)"/g)].map(m => m[1]);
console.log("filtros:", [...new Set(campos)].slice(0, 40).join(", "));

// técnicos disponíveis (select de técnicos)
const selTec = html.match(/<select[^>]*name="(tecnico[^"]*)"[\s\S]*?<\/select>/i);
if (selTec) {
  const ops = [...selTec[0].matchAll(/<option[^>]*value="(\d+)"[^>]*>([^<]+)</g)].slice(0, 12);
  console.log("select técnicos:", selTec[1], "| exemplos:", ops.map(o => o[2].trim()).join(" · "));
}
// motivos
const selMot = html.match(/<select[^>]*name="(motivo[^"]*)"[\s\S]*?<\/select>/i);
if (selMot) {
  const ops = [...selMot[0].matchAll(/<option[^>]*>([^<]+)</g)].slice(0, 15);
  console.log("select motivos:", selMot[1], "| exemplos:", ops.map(o => o[1].trim()).join(" · "));
}

// ---- consulta filtrada: OS encerradas com agendamento em agosto ----
const valorOpcao = (selName, rotulo) => {
  const sel = html.match(new RegExp(`<select[^>]*name="${selName}"[\\s\\S]*?</select>`, "i"));
  if (!sel) return null;
  const op = [...sel[0].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]+)</g)]
    .find(o => o[2].trim().toLowerCase().includes(rotulo.toLowerCase()));
  return op?.[1] ?? null;
};
const stEncerrada = valorOpcao("status", "Encerrada");
console.log("valor status Encerrada:", stEncerrada);

const qs = new URLSearchParams({
  paginate_by: "100",
  data_agendamento_inicial: "01/08/2026 00:00:00",
  data_agendamento_final: "31/08/2026 23:59:59",
});
if (stEncerrada) qs.append("status", stEncerrada);
const res2 = await pegar(`/admin/atendimento/relatorios/ocorrencia/os/?${qs.toString()}`);
console.log("consulta filtrada:", res2.status);
const html2 = await res2.text();
const linhas = [...html2.matchAll(/<tr[\s\S]*?<\/tr>/g)];
console.log("linhas de tabela:", linhas.length);
// cabeçalho da tabela de resultados
const ths = [...html2.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
console.log("colunas:", ths.slice(0, 25).join(" | "));
// amostra de 2 linhas com texto puro
let n = 0;
for (const l of linhas) {
  const tds = [...l[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  if (tds.length > 5 && n < 2) { console.log("linha:", tds.slice(0, 14).join(" · ")); n++; }
}
