import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Leitor de aditivos do painel do SGP (Setor de Atendimento — refidelização).
 *
 * A API da URA não expõe aditivos, então lemos dois relatórios do painel e os
 * cruzamos:
 *
 *  1. /admin/aditivo/list/  — quem gerou, cliente, contrato, descrição e o
 *     status "Aprovado". Esse status sozinho não vale como prova: hoje a
 *     própria agente aprova o aditivo que criou.
 *  2. /admin/relatorios/contrato/assinatura_eletronica/ — o SGPsign, que diz
 *     se o CLIENTE e o PROVEDOR assinaram. É a régua independente: nenhuma
 *     das duas controla esse carimbo.
 *
 * Comissiona só o que passa nas duas.
 */

const UA = "Mozilla/5.0 (plataforma-interlig; leitor-aditivos)";

export type AditivoSgp = {
  sgpAditivoId: string;
  sgpContratoId: string | null;
  clienteNome: string;
  agenteLogin: string;
  tipo: string;
  descricao: string;
  planoRotulo: string | null;
  desconto: number;
  dataAditivo: string; // aaaa-mm-dd
  statusSgp: string;
  assinaturaCliente: boolean;
  assinaturaProvedor: boolean;
  finalizado: boolean;
};

/** "800MB - RENOVAÇÃO FIDELIDADE - DESC. MENSALIDADE R$ 20,00" → "800MB" */
function planoDe(descricao: string): string | null {
  return descricao.match(/^\s*([\dA-Z]+(?:MB|GB)|CORPORATE|FIDELIDADE CORPORATE)/i)?.[1] ?? null;
}

function descontoDe(descricao: string): number {
  const m = descricao.match(/R\$\s*([\d.]+,\d{2}|\d+)/);
  if (!m) return 0;
  return Number(m[1].replace(/\./g, "").replace(",", ".")) || 0;
}

