import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { hojeSantarem, rotuloSemana } from "@/lib/relatorio-semanal/periodo";
import { resolverSemana, semanasVizinhas, type SemanaGrr } from "../semana";
import { expedienteDaSemana, lerBaseTecnico, lerMetasTecnico, recortesTecnico } from "./dados";
import { lerFotoTecnico, type FotoTecnico } from "./fotos";
import { montarTecnico, type CartaoTecnico, type LinhaAgendaTecnico, type RecorteTecnico } from "./regras";

/** perfis que veem o GRR Técnico (decisão 21/11/2026) */
export const PERFIS_GRR_TECNICO = ["gestor", "direcao", "gestor_tecnico"] as const;

export type TelaTecnico = {
  hoje: string;
  semana: SemanaGrr;
  rotuloDaSemana: string;
  emAndamento: boolean;
  vizinhas: { anterior: string | null; proxima: string | null };
  recortes: RecorteTecnico[];
  recorte: RecorteTecnico;
  /** cartões de cada recorte (empresa primeiro), da foto quando a semana está congelada */
  porRecorte: { recorte: RecorteTecnico; cartoes: CartaoTecnico[]; porTecnico: LinhaAgendaTecnico[] }[];
  cartoes: CartaoTecnico[];
  /** agenda por técnico do recorte escolhido (fotos antigas não têm: lista vazia) */
  porTecnico: LinhaAgendaTecnico[];
  foto: Pick<FotoTecnico, "versao" | "origem" | "congelado_em"> | null;
  metasDisponiveis: boolean;
};

/**
 * Carrega a tela (e a apresentação) do GRR Técnico: semana pedida, recorte
 * (empresa ou unidade) e os cartões. Semana congelada usa a foto; as demais
 * são calculadas na hora, sem gravar nada.
 */
export async function carregarTelaTecnico(params: { semana?: string; unidade?: string }): Promise<TelaTecnico> {
  const hoje = hojeSantarem();
  const semana = resolverSemana(params.semana, hoje);
  const admin = criarClienteAdmin();
  const recortes = await recortesTecnico(admin);
  const recorte = recortes.find((r) => r.unidade === params.unidade) ?? recortes[0];

  const fotos = await Promise.all(recortes.map((r) => lerFotoTecnico(semana, r, admin)));
  let porRecorte: TelaTecnico["porRecorte"];
  let foto: TelaTecnico["foto"] = null;
  let emAndamento = semana.fim > hoje;
  let metasDisponiveis = true;
  if (fotos[0]) {
    porRecorte = recortes.map((r, i) => ({ recorte: r, cartoes: fotos[i]?.dados.cartoes ?? [], porTecnico: fotos[i]?.dados.porTecnico ?? [] }));
    foto = { versao: fotos[0].versao, origem: fotos[0].origem, congelado_em: fotos[0].congelado_em };
    emAndamento = false;
  } else {
    const [base, metas, expediente] = await Promise.all([lerBaseTecnico(semana, hoje, admin), lerMetasTecnico(admin), expedienteDaSemana(semana, hoje)]);
    metasDisponiveis = metas.disponivel && metas.metas.length > 0;
    porRecorte = recortes.map((r) => {
      const m = montarTecnico({ base, semana, hoje, recorte: r, metas: metas.metas, expediente });
      return { recorte: r, cartoes: m.cartoes, porTecnico: m.porTecnico };
    });
  }
  return {
    hoje,
    semana,
    rotuloDaSemana: rotuloSemana(semana),
    emAndamento,
    vizinhas: semanasVizinhas(semana, hoje),
    recortes,
    recorte,
    porRecorte,
    cartoes: porRecorte.find((x) => x.recorte === recorte)?.cartoes ?? [],
    porTecnico: porRecorte.find((x) => x.recorte === recorte)?.porTecnico ?? [],
    foto,
    metasDisponiveis,
  };
}
