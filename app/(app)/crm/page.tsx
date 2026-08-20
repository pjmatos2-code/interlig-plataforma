import { exigirUsuario } from "@/lib/auth";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EmConstrucao } from "@/components/layout/em-construcao";

export const dynamic = "force-dynamic";

export default async function CrmPage() {
  const usuario = await exigirUsuario();

  return (
    <>
      <CabecalhoPagina
        titulo="CRM comercial"
        descricao={
          usuario.perfil === "vendedora"
            ? "Suas negociações em andamento."
            : "Pipeline de negociações e reconciliação com o SGP."
        }
        referencia="PRD 3.9"
      />
      <EmConstrucao
        fase="Fase 2"
        entrega={[
          "Kanban novo → em atendimento → proposta → aguardando → fechado",
          "Criação manual de ticket e, na Fase 3, criação automática pelo SZ Chat",
          "Fechamento obrigatório com desfecho e motivo de não conversão",
          "Fechamento automático por inatividade e follow-up agendado",
          "Reconciliação ticket ↔ contrato do SGP e conversão real (regras 5.14 a 5.17)",
        ]}
      />
      <p className="mt-4 text-xs text-muted-foreground">
        As regras inegociáveis já estão no banco: ticket não pode ser excluído, só fecha com
        desfecho, convertido exige plano e origem, e toda mudança gera evento em{" "}
        <code>ticket_eventos</code>.
      </p>
    </>
  );
}