/** dd/mm/aaaa hh:mm:ss → aaaa-mm-dd */
function dataDe(texto: string): string | null {
  const m = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const semTags = (h: string) =>
  h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export class PainelAditivos {
  private cookies = new Map<string, string>();
  private logado = false;

  constructor(
    private base: string,
    private usuario: string,
    private senha: string
  ) {}

  private get cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private async pegar(caminho: string, extra: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${this.base}${caminho}`, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
      ...extra,
      headers: { "User-Agent": UA, Cookie: this.cookieHeader, ...(extra.headers ?? {}) },
    });
    for (const linha of res.headers.getSetCookie?.() ?? []) {
      const [par] = linha.split(";");
      const i = par.indexOf("=");
      if (i > 0) this.cookies.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
    }
    return res;
  }

  async login(): Promise<void> {
    if (this.logado) return;
    const html = await (await this.pegar("/accounts/login/")).text();
    const csrf =
      html.match(/name="csrfmiddlewaretoken"[^>]*value="([^"]+)"/)?.[1] ??
      this.cookies.get("csrftoken") ??
      "";
    if (!csrf) throw new Error("SGP painel: CSRF do login não encontrado");
    await this.pegar("/accounts/login/", {
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
    if (![...this.cookies.keys()].some((k) => /session/i.test(k))) {
      throw new Error("SGP painel: login recusado — confira usuário/senha");
    }
    this.logado = true;
  }

  /** Aditivos do período, de todos os tipos (fidelidade e mudança de plano). */
  async listar(deBr: string, ateBr: string): Promise<AditivoSgp[]> {
    await this.login();

    // 1) listagem — todos os aditivos aprovados do período
    const q = new URLSearchParams({
      clientebusca: "",
      clientebuscatipo: "0",
      usuario: "",
      status: "1", // Aprovado
      tipo: "4", // Fidelidade
      data_inicial: deBr,
      data_final: ateBr,
    });
    for (const pop of ["1", "16", "12", "18", "2", "17"]) q.append("Pops", pop);

    const html = await (await this.pegar(`/admin/aditivo/list/?${q}`)).text();
    const linhas = html
      .split(/<tr[\s>]/)
      .filter((b) => /\/admin\/aditivo\/\d+\//.test(b))
      .map((b) => {
        const cels = [...b.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => semTags(c[1]));
        const id = b.match(/\/admin\/aditivo\/(\d+)\//)?.[1] ?? "";
        return { id, cels };
      })
      .filter((l) => l.id && l.cels.length >= 8);

    // 2) SGPsign — quais têm as DUAS assinaturas
    const qa = new URLSearchParams({
      tipo_pesquisa: "1",
      tipo_aditivo: "4",
      assinatura_1: "1",
      assinatura_2: "1",
      data_inicial: deBr,
      data_final: ateBr,
      paginate_by: "1000",
      clientebusca: "",
      clientebuscatipo: "0",
    });
    const htmlSign = semTags(
      await (await this.pegar(`/admin/relatorios/contrato/assinatura_eletronica/?${qa}`)).text()
    );
    const assinados = new Set(
      [...htmlSign.matchAll(/Aditivo de Fidelidade ID:\s*(\d+)/g)].map((m) => m[1])
    );

    return linhas.map((l) => {
      const descricao = l.cels[7] ?? "";
      const ok = assinados.has(l.id);
      return {
        sgpAditivoId: l.id,
        sgpContratoId: l.cels[1] || null,
        clienteNome: l.cels[0] ?? "—",
        agenteLogin: (l.cels[4] ?? "").toLowerCase(),
        tipo: l.cels[2] ?? "Fidelidade",
        descricao,
        planoRotulo: planoDe(descricao),
        desconto: descontoDe(descricao),
        dataAditivo: dataDe(l.cels[5] ?? "") ?? deBr.split("/").reverse().join("-"),
        statusSgp: l.cels[3] ?? "",
        // o SGPsign só finaliza com as duas assinaturas, então uma coisa
        // implica a outra — guardamos as três para a tela poder explicar
        assinaturaCliente: ok,
        assinaturaProvedor: ok,
        finalizado: ok,
      };
    });
  }
}

export type ResultadoSyncAditivos = {
  ok: boolean;
  lidos: number;
  gravados: number;
  validos: number;
  erro?: string;
};

/**
 * Sincroniza os aditivos de um mês. O VTV usa o valor do contrato, mas cai
 * para o valor de tabela do plano quando o contrato guarda cobrança anual
 * (alguns corporativos têm o valor do ano gravado como mensalidade — ver
 * Cargill/#18058). Sem isso um único contrato distorceria a faixa da agente.
 */
export async function sincronizarAditivos(mesIso: string): Promise<ResultadoSyncAditivos> {
  const admin = criarClienteAdmin();
  const { data: cfgRow } = await admin
    .from("integracoes_config")
    .select("config")
    .eq("sistema", "sgp")
    .maybeSingle();
  const cfg = (cfgRow?.config ?? {}) as Record<string, string>;
  if (!cfg.painel_usuario || !cfg.painel_senha) {
    return { ok: false, lidos: 0, gravados: 0, validos: 0, erro: "credencial do painel não configurada" };
  }
  const base = String(cfg.base_url ?? "").replace(/\/+$/, "").replace(/\/admin$/, "");

  const [ano, mes] = mesIso.slice(0, 7).split("-");
  const ultimoDia = new Date(Date.UTC(Number(ano), Number(mes), 0)).getUTCDate();
  const deBr = `01/${mes}/${ano}`;
  const ateBr = `${ultimoDia}/${mes}/${ano}`;

  let lista: AditivoSgp[];
  try {
    lista = await new PainelAditivos(base, cfg.painel_usuario, cfg.painel_senha).listar(deBr, ateBr);
  } catch (e) {
    return { ok: false, lidos: 0, gravados: 0, validos: 0, erro: e instanceof Error ? e.message : String(e) };
  }

  // valores: contrato + plano, para normalizar cobrança anual
  const ids = [...new Set(lista.map((a) => a.sgpContratoId).filter(Boolean))] as string[];
  const { data: contratos } = await admin
    .from("contratos")
    .select("id, sgp_contrato_id, valor_mensalidade, planos(valor_referencia)")
    .in("sgp_contrato_id", ids.length ? ids : ["-"]);
  const infoContrato = new Map(
    (contratos ?? []).map((c) => {
      const ref = Number((c.planos as unknown as { valor_referencia: number } | null)?.valor_referencia ?? 0);
      const doContrato = Number(c.valor_mensalidade ?? 0);
      // O valor gravado no contrato é o que o cliente pagava ANTES de
      // refidelizar — quem perde a fidelidade perde o desconto e passa a pagar
      // cheio (400MB: R$ 129,90 em vez de R$ 99,90). Refidelizar devolve o
      // benefício, então a base é o valor de TABELA do plano, que já é o valor
      // com fidelidade. O valor do contrato só entra quando não há plano
      // casado, e aí vale o que existir.
      const mensal = ref > 0 ? ref : doContrato;
      return [c.sgp_contrato_id as string, { id: c.id as string, mensal }];
    })
  );

  const linhas = lista.map((a) => {
    const info = a.sgpContratoId ? infoContrato.get(a.sgpContratoId) : undefined;
    return {
      sgp_aditivo_id: a.sgpAditivoId,
      sgp_contrato_id: a.sgpContratoId,
      contrato_id: info?.id ?? null,
      cliente_nome: a.clienteNome,
      agente_login: a.agenteLogin,
      tipo: a.tipo,
      descricao: a.descricao,
      plano_rotulo: a.planoRotulo,
      desconto: a.desconto,
      valor_mensal: info?.mensal ?? 0,
      data_aditivo: a.dataAditivo,
      status_sgp: a.statusSgp,
      assinatura_cliente: a.assinaturaCliente,
      assinatura_provedor: a.assinaturaProvedor,
      finalizado: a.finalizado,
      sincronizado_em: new Date().toISOString(),
    };
  });

  let gravados = 0;
  for (let i = 0; i < linhas.length; i += 200) {
    const { error } = await admin
      .from("aditivos")
      .upsert(linhas.slice(i, i + 200), { onConflict: "sgp_aditivo_id" });
    if (!error) gravados += linhas.slice(i, i + 200).length;
  }

  return {
    ok: true,
    lidos: lista.length,
    gravados,
    validos: lista.filter((a) => a.finalizado).length,
  };
}
