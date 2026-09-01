import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { hojeIso, primeiroDiaDoMes, ultimoDiaDoMes } from "@/lib/datas";

/**
 * Equipe Técnica — produtividade e comissão por OS encerrada no SGP.
 *
 * Régua (gestor, 01/09/2026):
 *   - Ativação (Instalação de equipamento) e Mudança de Endereço:
 *       ATM R$ 30 · BN R$ 15 · VTX R$ 15 (por OS encerrada)
 *   - Suporte (Preventiva, Corretiva, Atendimento Fortics, LOS, Sem Acesso,
 *     Instalação de roteador adicional, Troca de equipamento, Mudança de
 *     Comodo): R$ 10 por OS — só para técnicos com recebe_suporte.
 *   - Auxiliar pontua igual ao responsável (cada técnico da OS recebe).
 *   - Retorno em <72h (ajuste do gestor, 01/09): nova OS do MESMO contrato
 *     criada em até 72h após o encerramento anula a comissão da OS de origem.
 */

export const VALOR_ATIVACAO: Record<string, number> = { atm: 30, bn: 15, vtx: 15 };
export const VALOR_SUPORTE = 10;

const MOTIVOS_ATIVACAO = ["instalação de equipamento", "instalacao de equipamento", "mudança endereço", "mudanca endereco", "mudança de endereço"];
const MOTIVOS_SUPORTE = [
  "preventiva", "corretiva", "atendimento fortics", "los", "sem acesso",
  "instalação de roteador adicional", "instalacao de roteador adicional",
  "troca de equipamento", "mudança de comodo", "mudanca de comodo",
];

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const ehAtivacao = (motivo: string | null) => {
  const m = norm(motivo);
  return MOTIVOS_ATIVACAO.some((x) => norm(x) === m || m.includes(norm(x)));
};
const ehSuporte = (motivo: string | null) => {
  const m = norm(motivo);
  return MOTIVOS_SUPORTE.some((x) => norm(x) === m || m === norm(x)) || MOTIVOS_SUPORTE.some((x) => m.includes(norm(x)));
};

export type OsLinha = {
  id: string;
  sgpOsId: string;
  sgpContratoId: string | null;
  cliente: string | null;
  pop: string | null;
  motivo: string | null;
  tipo: string | null;
  status: string | null;
  criadaEm: string | null;
  agendamento: string | null;
  checkin: string | null;
  encerradaEm: string | null;
  responsavel: string | null;
  auxiliares: string | null;
  categoria: "ativacao" | "suporte" | "outros";
  /** encerrada DENTRO da competência — só essa entra nas contagens/comissão */
  encerradaNoMes: boolean;
  /** OS que caracterizou o retorno (anula a comissão desta) */
  retornoOsId: string | null;
  valorPorTecnico: Record<string, number>; // técnico.id -> R$
};

export type ResultadoTecnico = {
  tecnicoId: string;
  nome: string;
  unidade: string;
  recebeSuporte: boolean;
  foto: string | null;
  ativacoes: number;
  suportes: number;
  outras: number;
  anuladasRetorno: number;
  /** R$ que os retornos <72h tiraram deste técnico no mês */
  valorAnuladoRetorno: number;
  comissao: number;
  /** ajuste manual da gestão aplicado à competência (substitui ou soma) */
  ajuste: { modo: "somar" | "substituir"; valor: number; motivo: string } | null;
  tempoMedioHoras: number | null; // agendamento -> encerramento
};

export type TecnicaMes = {
  competencia: string;
  tecnicos: ResultadoTecnico[];
  linhas: OsLinha[];
  totais: {
    encerradas: number;
    ativacoes: number;
    suportes: number;
    anuladasRetorno: number;
    comissao: number;
  };
};

/**
 * Técnicos que atuaram na OS: o responsável casa pelo nome exato do SGP
 * (nome_sgp); os auxiliares vêm CONCATENADOS sem separador — o match é por
 * substring do nome completo normalizado.
 */
function tecnicosDaOs(
  responsavel: string | null,
  auxiliares: string | null,
  cadastrados: { id: string; nomeSgp: string }[]
): string[] {
  const resp = norm(responsavel);
  const aux = norm(auxiliares);
  const ids: string[] = [];
  for (const t of cadastrados) {
    if (!t.nomeSgp) continue;
    if (resp === t.nomeSgp || resp.includes(t.nomeSgp) || aux.includes(t.nomeSgp)) ids.push(t.id);
  }
  return ids;
}

