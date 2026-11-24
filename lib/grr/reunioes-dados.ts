import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hojeSantarem, mesDeReferencia } from "@/lib/relatorio-semanal/periodo";
import { aplicarConfig } from "./config";
import { lerConfigGrr } from "./config-dados";
import { carregarCadastroGrr, carregarGrrComercial } from "./dados";
import type { CadastroGrr } from "./escopo";
import { chaveDoEscopo, paraFoto } from "./fotos";
import type { DadosGrr } from "./montar";
import type { Perfil } from "@/lib/tipos";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { lerFoto } from "./fotos-dados";
import type { Panorama } from "./panorama";
import { carregarPanorama } from "./panorama-dados";
import { diagnosticosAtuais, type Diagnostico, type Plano } from "./planos";
import { diagnosticosDaSemana, listarPlanos } from "./planos-dados";
import type { RotinaLider } from "./rotinas";
import { escopoDaReuniao, lerAta, type AtaDiretoria, type Compromisso, type Participante, type ReuniaoGrr } from "./reunioes";
import { resolverSemana } from "./semana";

/**
 * Leitura das reuniões do GRR com a sessão de quem abre: a permissão por linha
 * do banco decide o que cada perfil vê (direção e administração tudo; a
 * coordenação só o próprio recorte; agentes nada, por enquanto).
 */

export type FotoDaReuniao = {
  indicadores: DadosGrr;
  participantes: Participante[];
  compromissos: Compromisso[];
  conferidos: Compromisso[];
  observacoes: string | null;
  boas_praticas: string | null;
};
export type Registro = { id: string; compromisso_id: string | null; tipo: "correcao" | "compromisso"; texto: string | null; dados: Record<string, unknown> | null; criado_em: string; criado_por: string | null };

const CAMPOS = "id, modalidade, escopo_tipo, escopo_ref, escopo_rotulo, responsavel_id, responsavel_nome, data_reuniao, periodo_inicio, periodo_fim, participantes, observacoes, boas_praticas, ata, situacao, corte_em, encerrada_em, encerrada_por, criada_em, criada_por";
const CAMPOS_COMPROMISSO = "id, reuniao_id, tipo, agente_id, responsavel_nome, descricao, prazo, situacao, aprovacao, conferido_em, criado_em";

export async function listarReunioes(): Promise<{ disponivel: boolean; reunioes: Omit<ReuniaoGrr, "dados">[] }> {
  // só as do comercial: a reunião operacional do setor técnico tem tela própria (/grr/tecnico/reunioes)
  const { data, error } = await criarClienteServidor().from("grr_reunioes").select(CAMPOS).eq("setor", "comercial").order("data_reuniao", { ascending: false }).order("criada_em", { ascending: false }).limit(60);
  if (error) return { disponivel: false, reunioes: [] };
  return { disponivel: true, reunioes: (data ?? []) as unknown as Omit<ReuniaoGrr, "dados">[] };
}

export type ReuniaoCompleta = {
  reuniao: ReuniaoGrr;
  compromissos: Compromisso[];
  anterior: Omit<ReuniaoGrr, "dados"> | null;
  /** compromissos da reunião anterior do mesmo recorte, para conferir */
  daAnterior: Compromisso[];
  registros: Registro[];
};

