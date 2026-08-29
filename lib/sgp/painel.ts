import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Leitor do painel do SGP — identificação automática do vendedor (decisão A).
 *
 * A API URA não expõe o vendedor do contrato (D3), mas o painel admin mostra o
 * campo nativo em Dados de Acesso do serviço: um <select
 * name="clientecontrato-vendedor"> com a option `selected` no formato
 * "Nome - login" (ex.: "Karoline Moraes - karoline.xavier").
 *
 * Este leitor faz login de sessão (Django: /accounts/login/ com CSRF), abre a
 * página de contratos do cliente para achar o serviço do contrato e extrai o
 * vendedor selecionado. O login do SGP (karoline.xavier) é a chave estável de
 * mapeamento para a vendedora da plataforma (vendedores.sgp_login), com
 * fallback por primeiro nome — e aprendizado: quando casa por nome, grava o
 * sgp_login para os próximos casarem direto.
 */

const UA = "Mozilla/5.0 (plataforma-interlig; leitor-vendedor)";

export type VendedorPainel = {
  sgpVendedorId: string;
  nome: string;
  login: string | null;
};

export class PainelSgp {
  private cookies = new Map<string, string>();
  private logado = false;

  constructor(
    private base: string,
    private usuario: string,
    private senha: string
  ) {}

  private guardarCookies(res: Response) {
    for (const linha of res.headers.getSetCookie?.() ?? []) {
      const [par] = linha.split(";");
      const i = par.indexOf("=");
      if (i > 0) this.cookies.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
    }
  }

