import Link from "next/link";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hojeIso, somarDias } from "@/lib/datas";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatarData, formatarMoeda, formatarNumero } from "@/lib/format";
import { SeletorVendedora } from "./linha";

export const dynamic = "force-dynamic";

export default async function AtribuirVendasPage({
  searchParams,
}: {
  searchParams: { todas?: string };
}) {
  const usuario = await exigirPerfil(["gestor", "supervisor"]);
  const supabase = criarClienteServidor();
  const hoje = hojeIso();
  const corte = somarDias(hoje, -90);
  const mostrarTodas = searchParams.todas === "1";

  let consulta = supabase
    .from("contratos")
    .select(
      "id, data_venda, valor_mensalidade, status, vendedor_id, clientes(nome), planos(nome), pops(nome)"
    )
    .gte("data_venda", corte)
    .neq("status", "cancelado")
    .order("data_venda", { ascending: false })
    .limit(400);
  if (!mostrarTodas) consulta = consulta.is("vendedor_id", null);
  if (usuario.perfil === "supervisor" && usuario.pop_id)
    consulta = consulta.eq("pop_id", usuario.pop_id);

  let consultaVend = supabase.from("vendedores").select("id, nome").eq("ativo", true).order("nome");
  if (usuario.perfil === "supervisor" && usuario.pop_id)
    consultaVend = consultaVend.eq("pop_id", usuario.pop_id);

  const [{ data: contratos }, { data: vendedoras }] = await Promise.all([consulta, consultaVend]);

  type Rel = { nome: string } | null;

  return (
    <>
      <div className="mb-1 text-sm">
        <Link href="/vendedoras" className="text-muted-foreground hover:text-foreground">
          ← Painel por vendedora
        </Link>
      </div>
      <CabecalhoPagina
        titulo="Atribuir vendas"
        descricao="Vendas dos últimos 90 dias. A atribuição automática (CRM) e o importador de relatório preenchem o grosso; aqui é o ajuste fino — a atribuição manual nunca é sobrescrita pelo sync."
      />

      <div className="mb-4 flex gap-2 text-sm">
        <Link
          href="/vendedoras/atribuir"
          className={`rounded-full border px-3 py-1.5 ${!mostrarTodas ? "border-primary bg-primary text-primary-foreground" : "hover:border-interlig-ceu"}`}
        >
          Sem vendedora ({!mostrarTodas ? formatarNumero((contratos ?? []).length) : "…"})
        </Link>
        <Link
          href="/vendedoras/atribuir?todas=1"
          className={`rounded-full border px-3 py-1.5 ${mostrarTodas ? "border-primary bg-primary text-primary-foreground" : "hover:border-interlig-ceu"}`}
        >
          Todas
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Venda</th>
                  <th className="px-3 py-2.5 font-medium">Cliente</th>
                  <th className="px-3 py-2.5 font-medium">Plano</th>
                  <th className="px-3 py-2.5 text-right font-medium">Valor</th>
                  <th className="px-3 py-2.5 font-medium">POP</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Vendedora</th>
                </tr>
              </thead>
              <tbody>
                {(contratos ?? []).map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {formatarData(c.data_venda)}
                    </td>
                    <td className="px-3 py-2 font-medium">{(c.clientes as unknown as Rel)?.nome ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{(c.planos as unknown as Rel)?.nome ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(c.valor_mensalidade)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{(c.pops as unknown as Rel)?.nome ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant={c.status === "ativo" ? "verde" : "amarelo"}>{c.status}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <SeletorVendedora
                        contratoId={c.id}
                        atualId={c.vendedor_id}
                        vendedoras={vendedoras ?? []}
                      />
                    </td>
                  </tr>
                ))}
                {(contratos ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      {mostrarTodas ? "Nenhuma venda nos últimos 90 dias." : "Nenhuma venda sem vendedora 🎉"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
