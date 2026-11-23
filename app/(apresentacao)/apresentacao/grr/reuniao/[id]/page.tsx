import { notFound } from "next/navigation";
import { exigirModulo } from "@/lib/acessos-dados";
import { ApresentacaoEquipe } from "@/components/grr/apresentacao/equipe";
import { exigirPerfil } from "@/lib/auth";
import { paraPainel } from "@/lib/grr/painel";
import { compromissosParaConferir, participantesSugeridos, podeConduzir, type Compromisso } from "@/lib/grr/reunioes";
import { indicadoresDaReuniao, lerReuniao, type FotoDaReuniao } from "@/lib/grr/reunioes-dados";
import { rotuloSemana } from "@/lib/relatorio-semanal/periodo";
import { PERFIS_GRR } from "@/app/(app)/grr/carregar";

export const dynamic = "force-dynamic";

/**
 * Modo Apresentação da Reunião Semanal da Equipe Comercial. Abrir não grava
 * nada; incluir compromisso, conferir a situação e encerrar passam pelas
 * mesmas ações da página da reunião (perfil e recorte conferidos no servidor).
 */
export default async function ApresentacaoReuniaoPage({ params }: { params: { id: string } }) {
  const { usuario } = await exigirModulo("grr_comercial");
  const completa = await lerReuniao(params.id);
  if (!completa) notFound();
  const { reuniao: r, compromissos, daAnterior } = completa;
  const { dados, congelados, cadastro } = await indicadoresDaReuniao(r, usuario.id);
  const sugeridos = participantesSugeridos(r, cadastro);
  const foto = (r.dados as FotoDaReuniao | null) ?? null;
  const { tickets: _t, ...semTickets } = dados;
  void _t;
  const agentes = dados.porAgente.filter((l) => sugeridos.some((x) => x.id === l.id && x.papel === "agente"));
  const anteriores: Compromisso[] = compromissosParaConferir(r.situacao === "aberta" ? daAnterior : foto?.conferidos ?? daAnterior);

  return (
    <ApresentacaoEquipe
      reuniao={{
        id: r.id,
        escopoRotulo: r.escopo_rotulo,
        responsavel: r.responsavel_nome,
        data: r.data_reuniao,
        periodo: rotuloSemana({ inicio: r.periodo_inicio, fim: r.periodo_fim }),
        participantes: r.participantes,
        observacoes: r.observacoes,
        boasPraticas: r.boas_praticas,
        aberta: r.situacao === "aberta",
        encerradaEm: r.encerrada_em,
      }}
      dados={semTickets}
      congelados={congelados}
      agentes={agentes}
      cartoes={dados.cartoes.map((c) => paraPainel(c, dados))}
      compromissos={compromissos}
      anteriores={anteriores}
      pode={podeConduzir(usuario, r, cadastro)}
      hrefVoltar={`/grr/reunioes/${r.id}`}
    />
  );
}
