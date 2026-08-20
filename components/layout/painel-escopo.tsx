import { criarClienteServidor } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarNumero } from "@/lib/format";
import { ROTULO_PERFIL, type Usuario } from "@/lib/tipos";

/**
 * Painel de verificação da fundação: mostra o que a RLS deixa este usuário ver.
 * Os mesmos números, vistos por perfis diferentes, provam que a matriz da
 * seção 2 do PRD está valendo no BANCO — não só na tela.
 * Os KPIs de verdade (seção 5) entram na Fase 1.
 */
export async function PainelEscopo({ usuario }: { usuario: Usuario }) {
  const supabase = criarClienteServidor();
  const inicioMes = new Date();
  inicioMes.setDate(1);
  const inicioMesIso = inicioMes.toISOString().slice(0, 10);

  const [contratos, vendasMes, tickets, ticketsAbertos, titulos] = await Promise.all([
    supabase.from("contratos").select("*", { count: "exact", head: true }),
    supabase.from("contratos").select("*", { count: "exact", head: true }).gte("data_venda", inicioMesIso),
    supabase.from("tickets").select("*", { count: "exact", head: true }),
    supabase.from("tickets").select("*", { count: "exact", head: true }).neq("etapa", "fechado"),
    supabase.from("titulos").select("*", { count: "exact", head: true }),
  ]);

  let escopo = "todas as POPs";
  if (usuario.perfil === "supervisor" && usuario.pop_id) {
    const { data } = await supabase.from("pops").select("nome").eq("id", usuario.pop_id).maybeSingle();
    escopo = `POP ${data?.nome ?? "sem POP vinculada"}`;
  } else if (usuario.perfil === "vendedora") {
    const { data } = usuario.vendedor_id
      ? await supabase.from("vendedores").select("nome").eq("id", usuario.vendedor_id).maybeSingle()
      : { data: null };
    escopo = `carteira de ${data?.nome ?? "vendedora não vinculada"}`;
  }

  const cards = [
    { rotulo: "Contratos visíveis", valor: contratos.count, nota: "espelho do SGP" },
    { rotulo: "Vendas do mês", valor: vendasMes.count, nota: "por data_venda" },
    { rotulo: "Tickets do CRM", valor: tickets.count, nota: "total no escopo" },
    { rotulo: "Tickets em aberto", valor: ticketsAbertos.count, nota: "ainda sem desfecho" },
    {
      rotulo: "Títulos financeiros",
      valor: titulos.count,
      nota: usuario.perfil === "vendedora" ? "sem acesso (RLS)" : "base da inadimplência",
    },
  ];

  return (
    <section className="mb-6">
      <p className="mb-3 text-sm text-muted-foreground">
        Perfil <strong>{ROTULO_PERFIL[usuario.perfil]}</strong> · escopo de dados: <strong>{escopo}</strong>
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.rotulo}>
            <CardHeader className="p-4 pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {card.rotulo}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-2xl font-semibold tabular-nums">{formatarNumero(card.valor ?? 0)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{card.nota}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
