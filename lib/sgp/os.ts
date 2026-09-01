import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Leitor do relatório de Ordem de Serviço do painel do SGP
 * (Relatórios > Atendimento > Ordem de Serviço) — base do módulo da Equipe
 * Técnica. Mesmo login de sessão Django dos outros leitores.
 *
 * Sincroniza TODAS as OS criadas ou encerradas na janela (qualquer status):
 * a régua só paga encerrada, mas a detecção de retorno <24h precisa enxergar
 * a OS nova mesmo ainda aberta.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

type LinhaOs = {
  sgp_os_id: string;
  sgp_contrato_id: string | null;
  cliente_nome: string | null;
  pop: string | null;
  bairro: string | null;
  tipo: string | null;
  motivo: string | null;
  status: string | null;
  criada_em: string | null;
  agendamento: string | null;
  checkin: string | null;
  encerrada_em: string | null;
  responsavel: string | null;
  auxiliares: string | null;
  finalizado_por: string | null;
  servico_prestado: string | null;
};

/** "31/08/2026 15:34:33" → ISO (fuso local do SGP: America/Santarem, UTC-3) */
function dataBrIso(t: string | null): string | null {
  const m = (t ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}-03:00`;
}

const limparHtml = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

class PainelOs {
  private cookies = new Map<string, string>();
  private logado = false;
  constructor(private base: string, private usuario: string, private senha: string) {}

  private guardar(res: Response) {
    for (const linha of res.headers.getSetCookie?.() ?? []) {
      const [par] = linha.split(";");
      const i = par.indexOf("=");
      if (i > 0) this.cookies.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
    }
  }
  private get cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  private async pegar(caminho: string, extra: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${this.base}${caminho}`, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(180_000),
      ...extra,
      headers: { "User-Agent": UA, Cookie: this.cookieHeader, ...(extra.headers ?? {}) },
    });
    this.guardar(res);
    return res;
  }

  async login(): Promise<void> {
    if (this.logado) return;
    const tela = await this.pegar("/accounts/login/");
    const html = await tela.text();
    const csrf =
      html.match(/name="csrfmiddlewaretoken"[^>]*value="([^"]+)"/)?.[1] ??
      this.cookies.get("csrftoken") ??
      "";
    if (!csrf) throw new Error("SGP OS: CSRF do login não encontrado");
    const res = await this.pegar("/accounts/login/", {
      method: "POST",
      body: new URLSearchParams({
        csrfmiddlewaretoken: csrf,
        username: this.usuario,
        password: this.senha,
        next: "/admin/",
      }).toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `${this.base}/accounts/login/`,
      },
    });
    if (![...this.cookies.keys()].some((k) => /session/i.test(k)) || res.status === 200) {
      // 302 é o esperado no sucesso
      if (res.status === 200) throw new Error("SGP OS: login recusado — confira a credencial do painel");
    }
    this.logado = true;
  }

  /** Uma página do relatório. Retorna linhas + se existe próxima página. */
  private async pagina(qs: URLSearchParams, pageNum: number): Promise<{ linhas: LinhaOs[]; temMais: boolean }> {
    const q = new URLSearchParams(qs);
    if (pageNum > 1) q.set("page", String(pageNum));
    const res = await this.pegar(`/admin/atendimento/relatorios/ocorrencia/os/?${q.toString()}`);
    if (res.status !== 200) throw new Error(`SGP OS: relatório retornou ${res.status}`);
    const html = await res.text();

    // mapa de colunas pelo cabeçalho (a ordem pode mudar entre versões do SGP)
    const ths = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => limparHtml(m[1]).toLowerCase());
    const idx = (rotulo: string) => ths.findIndex((t) => t.includes(rotulo));
    const col = {
      id: idx("id"),
      cliente: idx("cliente"),
      pop: idx("pop"),
      bairro: idx("bairro"),
      tipo: idx("tipo"),
      motivo: idx("motivo"),
      status: idx("status"),
      criada: idx("criada"),
      agendamento: idx("agendamento"),
      checkin: idx("check-in"),
      encerrada: idx("encerrada"),
      responsavel: idx("responsável"),
      auxiliares: idx("auxiliar"),
      finalizado: idx("finalizado por"),
      servico: idx("serviço prestado"),
    };
    if (col.id < 0 || col.motivo < 0) return { linhas: [], temMais: false };

    const linhas: LinhaOs[] = [];
    for (const tr of html.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
      const tds = [...tr[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => limparHtml(m[1]));
      if (tds.length < ths.length - 1) continue;
      const v = (i: number) => (i >= 0 && tds[i] ? tds[i] : null);
      const osId = (v(col.id) ?? "").match(/\d+/)?.[0];
      if (!osId) continue;
      const clienteBruto = v(col.cliente) ?? "";
      const mCli = clienteBruto.match(/^(\d+)\s*-\s*(.+)$/);
      linhas.push({
        sgp_os_id: osId,
        sgp_contrato_id: mCli?.[1] ?? null,
        cliente_nome: mCli?.[2]?.trim() ?? (clienteBruto || null),
        pop: v(col.pop),
        bairro: v(col.bairro),
        tipo: v(col.tipo),
        motivo: v(col.motivo),
        status: v(col.status),
        criada_em: dataBrIso(v(col.criada)),
        agendamento: dataBrIso(v(col.agendamento)),
        checkin: dataBrIso(v(col.checkin)),
        encerrada_em: dataBrIso(v(col.encerrada)),
        responsavel: v(col.responsavel),
        auxiliares: v(col.auxiliares),
        finalizado_por: v(col.finalizado),
        servico_prestado: v(col.servico),
      });
    }
    const temMais = new RegExp(`[?&]page=${pageNum + 1}\\b`).test(html);
    return { linhas, temMais };
  }

  /** Todas as OS da janela (por data de cadastro), qualquer status.
   * O relatório não pagina por link: pede-se o teto de 5000 numa página só. */
  async listar(deBr: string, ateBr: string): Promise<LinhaOs[]> {
    await this.login();
    const qs = new URLSearchParams({
      paginate_by: "5000",
      data_cadastro_inicial: `${deBr} 00:00:00`,
      data_cadastro_final: `${ateBr} 23:59:59`,
    });
    const { linhas } = await this.pagina(qs, 1);
    return linhas;
  }
}

