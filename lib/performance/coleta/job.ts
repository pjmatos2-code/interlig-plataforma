import "server-only";
import type { SessaoSz } from "@/lib/sz/sessao";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { carregarConfig, carregarDiasUteis, gravarEstado, lerEstado } from "../config-servidor";
import { calcularConversa } from "./calculo";
import { carregarIndiceTickets, carregarResolverVendedor, gravarConversa, VERSAO_CALCULO, type ContextoColeta } from "./persistir";
import { abrirSessaoSz, baixarMensagensSz, EQUIPES_COMERCIAIS, listarEncerradasDoDia } from "./sz";
import { normalizarConversaSz } from "./sz-normalizar";

/**
 * Coleta das conversas comerciais (24/10/2026) — somente leitura no SZ,
 * escrita só nas tabelas novas (conversas_atendimento/mensagens).
 * Idempotente: conversa já coletada com o mesmo encerramento e a mesma
 * versão de cálculo é pulada; página a página, para um corte de tempo não
 * perder o que já foi feito.
 */

export type ResultadoColetaDia = {
  dia: string;
  paginas: number;
  listadas: number;
  novas: number;
  atualizadas: number;
  puladas: number;
  erros: number;
  /** null = dia lido até o fim */
  proximaPagina: number | null;
  ultimoErro?: string;
};

export async function montarContextoColeta(desdeIso = "2026-07-01T00:00:00-03:00"): Promise<ContextoColeta> {
  const admin = criarClienteAdmin();
  const [cfg, ehDiaUtil, resolverVendedor, indice, { data: equipes }] = await Promise.all([
    carregarConfig(),
    carregarDiasUteis("2026-01-01", "2027-12-31"),
    carregarResolverVendedor(admin),
    carregarIndiceTickets(admin, desdeIso),
    admin.from("sz_equipes_habilitadas").select("nome, pop_id"),
  ]);
  return {
    cfg,
    ehDiaUtil,
    resolverVendedor,
    popPorEquipe: new Map((equipes ?? []).map((e) => [String(e.nome), (e.pop_id as string | null) ?? null])),
    ticketsPorProtocolo: indice.porProtocolo,
    ticketsPorTelefone: indice.porTelefone,
    agentesSemVinculo: new Set(),
  };
}

export async function coletarDia(
  dia: string,
  opts: { sz: SessaoSz; ctx: ContextoColeta; prazoMs?: number; paginaInicial?: number; forcar?: boolean }
): Promise<ResultadoColetaDia> {
  const admin = criarClienteAdmin();
  const limite = opts.prazoMs ? Date.now() + opts.prazoMs : null;
  const res: ResultadoColetaDia = { dia, paginas: 0, listadas: 0, novas: 0, atualizadas: 0, puladas: 0, erros: 0, proximaPagina: opts.paginaInicial ?? 1 };
  let pagina = opts.paginaInicial ?? 1;
  while (true) {
    if (limite && Date.now() > limite) {
      res.proximaPagina = pagina;
      return res;
    }
    const lote = await listarEncerradasDoDia(opts.sz, dia, { paginaInicial: pagina, maxPaginas: 1 });
    res.paginas += lote.paginasLidas;
    res.listadas += lote.itens.length;
    if (lote.itens.length) {
      const ids = lote.itens.map((i) => String(i._id));
      const { data: existentes } = await admin
        .from("conversas_atendimento")
        .select("externo_id, finalizada_em, versao_calculo")
        .eq("provedor", "szchat")
        .in("externo_id", ids);
      const ja = new Map((existentes ?? []).map((e) => [String(e.externo_id), e]));
      for (const item of lote.itens) {
        const id = String(item._id);
        const anterior = ja.get(id);
        if (!opts.forcar && anterior && anterior.versao_calculo === VERSAO_CALCULO && anterior.finalizada_em) {
          res.puladas++;
          continue;
        }
        try {
          const brutas = await baixarMensagensSz(opts.sz, id, dia);
          const conversa = normalizarConversaSz(item, brutas, EQUIPES_COMERCIAIS);
          const calc = calcularConversa(conversa, opts.ctx.resolverVendedor, opts.ctx.cfg.expediente, opts.ctx.ehDiaUtil);
          await gravarConversa(admin, opts.ctx, conversa, calc);
          if (anterior) res.atualizadas++;
          else res.novas++;
        } catch (e) {
          res.erros++;
          res.ultimoErro = e instanceof Error ? e.message : String(e);
        }
      }
    }
    if (lote.proximaPagina === null) {
      res.proximaPagina = null;
      return res;
    }
    pagina = lote.proximaPagina;
  }
}

type EstadoColeta = { dia?: string; pagina?: number; ontemCompleto?: string; ultimaExecucao?: string; ultimoResultado?: unknown; agentesSemVinculo?: string[] };

/**
 * Rotina do cron: termina o dia anterior (se ficou pela metade) e lê o dia
 * de hoje desde o começo — conversas encerram ao longo do dia e a ordem das
 * páginas do relatório muda; as já coletadas são puladas sem baixar nada.
 */
export async function rodarColetaIncremental(prazoMs: number): Promise<ResultadoColetaDia[]> {
  const cfg = await carregarConfig();
  if (!cfg.modulo_ativo || !cfg.coleta.habilitada) return [];
  const sz = await abrirSessaoSz();
  if (!sz) throw new Error("credencial do robô SZ não configurada");
  const ctx = await montarContextoColeta();
  const estado = await lerEstado<EstadoColeta>("performance_estado_coleta");
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const ontem = new Date(Date.parse(`${hoje}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const limite = Date.now() + prazoMs;
  const resultados: ResultadoColetaDia[] = [];

  if (estado.ontemCompleto !== ontem) {
    const pagIni = estado.dia === ontem ? (estado.pagina ?? 1) : 1;
    const r = await coletarDia(ontem, { sz, ctx, prazoMs: Math.max(5_000, limite - Date.now()), paginaInicial: pagIni });
    resultados.push(r);
    estado.dia = ontem;
    estado.pagina = r.proximaPagina ?? 1;
    if (r.proximaPagina === null) estado.ontemCompleto = ontem;
  }
  if (Date.now() < limite - 10_000) {
    resultados.push(await coletarDia(hoje, { sz, ctx, prazoMs: limite - Date.now() }));
  }
  await gravarEstado("performance_estado_coleta", {
    ...estado,
    ultimaExecucao: new Date().toISOString(),
    ultimoResultado: resultados,
    agentesSemVinculo: [...ctx.agentesSemVinculo].slice(0, 30),
  });
  return resultados;
}