export async function tecnicaDoMes(mesIso?: string): Promise<TecnicaMes> {
  const admin = criarClienteAdmin();
  const mes = primeiroDiaDoMes(mesIso ?? hojeIso());
  const fim = `${ultimoDiaDoMes(mes)}T23:59:59-03:00`;

  // pontua pelo mês do ENCERRAMENTO (OS criada em julho e encerrada em agosto
  // paga em agosto); as criadas no mês entram para acompanhamento. O PostgREST
  // corta respostas em 1000 linhas — por isso a paginação por range.
  const os: Record<string, unknown>[] = [];
  for (let de = 0; de < 20_000; de += 1000) {
    const { data: pagina } = await admin
      .from("os_tecnicas")
      .select("*")
      .or(
        `and(encerrada_em.gte.${mes},encerrada_em.lte.${fim}),and(criada_em.gte.${mes},criada_em.lte.${fim})`
      )
      .order("criada_em", { ascending: false })
      .range(de, de + 999);
    os.push(...((pagina ?? []) as Record<string, unknown>[]));
    if (!pagina || pagina.length < 1000) break;
  }

  const [{ data: tecnicos }, { data: seguintes }, { data: ajustes }] = await Promise.all([
    admin.from("tecnicos").select("*").eq("ativo", true).order("nome"),
    // OS do início do mês seguinte: um encerramento no fim do mês pode ter
    // retorno já na virada (janela de 72h)
    admin
      .from("os_tecnicas")
      .select("sgp_os_id, sgp_contrato_id, criada_em")
      .gt("criada_em", fim)
      .limit(1000),
    admin.from("ajustes_tecnica").select("*").eq("competencia", mes),
  ]);

  const cad = (tecnicos ?? []).map((t) => ({
    id: t.id as string,
    nomeSgp: norm((t.nome_sgp as string | null) ?? (t.nome as string)),
  }));
  const porContrato = new Map<string, { sgp_os_id: string; criada_em: string }[]>();
  for (const o of [...(os ?? []), ...(seguintes ?? [])]) {
    const ct = (o.sgp_contrato_id as string | null) ?? "";
    if (!ct) continue;
    const lista = porContrato.get(ct) ?? [];
    lista.push({ sgp_os_id: o.sgp_os_id as string, criada_em: o.criada_em as string });
    porContrato.set(ct, lista);
  }

  const linhas: OsLinha[] = [];
  for (const o of os ?? []) {
    const categoria = ehAtivacao(o.motivo as string) ? "ativacao" : ehSuporte(o.motivo as string) ? "suporte" : "outros";
    const encerrada =
      norm(o.status as string) === "encerrada" &&
      o.encerrada_em &&
      (o.encerrada_em as string) >= mes &&
      (o.encerrada_em as string) <= fim;

    // retorno <72h: outra OS do mesmo contrato criada até 72h após o encerramento
    let retornoOsId: string | null = null;
    if (encerrada && o.sgp_contrato_id) {
      const enc = Date.parse(o.encerrada_em as string);
      for (const outra of porContrato.get(o.sgp_contrato_id as string) ?? []) {
        if (outra.sgp_os_id === o.sgp_os_id) continue;
        const dt = Date.parse(outra.criada_em) - enc;
        if (dt > 0 && dt <= 72 * 3600 * 1000) {
          retornoOsId = outra.sgp_os_id;
          break;
        }
      }
    }

    // quem pontua nesta OS: responsável + auxiliares cadastrados
    const idsOs = tecnicosDaOs(o.responsavel as string | null, o.auxiliares as string | null, cad);

    const valorPorTecnico: Record<string, number> = {};
    if (encerrada && !retornoOsId && categoria !== "outros") {
      for (const id of idsOs) {
        const t = (tecnicos ?? []).find((x) => x.id === id)!;
        if (categoria === "ativacao") valorPorTecnico[id] = VALOR_ATIVACAO[t.unidade as string] ?? 0;
        else if (categoria === "suporte" && t.recebe_suporte) valorPorTecnico[id] = VALOR_SUPORTE;
      }
    }

    linhas.push({
      id: o.id as string,
      sgpOsId: o.sgp_os_id as string,
      sgpContratoId: (o.sgp_contrato_id as string) ?? null,
      cliente: (o.cliente_nome as string) ?? null,
      pop: (o.pop as string) ?? null,
      motivo: (o.motivo as string) ?? null,
      tipo: (o.tipo as string) ?? null,
      status: (o.status as string) ?? null,
      criadaEm: (o.criada_em as string) ?? null,
      agendamento: (o.agendamento as string) ?? null,
      checkin: (o.checkin as string) ?? null,
      encerradaEm: (o.encerrada_em as string) ?? null,
      responsavel: (o.responsavel as string) ?? null,
      auxiliares: (o.auxiliares as string) ?? null,
      categoria,
      encerradaNoMes: Boolean(encerrada),
      retornoOsId,
      valorPorTecnico,
    });
  }

  const resultado: ResultadoTecnico[] = (tecnicos ?? []).map((t) => {
    const eu = cad.find((c) => c.id === t.id)!;
    const minhas = linhas.filter((l) => tecnicosDaOs(l.responsavel, l.auxiliares, [eu]).length > 0);
    const encerradas = minhas.filter((l) => l.encerradaNoMes);
    const ativacoes = encerradas.filter((l) => l.categoria === "ativacao" && !l.retornoOsId).length;
    const suportes = t.recebe_suporte
      ? encerradas.filter((l) => l.categoria === "suporte" && !l.retornoOsId).length
      : 0;
    const anuladasLinhas = encerradas.filter((l) => l.retornoOsId && l.categoria !== "outros");
    const anuladas = anuladasLinhas.length;
    // quanto os retornos custaram: o valor que a OS pagaria se não anulada
    const valorAnuladoRetorno = anuladasLinhas.reduce((s2, l) => {
      if (l.categoria === "ativacao") return s2 + (VALOR_ATIVACAO[t.unidade as string] ?? 0);
      if (l.categoria === "suporte" && t.recebe_suporte) return s2 + VALOR_SUPORTE;
      return s2;
    }, 0);
    const calculada = linhas.reduce((s2, l) => s2 + (l.valorPorTecnico[t.id as string] ?? 0), 0);
    const aj = (ajustes ?? []).find((a) => a.tecnico_id === t.id);
    const comissao = aj
      ? aj.modo === "substituir"
        ? Number(aj.valor)
        : calculada + Number(aj.valor)
      : calculada;
    const tempos = encerradas
      .filter((l) => l.agendamento && l.encerradaEm)
      .map((l) => (Date.parse(l.encerradaEm!) - Date.parse(l.agendamento!)) / 3_600_000)
      .filter((h) => h >= 0 && h < 24 * 14);
    return {
      tecnicoId: t.id as string,
      nome: t.nome as string,
      unidade: t.unidade as string,
      recebeSuporte: t.recebe_suporte as boolean,
      foto: (t.foto_url as string | null) ?? null,
      ativacoes,
      suportes,
      outras: encerradas.length - ativacoes - suportes - anuladas,
      anuladasRetorno: anuladas,
      valorAnuladoRetorno,
      comissao,
      ajuste: aj
        ? { modo: aj.modo as "somar" | "substituir", valor: Number(aj.valor), motivo: aj.motivo as string }
        : null,
      tempoMedioHoras: tempos.length ? tempos.reduce((s, h) => s + h, 0) / tempos.length : null,
    };
  });

  const encerradasTotal = linhas.filter((l) => l.encerradaNoMes);
  return {
    competencia: mes,
    tecnicos: resultado.sort((a, b) => b.comissao - a.comissao || a.nome.localeCompare(b.nome)),
    linhas,
    totais: {
      encerradas: encerradasTotal.length,
      ativacoes: encerradasTotal.filter((l) => l.categoria === "ativacao" && !l.retornoOsId).length,
      suportes: encerradasTotal.filter((l) => l.categoria === "suporte" && !l.retornoOsId).length,
      anuladasRetorno: encerradasTotal.filter((l) => l.retornoOsId && l.categoria !== "outros").length,
      comissao: resultado.reduce((s, t) => s + t.comissao, 0),
    },
  };
}
