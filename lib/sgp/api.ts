import type { ConfigSgp } from "@/lib/integracoes/config";
import type { SgpClient, SgpCliente, SgpContrato, SgpPlano, SgpTitulo } from "./tipos";

/**
 * SgpApiClient — API URA real da instância da Interlig (docs/decisoes.md D3).
 * Fonte única: varredura paginada de /api/ura/clientes/ (contratos e títulos
 * vêm embutidos). A varredura é feita UMA vez por execução de sync e
 * memoizada para alimentar os quatro listar*.
 *
 * Aproximações da D3: sem vendedor, datas de assinatura/ativação assumem o
 * cadastro, mensalidade = título mais recente. Escopo: só os POPs abaixo.
 */

const CIDADES_ESCOPO = new Map([
  ["ALTAMIRA", "Altamira"],
  ["VITORIA DO XINGU", "Vitória do Xingu"],
  ["BRASIL NOVO", "Brasil Novo"],
]);
const PAGINA = 100; // limite máximo aceito pela API

type BrutoCliente = {
  id: number;
  nome: string;
  cpfcnpj: string | null;
  endereco?: { bairro?: string; cidade?: string; latitude?: string; longitude?: string };
  contatos?: { telefones?: string[]; celulares?: string[] };
  contratos?: BrutoContrato[];
  titulos?: BrutoTitulo[];
};
type BrutoContrato = {
  id: number;
  status?: string;
  motivo_status?: string;
  dataCadastro?: string;
  servicos?: { tipo?: string; plano?: { id?: number; descricao?: string } }[];
};
type BrutoTitulo = {
  id: number;
  clientecontrato_id: number;
  status?: string;
  valor?: number | string;
  valorCorrigido?: number | string;
  dataVencimento?: string;
  dataPagamento?: string;
};

