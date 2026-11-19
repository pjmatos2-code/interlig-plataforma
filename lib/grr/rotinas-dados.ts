import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { todas } from "@/lib/supabase/paginar";
import { foraDaConversao } from "@/lib/indicadores/crm";
import { hojeSantarem, mesDeReferencia, type Semana } from "@/lib/relatorio-semanal/periodo";
import { aplicarConfig } from "./config";
import { lerConfigGrr } from "./config-dados";
import { carregarCadastroGrr, lerBaseGrr } from "./dados";
import { resolverEscopo } from "./escopo";
import { montarGrr, type CartaoGrr, type DadosGrr } from "./montar";
import { avaliarCoordenacao, avaliarDiretoria, fimDoDia, resumir, situacaoEm, type Pendencia, type RotinaLider } from "./rotinas";
import { lerAta } from "./reunioes";

/**
 * Dados das rotinas das lideranças: leitura com o cliente de serviço e
 * recorte feito aqui (a tela confere o perfil; a coordenação recebe só a
 * própria linha). Os números da semana vêm da foto congelada da equipe; sem
 * foto, a semana escolhida e a atual são montadas na hora.
 */

type Evento = { acao_id: string; tipo: string; dados: Record<string, unknown> | null; criado_em: string };
type PlanoBruto = { id: string; descricao: string; escopo_tipo: string; escopo_ref: string | null; prazo: string | null; situacao: string; aprovacao: string; aprovacao_em: string | null; criado_em: string };
type TicketLead = { vendedor_id: string | null; criado_em: string; primeira_tratativa_em: string | null; origem_criacao: string; etapa: string; desfecho: string | null; motivos_nao_conversao: { nome: string } | null };

const inicioIso = (dia: string) => new Date(Date.parse(`${dia}T00:00:00-03:00`)).toISOString();

export type RotinasDaSemana = { semana: Semana; lideres: RotinaLider[] };

