import { criarClienteAdmin } from "@/lib/supabase/admin";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatarData, haQuantoTempo } from "@/lib/format";

type Linha = {
  sgp_cliente_id: string;
  nome: string | null;
  cidade_digitada: string | null;
  uf: string | null;
  contratos: number;
  contratos_ativos: number;
  ultimo_contrato_em: string | null;
  visto_em: string;
};

const DIAS_RECENTE = 30;

/**
 * Administração → Cadastros do SGP fora da plataforma (18/11/2026).
 *
 * A plataforma só importa cliente cuja cidade do cadastro é Altamira, Vitória
 * do Xingu ou Brasil Novo. Quem fica de fora não tem venda, comissão nem
 * ticket reconciliado. A lista é o que o sync viu e deixou de fora; ele
 * mesmo tira daqui quem passar a ser reconhecido.
 */
export async function CadastrosForaDoEscopo() {
  const admin = criarClienteAdmin();
  const [{ data, error }, template] = await Promise.all([
    admin
      .from("sgp_fora_do_escopo")
      .select("sgp_cliente_id, nome, cidade_digitada, uf, contratos, contratos_ativos, ultimo_contrato_em, visto_em")
      .order("ultimo_contrato_em", { ascending: false, nullsFirst: false })
      .limit(500),
    templateLinkSgp(),
  ]);
  const linhas = (data ?? []) as Linha[];
  const corte = new Date(Date.now() - DIAS_RECENTE * 86_400_000).toISOString().slice(0, 10);
  const recentes = linhas.filter((l) => (l.ultimo_contrato_em ?? "") >= corte);
  const comAtivo = linhas.filter((l) => l.contratos_ativos > 0);
  const ultimaLeitura = linhas.reduce((m, l) => (l.visto_em > m ? l.visto_em : m), "");

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Cadastros do SGP fora da plataforma</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          A plataforma só importa cliente com cidade de Altamira, Vitória do Xingu ou Brasil Novo no cadastro do SGP.
          Quem está abaixo ficou de fora: não conta em vendas nem em comissão, e o ticket do CRM não reconcilia. Se a
          cidade estiver errada, corrija no SGP; o cadastro entra sozinho na leitura seguinte.
        </p>

        {error ? (
          <p className="mt-3 text-sm text-farol-vermelho">Não foi possível ler a lista: {error.message}</p>
        ) : linhas.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nenhum cadastro fora da plataforma na última leitura.</p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-muted px-2.5 py-1 font-medium">{linhas.length} cadastros</span>
              <span className="rounded-full bg-muted px-2.5 py-1 font-medium">{comAtivo.length} com contrato ativo</span>
              <span
                className={`rounded-full px-2.5 py-1 font-medium ${recentes.length > 0 ? "bg-farol-amarelo/20 text-yellow-800" : "bg-muted"}`}
              >
                {recentes.length} com contrato dos últimos {DIAS_RECENTE} dias
              </span>
              {ultimaLeitura && (
                <span className="px-1 py-1 text-muted-foreground">última leitura {haQuantoTempo(ultimaLeitura)}</span>
              )}
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Cliente</th>
                    <th className="py-2 pr-4 font-medium">Cidade no SGP</th>
                    <th className="py-2 pr-4 text-right font-medium">Contratos</th>
                    <th className="py-2 font-medium">Contrato mais recente</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const link = aplicarLinkSgp(template, { clienteId: l.sgp_cliente_id });
                    const recente = (l.ultimo_contrato_em ?? "") >= corte;
                    return (
                      <tr key={l.sgp_cliente_id} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          {link ? (
                            <a href={link} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                              {l.sgp_cliente_id}
                            </a>
                          ) : (
                            <span className="font-medium">{l.sgp_cliente_id}</span>
                          )}
                          <span className="ml-2 text-muted-foreground">{l.nome ?? "—"}</span>
                        </td>
                        <td className="py-2 pr-4">
                          {l.cidade_digitada ? `“${l.cidade_digitada}”` : <span className="text-muted-foreground">em branco</span>}
                          {l.uf ? <span className="text-muted-foreground"> · {l.uf}</span> : null}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {l.contratos_ativos > 0 ? (
                            <span className="font-medium">{l.contratos_ativos} ativo{l.contratos_ativos > 1 ? "s" : ""}</span>
                          ) : (
                            <span className="text-muted-foreground">nenhum ativo</span>
                          )}
                          <span className="text-muted-foreground"> de {l.contratos}</span>
                        </td>
                        <td className="py-2">
                          {l.ultimo_contrato_em ? formatarData(l.ultimo_contrato_em) : "—"}
                          {recente && (
                            <Badge variant="amarelo" className="ml-2">
                              novo
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
