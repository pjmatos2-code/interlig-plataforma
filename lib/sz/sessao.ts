import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Sessão do robô no SZ Chat (Fortics). Loga com e-mail/senha de um usuário
 * dedicado, guarda o cookie de sessão e o token CSRF, e expõe um fetch
 * autenticado. Roda server-side (cron) — nunca no navegador.
 *
 * Endpoints descobertos: POST /login {email,password} → Set-Cookie de sessão;
 * o token CSRF vem no <meta name="csrf-token"> de qualquer página logada e é
 * exigido por /reports/messages/getTalks.
 */

export type CredenciaisSz = { baseUrl: string; email: string; senha: string };

export async function lerCredenciaisSz(): Promise<CredenciaisSz | null> {
  const admin = criarClienteAdmin();
  const { data } = await admin
    .from("integracoes_config")
    .select("config")
    .eq("sistema", "szchat")
    .maybeSingle();
  const c = (data?.config ?? {}) as Record<string, unknown>;
  const baseUrl = ((c.base_url as string) || process.env.SZ_BASE_URL || "https://interlig.sz.chat").replace(/\/+$/, "");
  const email = (c.robo_email as string) || process.env.SZ_ROBO_EMAIL || "";
  const senha = (c.robo_senha as string) || process.env.SZ_ROBO_SENHA || "";
  if (!email || !senha) return null;
  return { baseUrl, email, senha };
}

export class SessaoSz {
  private cookie = "";
  private csrf = "";
  constructor(private cred: CredenciaisSz) {}

  private juntarCookies(resp: Response) {
    const novos =
      // Node/undici expõe getSetCookie(); fallback para o header combinado
      (resp.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
      (resp.headers.get("set-cookie") ? [resp.headers.get("set-cookie")!] : []);
    const jar = new Map(
      this.cookie
        .split(";")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => [p.split("=")[0], p])
    );
    for (const linha of novos) {
      const par = linha.split(";")[0];
      const nome = par.split("=")[0];
      if (nome) jar.set(nome, par);
    }
    this.cookie = [...jar.values()].join("; ");
  }

  async login(): Promise<void> {
    const r = await fetch(`${this.cred.baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: this.cred.email, password: this.cred.senha }),
      redirect: "manual",
      cache: "no-store",
    });
    this.juntarCookies(r);
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (j.success === false) throw new Error(`login SZ falhou: ${j.error ?? "desconhecido"}`);
    // pega o CSRF de uma página logada
    const home = await fetch(`${this.cred.baseUrl}/reports/messages`, {
      headers: { Cookie: this.cookie, Accept: "text/html" },
      cache: "no-store",
    });
    this.juntarCookies(home);
    const html = await home.text();
    this.csrf = html.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1] ?? "";
  }

  /** GET/POST autenticado; injeta cookie + CSRF + XHR.
   *  cache: no-store é obrigatório — o fetch do Next cacheia GETs em route
   *  handlers e serviria uma resposta velha (HTML de login) para a sessão nova. */
  async api(rota: string, opt: { method?: string; body?: unknown } = {}): Promise<Response> {
    const chamar = () =>
      fetch(`${this.cred.baseUrl}${rota}`, {
        method: opt.method ?? "GET",
        headers: {
          Cookie: this.cookie,
          "X-Requested-With": "XMLHttpRequest",
          "X-CSRF-TOKEN": this.csrf,
          ...(opt.body ? { "Content-Type": "application/json" } : {}),
          Accept: "application/json",
        },
        body: opt.body ? JSON.stringify(opt.body) : undefined,
        cache: "no-store",
      });
    let res = await chamar();
    // sessão caiu no meio: o SZ devolve o HTML do SPA de login em vez de JSON
    // ("Unexpected token '<'…" nas telas). Reloga UMA vez e repete a chamada.
    if ((res.headers.get("content-type") ?? "").includes("text/html")) {
      this.cookie = "";
      this.csrf = "";
      await this.login();
      res = await chamar();
    }
    return res;
  }
}
