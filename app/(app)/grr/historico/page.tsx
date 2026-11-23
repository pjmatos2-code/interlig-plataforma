import Link from "next/link";
import { exigirModulo } from "@/lib/acessos-dados";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { AreasGrr } from "@/components/grr/areas";
import { Badge } from "@/components/ui/badge";
import { exigirPerfil } from "@/lib/auth";
import { carregarCadastroGrr } from "@/lib/grr/dados";
import { resolverEscopo } from "@/lib/grr/escopo";
import { chaveDoEscopo } from "@/lib/grr/fotos";
import { listarFotos } from "@/lib/grr/fotos-dados";
import { semanaAtual } from "@/lib/grr/semana";
import { hojeSantarem, mesDeReferencia, rotuloSemana } from "@/lib/relatorio-semanal/periodo";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { PERFIS_GRR } from "../carregar";

export const dynamic = "force-dynamic";

const ROTULO_ORIGEM = { manual: "pelo painel", rotina: "automaticamente, no fechamento de segunda", reuniao: "no fechamento da reunião" } as const;
const dataHora = (iso: string) => {
  const d = new Date(Date.parse(iso) - 3 * 3600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} às ${d.slice(11, 16)}`;
};

/** Histórico do GRR: as semanas congeladas no recorte de quem abre, com as versões e os motivos. */
export default async function GrrHistoricoPage() {
  const { usuario } = await exigirModulo("grr_comercial");
  const cadastro = await carregarCadastroGrr(mesDeReferencia(semanaAtual(hojeSantarem())).de);
  const time = usuario.perfil === "supervisor" ? cadastro.equipes.find((e) => e.coordenadorId === usuario.id)?.vendedorIds ?? null : null;
  const escopo = resolverEscopo(usuario, time, {}, cadastro);
  const { disponivel, fotos } = await listarFotos(chaveDoEscopo(escopo, usuario.id));
  const autores = [...new Set(fotos.map((f) => f.congelado_por).filter((x): x is string => !!x))];
  const { data: usuarios } = autores.length ? await criarClienteAdmin().from("usuarios").select("id, nome").in("id", autores) : { data: [] };
  const nomeDe = new Map((usuarios ?? []).map((u) => [u.id as string, String(u.nome)]));
  const semanas = [...new Set(fotos.map((f) => f.periodo_inicio))];

  return (
    <div>
      <CabecalhoPagina titulo="Histórico do GRR" descricao={`Comercial · ${escopo.rotulo} · semanas com os resultados congelados`} />
      <AreasGrr ativa="historico" parametros="" gestor={usuario.perfil === "gestor"} />
      {!disponivel ? (
        <div className="rounded-xl border border-dashed bg-card p-4 text-sm">
          <p className="font-medium">O histórico entra em funcionamento quando as tabelas do GRR forem criadas no banco.</p>
          <p className="mt-1 text-muted-foreground">Falta aplicar a migração 0134. Até lá, o painel mostra sempre os números de agora.</p>
        </div>
      ) : semanas.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-4 text-sm">
          <p className="font-medium">Nenhuma semana congelada ainda.</p>
          <p className="mt-1 text-muted-foreground">Toda segunda às 07:00 a semana anterior é congelada automaticamente. A administração e a direção também podem congelar pelo painel ou no encerramento da reunião.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {semanas.map((inicio) => {
            const versoes = fotos.filter((f) => f.periodo_inicio === inicio);
            return (
              <li key={inicio} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold tabular-nums">Semana de {rotuloSemana({ inicio, fim: versoes[0].periodo_fim })}</h2>
                  <Link href={`/grr?semana=${inicio}`} className="text-sm font-medium text-interlig-azul hover:underline">
                    Abrir o painel congelado
                  </Link>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {versoes.map((f, i) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-x-2">
                      <Badge variant={i === 0 ? "secondary" : "outline"}>versão {f.versao}</Badge>
                      <span>
                        congelada em {dataHora(f.congelado_em)} {ROTULO_ORIGEM[f.origem] ?? ""}
                        {f.congelado_por && nomeDe.get(f.congelado_por) ? `, por ${nomeDe.get(f.congelado_por)}` : ""}
                        {f.motivo ? ` · motivo: ${f.motivo}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