export async function lerReuniao(id: string): Promise<ReuniaoCompleta | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = criarClienteServidor();
  const { data } = await db.from("grr_reunioes").select(`${CAMPOS}, dados`).eq("id", id).maybeSingle();
  if (!data) return null;
  const reuniao = data as unknown as ReuniaoGrr;
  let anteriorQ = db
    .from("grr_reunioes")
    .select(CAMPOS)
    .eq("modalidade", reuniao.modalidade)
    .eq("escopo_tipo", reuniao.escopo_tipo)
    .neq("id", reuniao.id)
    .lt("data_reuniao", reuniao.data_reuniao)
    .order("data_reuniao", { ascending: false })
    .limit(1);
  anteriorQ = reuniao.escopo_ref ? anteriorQ.eq("escopo_ref", reuniao.escopo_ref) : anteriorQ.is("escopo_ref", null);
  const [{ data: compromissos }, { data: anteriores }, { data: registros }] = await Promise.all([
    db.from("grr_compromissos").select(CAMPOS_COMPROMISSO).eq("reuniao_id", id).order("criado_em"),
    anteriorQ,
    db.from("grr_reuniao_registros").select("id, compromisso_id, tipo, texto, dados, criado_em, criado_por").eq("reuniao_id", id).order("criado_em"),
  ]);
  const anterior = ((anteriores ?? [])[0] as unknown as Omit<ReuniaoGrr, "dados">) ?? null;
  const { data: daAnterior } = anterior ? await db.from("grr_compromissos").select(CAMPOS_COMPROMISSO).eq("reuniao_id", anterior.id).order("criado_em") : { data: [] };
  return {
    reuniao,
    compromissos: (compromissos ?? []) as Compromisso[],
    anterior,
    daAnterior: (daAnterior ?? []) as Compromisso[],
    registros: (registros ?? []) as Registro[],
  };
}

/**
 * Indicadores da reunião: encerrada → a foto guardada; aberta → os números de
 * agora do recorte e do período, com as metas e faixas vigentes.
 */
export async function indicadoresDaReuniao(
  r: ReuniaoGrr,
  usuarioId: string,
  cadastroPronto?: CadastroGrr
): Promise<{ dados: DadosGrr; congelados: boolean; cadastro: CadastroGrr }> {
  const semana = resolverSemana(r.periodo_inicio, hojeSantarem());
  const cadastro = cadastroPronto ?? (await carregarCadastroGrr(mesDeReferencia(semana).de));
  if (r.situacao === "encerrada" && r.dados) return { dados: (r.dados as FotoDaReuniao).indicadores, congelados: true, cadastro };
  const escopo = escopoDaReuniao(r, cadastro);
  const [dados, config] = await Promise.all([carregarGrrComercial(semana, escopo, cadastro), lerConfigGrr()]);
  return { dados: { ...dados, cartoes: aplicarConfig(dados.cartoes, config, chaveDoEscopo(escopo, usuarioId), semana.inicio) }, congelados: false, cadastro };
}

/** a foto que vai para a reunião no encerramento */
export function montarFotoDaReuniao(dados: DadosGrr, r: ReuniaoGrr, compromissos: Compromisso[], conferidos: Compromisso[]): FotoDaReuniao {
  return { indicadores: paraFoto(dados), participantes: r.participantes, compromissos, conferidos, observacoes: r.observacoes, boas_praticas: r.boas_praticas };
}

// ---------------------------------------------------------------------------
// reunião de resultados da diretoria (Etapa 4)
// ---------------------------------------------------------------------------

export type FotoReuniaoDiretoria = {
  indicadores: DadosGrr;
  /** versão da semana congelada usada (null: números de agora no encerramento) */
  fotoVersao: number | null;
  diagnosticos: Diagnostico[];
  planos: Plano[];
  participantes: Participante[];
  ata: AtaDiretoria;
  /** rotinas das lideranças da semana, guardadas no encerramento */
  rotinas?: RotinaLider[];
  /** projeção, histórico e pontos de atenção do mês (reuniões encerradas antes de 24/11/2026 não têm) */
  panorama?: Panorama | null;
};

/** quem pode participar: diretoria e coordenação ativas */
export async function participantesPossiveisDiretoria(): Promise<{ id: string; nome: string; perfil: "gestor" | "direcao" | "supervisor" }[]> {
  const { data } = await criarClienteAdmin().from("usuarios").select("id, nome, perfil").eq("ativo", true).in("perfil", ["gestor", "direcao", "supervisor"]).order("nome");
  return (data ?? []) as { id: string; nome: string; perfil: "gestor" | "direcao" | "supervisor" }[];
}

