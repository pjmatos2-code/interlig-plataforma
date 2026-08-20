import { exigirUsuario } from "@/lib/auth";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EmConstrucao } from "@/components/layout/em-construcao";

export const dynamic = "force-dynamic";

export default async function MetasPage() {
  const usuario = await exigirUsuario();

  return (
    <>
      <CabecalhoPagina
        titulo="Metas e comissão"
        descricao={
          usuario.perfil === "gestor"
            ? "Cadastro de metas e regras de comissão com vigência."
            : "Sua meta do mês e a simulação de comissão."
        }
        referencia="PRD 3.7 e seção 6"
      />
      <EmConstrucao
        fase="Fase 1 (metas) e Fase 3 (comissão)"
        entrega={[
          "Cadastro de meta mensal por vendedora, por POP e global — diária e semanal são derivadas",
          "Projeção de atingimento com faróis: verde ≥ 100%, amarelo 85–99%, vermelho < 85% (regra 5.6)",
          "Regras de comissão por degraus, com gatilhos extras e estorno por cancelamento",
          "Simulador: quanto ganho se vender mais N — e fechamento com snapshot imutável",
        ]}
      />
      <p className="mt-4 text-xs text-muted-foreground">
        O seed já traz as metas do mês vigente e uma regra de comissão de exemplo com 3 degraus.
      </p>
    </>
  );
}
