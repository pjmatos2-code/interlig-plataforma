import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Data de ativação gravada pelo sync (D12b: a instalação é a virada
 * Inativo → Ativo no SGP).
 *
 * Roda o executarSync() de verdade, com o leitor de verdade (lib/sgp/api.ts),
 * contra um SGP simulado e um banco em memória. É na soma dos dois que o erro
 * morava: o leitor devolve a data de cadastro como ativação de todo contrato
 * que não está inativo, e o worker caía nela quando o contrato virava ativo.
 */

const palco = vi.hoisted(() => ({
  admin: null as unknown,
  cfg: { modo: "real" as const, base_url: "https://sgp.teste", token: "t", app: "a" },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ criarClienteAdmin: () => palco.admin }));
vi.mock("@/lib/integracoes/config", () => ({ lerConfigSgp: async () => palco.cfg }));
vi.mock("@/lib/sgp/client", async () => {
  const { SgpApiClient } = await import("@/lib/sgp/api");
  return {
    criarClienteSgp: async (janela?: import("@/lib/sgp/api").JanelaVarredura) => new SgpApiClient(palco.cfg, janela),
  };
});
vi.mock("@/lib/sgp/painel", () => ({
  identificarVendedoresPainel: async () => ({ ok: true, atribuidos: 0, semMapeamento: [] }),
  PainelSgp: class {},
}));

import { executarSync } from "@/lib/sync/worker";

// ---------------------------------------------------------------- banco em memória
type Linha = Record<string, unknown>;

/** As travas da tabela contratos (0001_schema.sql): uma linha recusada derruba o lote. */
function travaDeContrato(l: Linha): string | null {
  const venda = l.data_venda as string;
  for (const campo of ["data_assinatura", "data_ativacao", "data_cancelamento"]) {
    const data = l[campo] as string | null;
    if (data && data < venda) return `${campo} anterior à venda`;
  }
  if ((l.status === "cancelado") !== (l.data_cancelamento != null)) return "status e data de cancelamento não batem";
  return null;
}

function bancoEmMemoria() {
  const tabelas = new Map<string, Linha[]>();
  const runs: Linha[] = [];
  const t = (nome: string) => tabelas.get(nome) ?? (tabelas.set(nome, []), tabelas.get(nome)!);

  function consulta(tabela: string) {
    const e = { op: "select", filtros: [] as [string, unknown[]][], outros: false, linhas: [] as Linha[], chave: "", patch: {} as Linha, id: null as unknown };
    const executar = (): { data: unknown; error: { message: string } | null } => {
      if (tabela === "sync_runs") {
        if (e.op === "insert") {
          const run = { id: `run-${runs.length + 1}`, ...e.linhas[0] };
          runs.push(run);
          return { data: { id: run.id }, error: null };
        }
        if (e.op === "update") Object.assign(runs.find((r) => r.id === e.id) ?? {}, e.patch);
        return { data: [], error: null };
      }
      if (tabela === "integracoes_config") return { data: { config: { scan_offset: 0 } }, error: null };
      if (e.op === "upsert") {
        if (tabela === "contratos") {
          const recusa = e.linhas.map(travaDeContrato).find(Boolean);
          if (recusa) return { data: null, error: { message: `violates check constraint: ${recusa}` } };
        }
        for (const l of e.linhas) {
          const atual = t(tabela).find((x) => x[e.chave] === l[e.chave]);
          if (atual) Object.assign(atual, l);
          else t(tabela).push({ id: `${tabela}-${t(tabela).length + 1}`, ...l });
        }
        return { data: null, error: null };
      }
      if (e.op === "select") {
        if (e.outros) return { data: [], error: null }; // filas de assinatura e de OS: nada pendente
        let linhas = t(tabela);
        for (const [col, valores] of e.filtros) linhas = linhas.filter((l) => valores.includes(l[col]));
        return { data: linhas, error: null };
      }
      return { data: null, error: null }; // update e delete das outras tabelas: sem efeito aqui
    };
    const q: Record<string, unknown> = {
      select: () => q,
      insert: (l: Linha | Linha[]) => ((e.op = "insert"), (e.linhas = ([] as Linha[]).concat(l)), q),
      upsert: (l: Linha | Linha[], o?: { onConflict?: string }) => ((e.op = "upsert"), (e.linhas = ([] as Linha[]).concat(l)), (e.chave = o?.onConflict ?? "id"), q),
      update: (p: Linha) => ((e.op = "update"), (e.patch = p), q),
      delete: () => ((e.op = "delete"), q),
      eq: (col: string, v: unknown) => (col === "id" ? (e.id = v) : e.filtros.push([col, [v]]), q),
      in: (col: string, v: unknown[]) => (e.filtros.push([col, v]), q),
      single: async () => executar(),
      maybeSingle: async () => executar(),
      then: (ok: (r: unknown) => unknown, falha: (r: unknown) => unknown) => Promise.resolve(executar()).then(ok, falha),
    };
    for (const m of ["neq", "gte", "lt", "or", "not", "order", "limit"]) q[m] = () => ((e.outros = true), q);
    return q;
  }
  return { admin: { from: consulta, rpc: async () => ({ data: null, error: null }) }, runs, tabelas };
}