/**
 * O que a pauta mostra: na reunião encerrada, a foto guardada; na aberta, a
 * semana congelada (se houver) ou os números de agora, com os diagnósticos da
 * semana e os planos visíveis.
 */
export async function pautaDaReuniao(r: ReuniaoGrr, usuarioId: string, comPanorama = true): Promise<FotoReuniaoDiretoria & { congelados: boolean; cadastro: CadastroGrr }> {
  const hoje = hojeSantarem();
  const semana = resolverSemana(r.periodo_inicio, hoje);
  const cadastro = await carregarCadastroGrr(mesDeReferencia(semana).de);
  if (r.situacao === "encerrada" && r.dados) {
    const f = r.dados as FotoReuniaoDiretoria;
    return { ...f, ata: lerAta(f.ata), congelados: true, cadastro };
  }
  const escopo = escopoDaReuniao(r, cadastro);
  const chave = chaveDoEscopo(escopo, usuarioId);
  const [config, diagnosticos, planos, panorama] = await Promise.all([
    lerConfigGrr(),
    diagnosticosDaSemana(semana.inicio),
    listarPlanos(),
    comPanorama ? panoramaDaReuniao(r, "gestor", cadastro) : null,
  ]);
  const foto = config.disponivel && semana.fim < hoje ? await lerFoto(semana, chave) : null;
  const indicadores = foto
    ? foto.dados
    : await carregarGrrComercial(semana, escopo, cadastro).then((d) => ({ ...d, cartoes: aplicarConfig(d.cartoes, config, chave, semana.inicio) }));
  return {
    indicadores,
    fotoVersao: foto?.versao ?? null,
    diagnosticos: diagnosticosAtuais(diagnosticos.lista),
    planos: planos.planos.filter((p) => p.aprovacao !== "rejeitado"),
    participantes: r.participantes,
    ata: lerAta(r.ata),
    panorama,
    congelados: false,
    cadastro,
  };
}

/**
 * Panorama do mês: na reunião encerrada, o guardado; na aberta, os números de
 * agora (projeção só serve atualizada) do mês em que a semana termina. Só a
 * diretoria lê todas as vendas (permissão por linha): para a coordenação, com
 * recorte parcial, as contas sairiam erradas, então só vê depois do encerramento.
 */
export async function panoramaDaReuniao(r: ReuniaoGrr, perfil: Perfil, cadastroPronto?: CadastroGrr): Promise<Panorama | null> {
  if (r.situacao === "encerrada") return (r.dados as FotoReuniaoDiretoria | null)?.panorama ?? null;
  if (perfil !== "gestor" && perfil !== "direcao") return null;
  const hoje = hojeSantarem();
  const mes = r.periodo_fim <= hoje ? r.periodo_fim.slice(0, 7) : hoje.slice(0, 7);
  const cadastro = cadastroPronto ?? (await carregarCadastroGrr(`${mes}-01`));
  return carregarPanorama(mes, r.escopo_tipo === "unidade" ? r.escopo_ref : null, cadastro);
}

/** leitura sem sessão, para a página de impressão do PDF (o link é assinado) */
export async function lerReuniaoParaImpressao(id: string): Promise<ReuniaoGrr | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await criarClienteAdmin().from("grr_reunioes").select(`${CAMPOS}, dados`).eq("id", id).maybeSingle();
  return (data as unknown as ReuniaoGrr) ?? null;
}

export async function correcoesParaImpressao(id: string): Promise<Registro[]> {
  const { data } = await criarClienteAdmin().from("grr_reuniao_registros").select("id, compromisso_id, tipo, texto, dados, criado_em, criado_por").eq("reuniao_id", id).eq("tipo", "correcao").order("criado_em");
  return (data ?? []) as Registro[];
}
