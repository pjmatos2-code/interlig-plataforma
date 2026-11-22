/**
 * Conferência dos dados do GRR Técnico (Etapa 2, 21/11/2026): o que pode deixar
 * um número errado ou incompleto, com o que fazer. Função pura; a leitura está
 * em lib/grr/tecnico/conferencia-dados.ts.
 */

export type NivelConferencia = "ok" | "atencao" | "problema";
export type ItemConferencia = { chave: string; titulo: string; nivel: NivelConferencia; detalhe: string; acao: string | null };

export type MedidasConferencia = {
  agora: number;
  noExpediente: boolean;
  ultimaLeituraOperacao: string | null;
  ultimaLeituraOperacaoOk: boolean | null;
  direcionamentoPendentes: number;
  ativadasSemana: number;
  ativadasSemHora: number;
  osEncerradas7d: number;
  osSemTecnico7d: number;
  ativadasDesde21SemHora: number;
  ativadasDesde21: number;
  indicadoresComMeta: number;
  totalIndicadores: number;
  fotoUltimaSemana: boolean;
  semanaUltima: string;
  segundaJaPassouDas7: boolean;
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);
const minutosDesde = (iso: string | null, agora: number) => (iso ? Math.round((agora - Date.parse(iso)) / 60_000) : null);

export function conferirTecnico(m: MedidasConferencia): ItemConferencia[] {
  const itens: ItemConferencia[] = [];
  const min = minutosDesde(m.ultimaLeituraOperacao, m.agora);
  const limite = m.noExpediente ? 45 : 150;
  itens.push({
    chave: "leitura",
    titulo: "Leitura do SGP (OS e ocorrências)",
    nivel: min == null || m.ultimaLeituraOperacaoOk === false ? "problema" : min > limite ? "atencao" : "ok",
    detalhe: min == null ? "Nenhuma leitura registrada." : `Última leitura há ${min} min${m.ultimaLeituraOperacaoOk === false ? ", com erro" : ""}. Roda a cada ~15 min no expediente e de hora em hora fora dele.`,
    acao: min == null || min > limite || m.ultimaLeituraOperacaoOk === false ? "Use “Atualizar agora” no quadro da Operação Técnica; se persistir, avise a administração." : null,
  });
  itens.push({
    chave: "direcionamento",
    titulo: "Hora do direcionamento ao gestor (instalações do mês)",
    nivel: m.direcionamentoPendentes > 60 ? "atencao" : "ok",
    detalhe: m.direcionamentoPendentes ? `${m.direcionamentoPendentes} ocorrência(s) de instalação com responsável ainda sem a hora lida. A leitura abre 30 por vez.` : "Todas as instalações do mês com responsável já têm a hora do direcionamento.",
    acao: null,
  });
  const p = pct(m.ativadasSemHora, m.ativadasSemana);
  itens.push({
    chave: "cobertura_48h",
    titulo: "Instalações da semana fora da conta das 48 h",
    nivel: m.ativadasSemana && p > 30 ? "atencao" : "ok",
    detalhe: m.ativadasSemana ? `${m.ativadasSemHora} de ${m.ativadasSemana} instalações ativadas na semana (${p}%) sem a hora do direcionamento: ficam fora da taxa.` : "Nenhuma instalação ativada na semana.",
    acao: m.ativadasSemana && p > 30 ? "Normal enquanto a leitura de novembro termina. Se continuar alto, confira se a ocorrência de instalação está indo para o gestor técnico no SGP." : null,
  });
  const q = pct(m.osSemTecnico7d, m.osEncerradas7d);
  itens.push({
    chave: "tecnico",
    titulo: "OS encerradas sem técnico responsável (7 dias)",
    nivel: q > 25 ? "problema" : q > 10 ? "atencao" : "ok",
    detalhe: `${m.osSemTecnico7d} de ${m.osEncerradas7d} OS de campo (${q}%) sem técnico responsável no SGP.`,
    acao: q > 10 ? "Preencher o técnico responsável ao fechar a OS no SGP. Sem isso, o recorte por técnico (Fase 2) não fecha." : null,
  });
  itens.push({
    chave: "hora_ativacao",
    titulo: "Hora da ativação (desde 21/11)",
    nivel: m.ativadasDesde21SemHora > 0 ? "atencao" : "ok",
    detalhe: m.ativadasDesde21 ? `${m.ativadasDesde21 - m.ativadasDesde21SemHora} de ${m.ativadasDesde21} contratos ativados desde 21/11 com a hora gravada.` : "Nenhum contrato ativado desde 21/11 ainda.",
    acao: m.ativadasDesde21SemHora > 0 ? "Contratos que já entram ativos no cadastro não têm a passagem de inativo para ativo: a conta usa o dia." : null,
  });
  itens.push({
    chave: "metas",
    titulo: "Metas cadastradas",
    nivel: m.indicadoresComMeta === m.totalIndicadores ? "ok" : "atencao",
    detalhe: `${m.indicadoresComMeta} de ${m.totalIndicadores} indicadores com meta da empresa vigente.`,
    acao: m.indicadoresComMeta === m.totalIndicadores ? null : "Inclua as metas em GRR Técnico › Metas.",
  });
  itens.push({
    chave: "fechamento",
    titulo: "Fechamento da última semana",
    nivel: m.fotoUltimaSemana ? "ok" : m.segundaJaPassouDas7 ? "problema" : "ok",
    detalhe: m.fotoUltimaSemana ? `A semana de ${m.semanaUltima} está congelada.` : m.segundaJaPassouDas7 ? `A semana de ${m.semanaUltima} ainda não foi congelada.` : `A semana de ${m.semanaUltima} será congelada na segunda às 07:00.`,
    acao: !m.fotoUltimaSemana && m.segundaJaPassouDas7 ? "O fechamento automático pode ter falhado: avise a administração." : null,
  });
  return itens;
}