// ---------------------------------------------------------------- SGP simulado
type ContratoSgp = { id: number; status: string; dataCadastro: string };
const cadastro = (id: number, contratos: ContratoSgp[]) => ({
  id,
  nome: `Cliente de teste ${id}`,
  cpfcnpj: String(id).padStart(11, "0"),
  endereco: { cidade: "ALTAMIRA", uf: "PA" },
  contratos: contratos.map((c) => ({ ...c, servicos: [{ tipo: "internet", plano: { id: 1, descricao: "500 MEGA" } }] })),
  titulos: [],
});

function ligarSgp(lista: ReturnType<typeof cadastro>[]) {
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
    const p = JSON.parse(String(init?.body)) as { limit: number; offset: number };
    return new Response(JSON.stringify({ paginacao: { total: lista.length }, clientes: lista.slice(p.offset, p.offset + p.limit) }));
  }));
}

/** Relógio do sync: só a data é simulada, o resto do tempo corre normal. */
function agoraEh(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function montar(contratos: ContratoSgp[]) {
  const banco = bancoEmMemoria();
  palco.admin = banco.admin;
  const lista = [cadastro(1, contratos)];
  ligarSgp(lista);
  const gravado = (sgpContratoId: number) => (banco.tabelas.get("contratos") ?? []).find((c) => c.sgp_contrato_id === String(sgpContratoId))!;
  /** o status do contrato muda no SGP entre uma passada e outra */
  const noSgp = (sgpContratoId: number, status: string) => {
    lista[0].contratos.find((c) => c.id === sgpContratoId)!.status = status;
  };
  /** a etapa contratos da última passada: se o banco recusar o lote, ela termina "parcial" */
  const etapaContratos = () => banco.runs.filter((r) => r.entidade === "contratos").at(-1)!;
  return { gravado, noSgp, etapaContratos };
}

describe("data de ativação gravada pelo sync (D12b)", () => {
  it("contrato que estava aguardando e virou ativo no SGP: o dia em que o sync percebeu, não a data do cadastro", async () => {
    // venda em 12/11, ainda inativa no SGP: entra na plataforma aguardando ativação
    const { gravado, noSgp, etapaContratos } = montar([{ id: 501, status: "INATIVO", dataCadastro: "12/11/2026" }]);
    agoraEh("2026-11-12T14:00:00-03:00");
    await executarSync();
    expect(gravado(501)).toMatchObject({ status: "aguardando_ativacao", data_venda: "2026-11-12", data_ativacao: null });

    // quatro dias depois o técnico instala e o contrato vira Ativo no SGP
    noSgp(501, "ATIVO");
    agoraEh("2026-11-16T10:30:00-03:00");
    await executarSync();
    expect(etapaContratos().status).toBe("sucesso");
    expect(gravado(501)).toMatchObject({ status: "ativo", data_venda: "2026-11-12", data_ativacao: "2026-11-16" });
  });

  it("a data carimbada na virada não muda nas passadas seguintes", async () => {
    const { gravado, noSgp } = montar([{ id: 502, status: "INATIVO", dataCadastro: "12/11/2026" }]);
    agoraEh("2026-11-12T14:00:00-03:00");
    await executarSync();
    noSgp(502, "ATIVO");
    agoraEh("2026-11-16T10:30:00-03:00");
    await executarSync();
    agoraEh("2026-11-17T09:00:00-03:00");
    await executarSync();
    noSgp(502, "SUSPENSO");
    agoraEh("2026-12-20T09:00:00-03:00");
    await executarSync();
    expect(gravado(502)).toMatchObject({ status: "suspenso", data_ativacao: "2026-11-16" });
  });

  it("virada percebida à noite: vale o dia de Santarém, não o do relógio do servidor (UTC)", async () => {
    const { gravado, noSgp } = montar([{ id: 503, status: "INATIVO", dataCadastro: "12/11/2026" }]);
    agoraEh("2026-11-12T14:00:00-03:00");
    await executarSync();
    noSgp(503, "ATIVO");
    agoraEh("2026-11-16T22:30:00-03:00"); // 17/11 01:30 em UTC
    await executarSync();
    expect(gravado(503).data_ativacao).toBe("2026-11-16");
  });

  it("contrato novo na base que já chega ativo: continua a aproximação pela data do cadastro", async () => {
    // a plataforma nunca viu esse contrato inativo, então não sabe quando ele foi instalado
    const { gravado } = montar([{ id: 504, status: "ATIVO", dataCadastro: "03/11/2026" }]);
    agoraEh("2026-11-16T10:30:00-03:00");
    await executarSync();
    expect(gravado(504)).toMatchObject({ status: "ativo", data_venda: "2026-11-03", data_ativacao: "2026-11-03" });
  });

  it("venda retomada que estava aguardando: a ativação é o dia da virada e a venda ajustada fica", async () => {
    // cadastro de 28/09 no SGP; a gestão ajustou a venda para 12/11 (venda retomada)
    const { gravado, noSgp, etapaContratos } = montar([{ id: 505, status: "INATIVO", dataCadastro: "28/09/2026" }]);
    agoraEh("2026-11-12T14:00:00-03:00");
    await executarSync();
    Object.assign(gravado(505), { data_venda: "2026-11-12", venda_retomada_em: "2026-11-12T17:00:00Z" });

    noSgp(505, "ATIVO");
    agoraEh("2026-11-14T16:00:00-03:00");
    await executarSync();
    expect(etapaContratos().status).toBe("sucesso"); // o banco não recusou o lote
    expect(gravado(505)).toMatchObject({ status: "ativo", data_venda: "2026-11-12", data_venda_sgp: "2026-09-28", data_ativacao: "2026-11-14" });
  });
});