export type ResultadoSyncOs = { ok: boolean; lidas: number; gravadas: number; erro?: string };

/** Busca as OS do mês no painel e espelha em os_tecnicas (upsert por sgp_os_id). */
export async function sincronizarOs(mesIso: string): Promise<ResultadoSyncOs> {
  const admin = criarClienteAdmin();
  const { data: cfgRow } = await admin
    .from("integracoes_config")
    .select("config")
    .eq("sistema", "sgp")
    .maybeSingle();
  const cfg = (cfgRow?.config ?? {}) as Record<string, string>;
  if (!cfg.painel_usuario || !cfg.painel_senha) {
    return { ok: false, lidas: 0, gravadas: 0, erro: "credencial do painel não configurada" };
  }
  const base = String(cfg.base_url ?? "").replace(/\/+$/, "").replace(/\/admin$/, "");

  const [ano, mes] = mesIso.slice(0, 7).split("-");
  const ultimo = new Date(Date.UTC(Number(ano), Number(mes), 0)).getUTCDate();
  const deBr = `01/${mes}/${ano}`;
  const ateBr = `${String(ultimo).padStart(2, "0")}/${mes}/${ano}`;

  try {
    const linhas = await new PainelOs(base, cfg.painel_usuario, cfg.painel_senha).listar(deBr, ateBr);
    let gravadas = 0;
    for (let i = 0; i < linhas.length; i += 200) {
      const lote = linhas.slice(i, i + 200);
      const { error, count } = await admin
        .from("os_tecnicas")
        .upsert(lote.map((l) => ({ ...l, importado_em: new Date().toISOString() })), {
          onConflict: "sgp_os_id",
          count: "exact",
        });
      if (error) return { ok: false, lidas: linhas.length, gravadas, erro: error.message };
      gravadas += count ?? lote.length;
    }
    return { ok: true, lidas: linhas.length, gravadas };
  } catch (e) {
    return { ok: false, lidas: 0, gravadas: 0, erro: e instanceof Error ? e.message : "falha no leitor" };
  }
}
