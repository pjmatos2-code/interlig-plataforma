import { Suspense } from "react";
import { dadosOperacao } from "@/lib/operacao/dados";
import { DIAS_QUADRO } from "@/lib/operacao/regras";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { AbasOperacao } from "./abas";
import { QuadroOperacao } from "./quadro";

/** enquanto o espelho do SGP é lido (o acesso já foi conferido pela página) */
function Carregando() {
  return (
    <div className="animate-pulse space-y-4" role="status" aria-label="Carregando a Operação Técnica">
      <div className="h-12 w-72 rounded-xl bg-muted" />
      <div className="h-11 w-full max-w-2xl rounded-xl bg-muted" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-muted" />
    </div>
  );
}

async function Leitura({ unidade, visao }: { unidade: string | null; visao: "geral" | "quadro" }) {
  const [todos, linkTemplate] = await Promise.all([dadosOperacao(), templateLinkSgp()]);
  // quem fica preso a uma unidade vê só ela
  const dados = unidade ? { ...todos, cartoes: todos.cartoes.filter((c) => c.unidade === unidade), historico: todos.historico.filter((c) => c.unidade === unidade) } : todos;
  return (
    <QuadroOperacao
      dados={dados}
      linkTemplate={linkTemplate}
      agora={Date.now()}
      unidadeFixa={unidade}
      visao={visao}
      titulo="Operação Técnica"
      descricao={`Ocorrências de instalação, mudança de endereço e suporte abertas nos últimos ${DIAS_QUADRO} dias, lidas do SGP.`}
      abas={<AbasOperacao ativa={visao} />}
    />
  );
}

/** Visão Geral e Quadro: a mesma leitura e a mesma tela, com ou sem os gráficos. */
export function ConteudoOperacao(p: { unidade: string | null; visao: "geral" | "quadro" }) {
  return (
    <Suspense fallback={<Carregando />}>
      <Leitura {...p} />
    </Suspense>
  );
}