const semAcento = (s: string | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

/**
 * Cidade do cadastro → nome canônico do escopo, tolerando as variações que o
 * atendimento digita ("ALTAMIRA-PA", "ALTAMIRA PARA", "VITORIA DO  XINGU PA",
 * "ALTAMIA", "XINFU", "VTX"…). Um levantamento de 02/09/2026 achou 111
 * clientes do escopo excluídos do sync só pela grafia da cidade — sem
 * contrato, sem ticket e sem contar na comissão.
 */
const cidadeEscopo = (s: string | undefined): string | null => {
  let c = semAcento(s).replace(/[^A-Z]+/g, " ").replace(/\s+/g, " ").trim();
  c = c.replace(/ (PA|PARA)$/, "");
  if (c === "ALTAMIA") c = "ALTAMIRA";
  if (c === "VTX" || c === "VITORIA DO XINFU") c = "VITORIA DO XINGU";
  return CIDADES_ESCOPO.get(c) ?? null;
};
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const dataBr = (s: string | undefined | null): string | null => {
  if (!s) return null;
  const br = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
};

export type JanelaVarredura = {
  /** offset inicial (em registros) e nº máximo de páginas por execução */
  offset: number;
  maxPaginas: number;
};

export class SgpApiClient implements SgpClient {
  modo = "real" as const;
  private varredura: Promise<BrutoCliente[]> | null = null;
  /** preenchido após a varredura: onde a janela parou e o total da instância */
  public progresso: { proximoOffset: number; total: number; completou: boolean } | null = null;

  constructor(
    private cfg: ConfigSgp,
    private janela?: JanelaVarredura
  ) {}

  private get config() {
    const { base_url, token, app } = this.cfg;
    if (!base_url || !token || !app) {
      throw new Error("Modo real exige URL, token e app do SGP — cadastre em Admin → Integrações.");
    }
    // a API mora na raiz do domínio (sem /admin)
    const base = base_url.replace(/\/+$/, "").replace(/\/admin$/, "");
    return { base, token, app };
  }

  private async chamar<T>(rota: string, corpo: Record<string, unknown> = {}): Promise<T> {
    const { base, token, app } = this.config;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const resposta = await fetch(`${base}${rota}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, app, ...corpo }),
          signal: AbortSignal.timeout(45_000),
          cache: "no-store",
        });
        if (!resposta.ok) throw new Error(`SGP ${rota} respondeu ${resposta.status}`);
        return (await resposta.json()) as T;
      } catch (e) {
        if (tentativa === 2) throw e;
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
    throw new Error("inalcançável");
  }

  /**
   * Varre os clientes (memoizado por execução) e filtra o escopo.
   * Com `janela`, varre só um trecho — o worker roda janelas sucessivas a
   * cada sync (cursor persistido) para caber no tempo do serverless.
   */
  /** clientes carregados fora da varredura (caçador de cadastros novos) */
  private extras: BrutoCliente[] = [];

  /**
   * Busca clientes direto na URA por CPF/CNPJ e injeta na varredura desta
   * execução — chame ANTES de listarClientes/listarContratos. É a rede de
   * segurança para cadastros novos: a lista da URA é alfabética e desloca a
   * cada inserção, então a janela do cursor pode pular quem acabou de entrar.
   */
  async carregarExtrasPorCpf(cpfs: string[]): Promise<number> {
    let carregados = 0;
    for (const cpf of cpfs) {
      const limpo = (cpf ?? "").replace(/\D/g, "");
      if (!limpo) continue;
      try {
        const r = await this.chamar<{ clientes?: BrutoCliente[] }>("/api/ura/clientes/", {
          cpfcnpj: limpo,
        });
        for (const c of r.clientes ?? []) {
          if (!this.extras.some((x) => x.id === c.id)) {
            this.extras.push(c);
            carregados += 1;
          }
        }
      } catch {
        // um CPF que falhar não derruba o ciclo — entra na próxima
      }
    }
    return carregados;
  }

  private escanear(): Promise<BrutoCliente[]> {
    this.varredura ??= (async () => {
      const todos: BrutoCliente[] = [];
      let offset = this.janela?.offset ?? 0;
      const limitePaginas = this.janela?.maxPaginas ?? Infinity;
      let paginas = 0;
      let total = Infinity;
      while (offset < total && paginas < limitePaginas) {
        const pagina = await this.chamar<{
          paginacao: { total: number };
          clientes: BrutoCliente[];
        }>("/api/ura/clientes/", { limit: PAGINA, offset });
        total = pagina.paginacao.total;
        todos.push(...pagina.clientes);
        offset += PAGINA;
        paginas += 1;
      }
      this.progresso = {
        proximoOffset: offset >= total ? 0 : offset,
        total: Number.isFinite(total) ? total : 0,
        completou: offset >= total,
      };
      // extras do caçador entram junto (sem duplicar quem a janela já trouxe)
      const ids = new Set(todos.map((c) => c.id));
      const comExtras = [...todos, ...this.extras.filter((c) => !ids.has(c.id))];
      return comExtras.filter((c) => cidadeEscopo(c.endereco?.cidade) !== null);
    })();
    return this.varredura;
  }

  async listarPlanos(): Promise<SgpPlano[]> {
    const clientes = await this.escanear();
    const planos = new Map<string, SgpPlano>();
    for (const c of clientes) {
      for (const ct of c.contratos ?? []) {
        const servico = (ct.servicos ?? []).find((s) => s.tipo !== "tv") ?? (ct.servicos ?? [])[0];
        if (servico?.plano?.id && !planos.has(String(servico.plano.id))) {
          planos.set(String(servico.plano.id), {
            sgp_plano_id: String(servico.plano.id),
            nome: servico.plano.descricao ?? `Plano ${servico.plano.id}`,
            velocidade: null,
            valor_referencia: 0,
            ativo: true,
          });
        }
      }
    }
    return [...planos.values()];
  }

  async listarClientes(): Promise<SgpCliente[]> {
    const clientes = await this.escanear();
    return clientes.map((c) => ({
      sgp_cliente_id: String(c.id),
      nome: c.nome ?? "—",
      cpf: c.cpfcnpj ?? null,
      telefone: c.contatos?.celulares?.[0] ?? c.contatos?.telefones?.[0] ?? null,
      bairro: c.endereco?.bairro ?? null,
      cidade: cidadeEscopo(c.endereco?.cidade),
      origem_cadastro_sgp: null, // não exposto pela URA (D3)
    }));
  }

  async listarContratos(): Promise<SgpContrato[]> {
    const clientes = await this.escanear();
    const contratos: SgpContrato[] = [];
    for (const c of clientes) {
      const titulosPorContrato = new Map<string, BrutoTitulo[]>();
      for (const t of c.titulos ?? []) {
        const k = String(t.clientecontrato_id);
        if (!titulosPorContrato.has(k)) titulosPorContrato.set(k, []);
        titulosPorContrato.get(k)!.push(t);
      }
      for (const ct of c.contratos ?? []) {
        const dataVenda = dataBr(ct.dataCadastro);
        if (!dataVenda) continue;
        const st = semAcento(ct.status);
        const cancelado = st.includes("CANCEL");
        const servico = (ct.servicos ?? []).find((s) => s.tipo !== "tv") ?? (ct.servicos ?? [])[0];
        const recentes = (titulosPorContrato.get(String(ct.id)) ?? [])
          .filter((t) => t.status !== "cancelado" && dataBr(t.dataVencimento))
          .sort((a, b) => (dataBr(a.dataVencimento)! < dataBr(b.dataVencimento)! ? 1 : -1));
        contratos.push({
          sgp_contrato_id: String(ct.id),
          sgp_cliente_id: String(c.id),
          sgp_plano_id: servico?.plano?.id ? String(servico.plano.id) : null,
          sgp_vendedor_id: null, // não exposto pela URA (D3)
          // MAIOR título nominal do contrato — a 1ª fatura de cliente novo é
          // pró-rata e usava ~metade do valor real (D12). O gatilho
          // contratos_valor_oficial sobrepõe com o Vl. Base quando existir.
          valor_mensalidade: recentes.reduce((mx, t) => Math.max(mx, num(t.valor)), 0),
          valor_instalacao: 0,
          status_sgp: ct.status ?? "",
          origem_cadastro_sgp: null,
          data_venda: dataVenda,
          data_assinatura: dataVenda, // aproximação D3
          // D12b: no SGP a instalação é a virada Inativo→Ativo — contrato
          // INATIVO ainda não foi instalado (sem data de ativação)
          data_ativacao: st.includes("INATIV") ? null : dataVenda,
          data_cancelamento: cancelado ? dataVenda : null, // o worker preserva data melhor
          motivo_cancelamento: cancelado ? ct.motivo_status || null : null,
        });
      }
    }
    return contratos;
  }

  async listarTitulos(): Promise<SgpTitulo[]> {
    const clientes = await this.escanear();
    const titulos: SgpTitulo[] = [];
    // sync contínuo só precisa da movimentação recente (a carga inicial já
    // trouxe o histórico completo)
    const corte = new Date(Date.now() - 430 * 86_400_000).toISOString().slice(0, 10);
    for (const c of clientes) {
      const porContrato = new Map<string, BrutoTitulo[]>();
      for (const t of c.titulos ?? []) {
        const k = String(t.clientecontrato_id);
        if (!porContrato.has(k)) porContrato.set(k, []);
        porContrato.get(k)!.push(t);
      }
      for (const [contratoId, lista] of porContrato) {
        const ordenados = lista
          .filter((t) => dataBr(t.dataVencimento))
          .sort((a, b) => (dataBr(a.dataVencimento)! < dataBr(b.dataVencimento)! ? -1 : 1));
        ordenados.forEach((t, i) => {
          if (dataBr(t.dataVencimento)! < corte) return; // parcela antiga: já temos
          titulos.push({
            sgp_titulo_id: String(t.id),
            sgp_contrato_id: contratoId,
            numero_parcela: i + 1,
            valor: num(t.valorCorrigido ?? t.valor),
            vencimento: dataBr(t.dataVencimento)!,
            data_pagamento: dataBr(t.dataPagamento),
            status:
              t.status === "pago" ? "liquidado" : t.status === "cancelado" ? "cancelado" : "aberto",
          });
        });
      }
    }
    return titulos;
  }
}