  private get cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private async pegar(caminho: string, extra: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${this.base}${caminho}`, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
      ...extra,
      headers: {
        "User-Agent": UA,
        Cookie: this.cookieHeader,
        ...(extra.headers ?? {}),
      },
    });
    this.guardarCookies(res);
    return res;
  }

  async login(): Promise<void> {
    if (this.logado) return;
    // 1) GET da tela de login: cookie csrftoken + campo csrfmiddlewaretoken
    const tela = await this.pegar("/accounts/login/");
    const html = await tela.text();
    const csrf =
      html.match(/name="csrfmiddlewaretoken"[^>]*value="([^"]+)"/)?.[1] ??
      this.cookies.get("csrftoken") ??
      "";
    if (!csrf) throw new Error("SGP painel: CSRF do login não encontrado");

    // 2) POST do formulário (Django exige Referer no CSRF em https)
    const corpo = new URLSearchParams({
      csrfmiddlewaretoken: csrf,
      username: this.usuario,
      password: this.senha,
      next: "/admin/",
    });
    const res = await this.pegar("/accounts/login/", {
      method: "POST",
      body: corpo.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `${this.base}/accounts/login/`,
      },
    });
    // sucesso = redirect com cookie de sessão; falha = 200 devolvendo o form
    if (!this.cookies.has("sessionid") && !this.cookies.has("sgp_sessionid")) {
      const temSessao = [...this.cookies.keys()].some((k) => /session/i.test(k));
      if (!temSessao || res.status === 200) {
        throw new Error(`SGP painel: login recusado (status ${res.status}) — confira usuário/senha`);
      }
    }
    this.logado = true;
  }

  /** IDs dos serviços de internet do cliente, na ordem em que aparecem após cada contrato. */
  private async servicoDoContrato(
    sgpClienteId: string,
    sgpContratoId: string
  ): Promise<string | null> {
    const res = await this.pegar(`/admin/cliente/${sgpClienteId}/contratos/`);
    if (res.status !== 200) return null;
    const html = await res.text();
    // o link do serviço vem logo depois do id do contrato na linha da tabela
    const pos = html.indexOf(String(sgpContratoId));
    if (pos < 0) return null;
    return html.slice(pos, pos + 6000).match(/\/admin\/servicos\/internet\/(\d+)\//)?.[1] ?? null;
  }

  /** Vendedor selecionado na página do serviço (campo nativo do SGP). */
  async vendedorDoContrato(
    sgpClienteId: string,
    sgpContratoId: string
  ): Promise<VendedorPainel | null> {
    await this.login();
    const servicoId = await this.servicoDoContrato(sgpClienteId, sgpContratoId);
    if (!servicoId) return null;
    const res = await this.pegar(`/admin/servicos/internet/${servicoId}/`);
    if (res.status !== 200) return null;
    const html = await res.text();
    const select = html.match(
      /<select[^>]*name="clientecontrato-vendedor"[\s\S]*?<\/select>/
    )?.[0];
    const sel = select?.match(
      /<option[^>]*value="(\d+)"[^>]*\bselected\b[^>]*>([^<]+)<\/option>/
    );
    if (!sel) return null; // sem vendedor definido no SGP
    const texto = sel[2].trim();
    const [nome, login] = texto.split(/\s+-\s+/); // "Nome - login" (login pode faltar)
    return { sgpVendedorId: sel[1], nome: (nome ?? texto).trim(), login: login?.trim() ?? null };
  }
}

const semAcento = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export type ResultadoLeitor = {
  ok: boolean;
  verificados: number;
  atribuidos: number;
  /** contratos cuja vendedora estava diferente da do SGP e foi corrigida */
  corrigidos: number;
  semVendedorNoSgp: number;
  semMapeamento: string[];
  erro?: string;
};

/**
 * Roda o leitor para os contratos ainda não verificados no painel, dos mais
 * recentes para os mais antigos (aos poucos cobre o histórico).
 *
 * Antes só varria contratos SEM vendedora, e como o CRM atribui primeiro, o
 * painel quase nunca chegava a olhar: em agosto/2026, 236 dos 297 contratos
 * tinham vendedora vinda do ticket, sem confirmação no SGP. Como a autoria da
 * venda é a do campo vendedor do SGP (decisão 29/08/2026), o leitor agora
 * confere todos e CORRIGE quem estiver diferente.
 */
export async function identificarVendedoresPainel(limite = 15): Promise<ResultadoLeitor> {
  const admin = criarClienteAdmin();

  const { data: cfgRow } = await admin
    .from("integracoes_config")
    .select("config")
    .eq("sistema", "sgp")
    .maybeSingle();
  const cfg = (cfgRow?.config ?? {}) as Record<string, string>;
  if (!cfg.painel_usuario || !cfg.painel_senha) {
    return {
      ok: false, verificados: 0, atribuidos: 0, corrigidos: 0, semVendedorNoSgp: 0, semMapeamento: [],
      erro: "credencial do painel não configurada (scripts/salvar-credencial-sgp-painel.mjs)",
    };
  }
  const base = String(cfg.base_url ?? "").replace(/\/+$/, "").replace(/\/admin$/, "");

  const { data: pendentes } = await admin
    .from("contratos")
    .select("id, sgp_contrato_id, vendedor_id, clientes(sgp_cliente_id)")
    .is("vendedor_painel_verificado_em", null)
    .not("sgp_contrato_id", "is", null)
    .order("data_venda", { ascending: false })
    .limit(limite);
  if (!pendentes || pendentes.length === 0) {
    return { ok: true, verificados: 0, atribuidos: 0, corrigidos: 0, semVendedorNoSgp: 0, semMapeamento: [] };
  }

  const { data: vends } = await admin
    .from("vendedores")
    .select("id, nome, sgp_login")
    .eq("ativo", true);
  const porLogin = new Map(
    (vends ?? []).filter((v) => v.sgp_login).map((v) => [String(v.sgp_login).toLowerCase(), v])
  );
  const acharPorNome = (nomeSgp: string) => {
    const primeiro = semAcento(nomeSgp.split(/\s+/)[0] ?? "");
    if (!primeiro) return null;
    const cands = (vends ?? []).filter((v) => semAcento(v.nome).split(/\s+/)[0] === primeiro);
    return cands.length === 1 ? cands[0] : null; // só casa se for inequívoco
  };

  const painel = new PainelSgp(base, cfg.painel_usuario, cfg.painel_senha);
  let verificados = 0;
  let atribuidos = 0;
  let corrigidos = 0;
  let semVendedorNoSgp = 0;
  const semMapeamento = new Set<string>();

  try {
    await painel.login();
  } catch (e) {
    return {
      ok: false, verificados: 0, atribuidos: 0, corrigidos: 0, semVendedorNoSgp: 0, semMapeamento: [],
      erro: e instanceof Error ? e.message : String(e),
    };
  }

  for (const c of pendentes) {
    const clienteSgp = (c.clientes as unknown as { sgp_cliente_id: string | null })?.sgp_cliente_id;
    if (!clienteSgp) continue;
    try {
      const v = await painel.vendedorDoContrato(clienteSgp, c.sgp_contrato_id as string);
      verificados += 1;
      if (!v) {
        semVendedorNoSgp += 1;
      } else {
        const alvo =
          (v.login ? porLogin.get(v.login.toLowerCase()) : null) ?? acharPorNome(v.nome);
        if (alvo) {
          // o SGP é a fonte da verdade — corrige inclusive o que o CRM atribuiu
          if (alvo.id !== c.vendedor_id) {
            await admin.from("contratos").update({ vendedor_id: alvo.id }).eq("id", c.id);
            if (c.vendedor_id) corrigidos += 1;
            else atribuidos += 1;
          }
          // aprendizado: memoriza o login para os próximos casarem direto
          if (v.login && !alvo.sgp_login) {
            await admin.from("vendedores").update({ sgp_login: v.login }).eq("id", alvo.id);
            porLogin.set(v.login.toLowerCase(), { ...alvo, sgp_login: v.login });
          }
        } else {
          semMapeamento.add(`${v.nome}${v.login ? ` (${v.login})` : ""}`);
        }
      }
      await admin
        .from("contratos")
        .update({ vendedor_painel_verificado_em: new Date().toISOString() })
        .eq("id", c.id);
    } catch {
      // página inacessível nesta rodada: fica para a próxima (não marca verificado)
    }
  }

  return { ok: true, verificados, atribuidos, corrigidos, semVendedorNoSgp, semMapeamento: [...semMapeamento] };
}