export async function carregarRotinas(semanas: Semana[], usuario: { id: string; perfil: string }, semanaAoVivo: Semana): Promise<RotinasDaSemana[]> {
  const admin = criarClienteAdmin();
  const hoje = hojeSantarem();
  const agora = new Date().toISOString();
  const de = semanas.map((s) => s.inicio).sort()[0];
  const ate = semanas.map((s) => s.fim).sort().at(-1)!;
  const cadastro = await carregarCadastroGrr(mesDeReferencia(semanaAoVivo).de);
  const coordenadores = usuario.perfil === "supervisor" ? cadastro.equipes.filter((e) => e.coordenadorId === usuario.id) : cadastro.equipes;
  const verDiretoria = usuario.perfil === "gestor" || usuario.perfil === "direcao";

  const [leads, diagnosticos, reunioes, planos, eventos, compromissos, registros, fotos, config] = await Promise.all([
    todas<TicketLead>((a, b) =>
      admin
        .from("tickets")
        .select("vendedor_id, criado_em, primeira_tratativa_em, origem_criacao, etapa, desfecho, motivos_nao_conversao(nome)")
        .gte("criado_em", inicioIso(de))
        .lte("criado_em", fimDoDia(ate))
        .order("criado_em")
        .order("id")
        .range(a, b)
    ),
    admin.from("grr_diagnosticos").select("indicador, escopo_tipo, escopo_ref, periodo_inicio, criado_em").gte("periodo_inicio", de).lte("periodo_inicio", ate),
    admin.from("grr_reunioes").select("id, modalidade, escopo_tipo, escopo_ref, data_reuniao, periodo_inicio, situacao, ata").gte("data_reuniao", de).lte("data_reuniao", ate),
    admin.from("grr_acoes").select("id, descricao, escopo_tipo, escopo_ref, prazo, situacao, aprovacao, aprovacao_em, criado_em"),
    admin.from("grr_acao_eventos").select("acao_id, tipo, dados, criado_em").order("criado_em"),
    admin.from("grr_compromissos").select("id, reuniao_id, tipo, descricao, criado_em"),
    admin.from("grr_reuniao_registros").select("compromisso_id, tipo, dados, criado_em").eq("tipo", "compromisso"),
    admin
      .from("grr_fotos")
      .select("periodo_inicio, escopo_ref, versao, dados")
      .eq("periodo_tipo", "semana")
      .eq("escopo_tipo", "equipe")
      .in("periodo_inicio", semanas.map((s) => s.inicio))
      .order("versao", { ascending: false }),
    lerConfigGrr(admin),
  ]);

  const eventosDe = new Map<string, Evento[]>();
  for (const e of (eventos.data ?? []) as Evento[]) eventosDe.set(e.acao_id, [...(eventosDe.get(e.acao_id) ?? []), e]);
  const fotoDe = new Map<string, DadosGrr>();
  for (const f of (fotos.data ?? []) as { periodo_inicio: string; escopo_ref: string; dados: DadosGrr }[]) {
    const k = `${f.periodo_inicio}|${f.escopo_ref}`;
    if (!fotoDe.has(k)) fotoDe.set(k, f.dados);
  }

  // números de agora: só para a semana escolhida e a atual, quando não há foto
  const aoVivo = new Map<string, Map<string, DadosGrr>>();
  const montarAoVivo = async (s: Semana) => {
    if (aoVivo.has(s.inicio)) return aoVivo.get(s.inicio)!;
    const { base, ehExpediente } = await lerBaseGrr(s, admin);
    const porEquipe = new Map<string, DadosGrr>();
    for (const e of coordenadores) {
      const escopo = resolverEscopo({ perfil: "direcao", pop_id: null }, null, { equipe: e.coordenadorId }, cadastro);
      const d = montarGrr(base, s, escopo, cadastro, ehExpediente, hoje);
      porEquipe.set(e.coordenadorId, { ...d, cartoes: aplicarConfig(d.cartoes, config, { tipo: "equipe", ref: e.coordenadorId }, s.inicio) });
    }
    aoVivo.set(s.inicio, porEquipe);
    return porEquipe;
  };
  const atual = semanas.find((s) => s.inicio <= hoje && s.fim >= hoje) ?? null;
  for (const s of [semanaAoVivo, ...(atual ? [atual] : [])]) {
    if (coordenadores.some((e) => !fotoDe.has(`${s.inicio}|${e.coordenadorId}`))) await montarAoVivo(s);
  }

  const leadsValidos = leads.filter((t) => t.origem_criacao !== "sgp_auto" && !foraDaConversao(t as never));
  const doTime = (ids: Set<string>, coord: string) => (x: { escopo_tipo: string; escopo_ref: string | null }) =>
    (x.escopo_tipo === "equipe" && x.escopo_ref === coord) || (x.escopo_tipo === "agente" && !!x.escopo_ref && ids.has(x.escopo_ref));

  return semanas.map((s) => {
    const fimSemana = fimDoDia(s.fim);
    const inicioSemana = inicioIso(s.inicio);
    const naSemana = (iso: string) => iso >= inicioSemana && iso <= fimSemana;
    const lideres: RotinaLider[] = [];

    for (const e of coordenadores) {
      const ids = new Set(e.vendedorIds);
      const filtro = doTime(ids, e.coordenadorId);
      const dados = fotoDe.get(`${s.inicio}|${e.coordenadorId}`) ?? aoVivo.get(s.inicio)?.get(e.coordenadorId) ?? null;
      const ehAtual = atual?.inicio === s.inicio;
      const reuniao = ((reunioes.data ?? []) as { id: string; modalidade: string; escopo_tipo: string; escopo_ref: string | null; data_reuniao: string; periodo_inicio: string; situacao: "aberta" | "encerrada" }[])
        .filter((r) => r.modalidade === "equipe" && r.escopo_tipo === "equipe" && r.escopo_ref === e.coordenadorId && r.data_reuniao >= s.inicio && r.data_reuniao <= s.fim)
        .sort((a, b) => (a.situacao === "encerrada" ? -1 : 1) - (b.situacao === "encerrada" ? -1 : 1))[0];
      const planosDoTime = ((planos.data ?? []) as PlanoBruto[])
        .filter(filtro)
        .filter((p) => p.aprovacao === "aprovado" && !!p.aprovacao_em && p.aprovacao_em <= fimSemana)
        .map((p) => {
          const ev = eventosDe.get(p.id) ?? [];
          return { p, ev, noInicio: situacaoEm(ev, inicioSemana), noFim: situacaoEm(ev, fimSemana) };
        })
        .filter((x) => x.noInicio !== "concluida" && x.noInicio !== "cancelada");
      const itens = avaliarCoordenacao({
        semana: s,
        agora,
        leads: leadsValidos.filter((t) => t.vendedor_id && ids.has(t.vendedor_id) && naSemana(t.criado_em)),
        followupsVencidosAgora: ehAtual ? aoVivo.get(s.inicio)?.get(e.coordenadorId)?.perdas.retornosVencidos ?? null : null,
        desvios: dados ? dados.cartoes.filter((c: CartaoGrr) => c.status === "atencao" || c.status === "critico").map((c) => ({ chave: c.chave, rotulo: c.rotulo })) : null,
        diagnosticos: ((diagnosticos.data ?? []) as { indicador: string; escopo_tipo: string; escopo_ref: string | null; periodo_inicio: string; criado_em: string }[]).filter((d) => d.periodo_inicio === s.inicio && filtro(d)),
        reuniao: reuniao ? { situacao: reuniao.situacao, data: reuniao.data_reuniao, compromissos: ((compromissos.data ?? []) as { reuniao_id: string }[]).filter((c) => c.reuniao_id === reuniao.id).length } : null,
        planos: planosDoTime.map((x) => ({ descricao: x.p.descricao, prazo: x.p.prazo, situacaoNoFim: x.noFim, atualizadoNaSemana: x.ev.some((ev) => naSemana(ev.criado_em) && ev.tipo !== "aprovacao") })),
      });
      lideres.push({ liderId: e.coordenadorId, nome: e.nome, papel: "coordenacao", itens, ...resumir(itens) });
    }

    if (verDiretoria) {
      const reuniao = ((reunioes.data ?? []) as { modalidade: string; data_reuniao: string; situacao: "aberta" | "encerrada"; ata: unknown }[])
        .filter((r) => r.modalidade === "diretoria" && r.data_reuniao >= s.inicio && r.data_reuniao <= s.fim)
        .sort((a, b) => (a.situacao === "encerrada" ? -1 : 1) - (b.situacao === "encerrada" ? -1 : 1))[0];
      const aprovacoes: Pendencia[] = [];
      const validacoes: Pendencia[] = [];
      for (const p of (planos.data ?? []) as PlanoBruto[]) {
        const ev = (eventosDe.get(p.id) ?? []).slice().sort((a, b) => a.criado_em.localeCompare(b.criado_em));
        const decidido = (desde: string) =>
          ev.find((x) => x.tipo === "aprovacao" && x.criado_em > desde && ["aprovado", "ajuste", "rejeitado"].includes(String(x.dados?.depois)))?.criado_em ?? null;
        const inicios = [p.criado_em, ...ev.filter((x) => x.tipo === "aprovacao" && x.dados?.depois === "aguardando").map((x) => x.criado_em)];
        for (const desde of inicios.filter(naSemana)) aprovacoes.push({ descricao: p.descricao, desde, resolvidoEm: decidido(desde) });
        for (const x of ev.filter((x) => x.tipo === "situacao" && x.dados?.depois === "aguardando_validacao" && naSemana(x.criado_em))) {
          validacoes.push({ descricao: p.descricao, desde: x.criado_em, resolvidoEm: ev.find((y) => y.tipo === "situacao" && y.criado_em > x.criado_em)?.criado_em ?? null });
        }
      }
      for (const c of ((compromissos.data ?? []) as { id: string; tipo: string; descricao: string; criado_em: string }[]).filter((c) => c.tipo === "gerencial" && naSemana(c.criado_em))) {
        const decisao = ((registros.data ?? []) as { compromisso_id: string | null; dados: Record<string, unknown> | null; criado_em: string }[]).find(
          (r) => r.compromisso_id === c.id && ["aprovado", "ajuste", "rejeitado"].includes(String(r.dados?.aprovacao)) && r.dados?.aprovacao !== r.dados?.aprovacao_antes
        );
        aprovacoes.push({ descricao: c.descricao, desde: c.criado_em, resolvidoEm: decisao?.criado_em ?? null });
      }
      const itens = avaliarDiretoria({
        semana: s,
        agora,
        reuniao: reuniao ? { situacao: reuniao.situacao, data: reuniao.data_reuniao, decisoes: lerAta(reuniao.ata).decisoes.length } : null,
        aprovacoes,
        validacoes,
      });
      lideres.unshift({ liderId: "diretoria", nome: "Diretoria", papel: "diretoria", itens, ...resumir(itens) });
    }
    return { semana: s, lideres };
  });
}

