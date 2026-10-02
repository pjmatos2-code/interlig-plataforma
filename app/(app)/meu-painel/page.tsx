import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { carregarPainelComissoes } from "@/lib/comissao/painel";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { hojeIso, mesAtras, primeiroDiaDoMes } from "@/lib/datas";
import { Card, CardContent } from "@/components/ui/card";
import { CartaoResultadoAgente, dataHora, nomeMes } from "@/components/comissao/cartao-resultado-agente";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Meu painel (01/10/2026) — página inicial das agentes de venda. Mesmo cartão
 * do módulo Comissões, só com os números da própria agente. A gestão abre o
 * painel de qualquer agente por ?agente= para ver exatamente o que ela vê.
 */
export default async function MeuPainelPage({
  searchParams,
}: {
  searchParams: { mes?: string; agente?: string };
}) {
  const usuario = await exigirUsuario();
  const gestao = ["gestor", "direcao"].includes(usuario.perfil);
  const admin = criarClienteAdmin();

  const { data: comerciais } = gestao
    ? await admin
        .from("vendedores")
        .select("id, nome")
        .eq("ativo", true)
        .in("setor", ["comercial_interno", "comercial_externo", "corporativo"])
        .order("nome")
    : { data: [] };
  const vendedorId = gestao ? searchParams.agente ?? null : usuario.vendedor_id;

  const atual = primeiroDiaDoMes(hojeIso());
  const opcoes = [mesAtras(atual, 2), mesAtras(atual, 1), atual];
  const pedido = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "") ? `${searchParams.mes}-01` : null;

  const seletorGestao = gestao && (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <span className="text-muted-foreground">Ver o painel como a agente vê:</span>
      {(comerciais ?? []).map((v) => (
        <Link
          key={v.id}
          href={`/meu-painel?agente=${v.id}${pedido ? `&mes=${pedido.slice(0, 7)}` : ""}`}
          className={cn(
            "rounded-full border px-3 py-1",
            v.id === vendedorId ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
          )}
        >
          {v.nome}
        </Link>
      ))}
    </div>
  );

  if (!vendedorId) {
    return (
      <>
        <h1 className="mb-4 text-xl font-semibold tracking-tight lg:text-2xl">Meu painel</h1>
        {seletorGestao}
        {!gestao && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Seu usuário não está vinculado a um cadastro de agente. O vínculo é feito pelo
              Administrador em Administração → Usuários e perfis.
            </CardContent>
          </Card>
        )}
      </>
    );
  }

  // mês novo ainda sem meta cadastrada: mostra o anterior e avisa
  let mes = pedido ?? atual;
  let p = await carregarPainelComissoes(mes, { vendedorId });
  let semMetaNoMesAtual = false;
  if (!pedido && p.agentes.length === 0) {
    semMetaNoMesAtual = true;
    mes = mesAtras(atual, 1);
    p = await carregarPainelComissoes(mes, { vendedorId });
  }
  const a = p.agentes[0] ?? null;
  const [{ data: v }, linkSgp] = await Promise.all([
    admin.from("vendedores").select("nome").eq("id", vendedorId).maybeSingle(),
    templateLinkSgp(),
  ]);
  const primeiroNome = String(v?.nome ?? "").split(/\s+/)[0];
  const sufixoAgente = gestao ? `&agente=${vendedorId}` : "";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">
            {gestao ? `Painel de ${v?.nome ?? "agente"}` : `Olá, ${primeiroNome}!`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sua meta, suas vendas e sua comissão — com a conta de cada número.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {opcoes.map((m) => (
            <Link
              key={m}
              href={`/meu-painel?mes=${m.slice(0, 7)}${sufixoAgente}`}
              className={cn(
                "rounded-full border px-3 py-1 text-sm capitalize",
                m === mes ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              {nomeMes(m)}
            </Link>
          ))}
        </div>
      </div>

      {seletorGestao}

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {p.fechamento ? (
          <span className="rounded-full bg-farol-verde/15 px-2.5 py-1 font-medium text-farol-verde">
            {nomeMes(mes)} fechado em {dataHora(p.fechamento.em)}
            {p.fechamento.pago ? " · pagamento registrado" : " · aguardando pagamento"}
          </span>
        ) : (
          <span className="rounded-full bg-farol-amarelo/20 px-2.5 py-1 font-medium text-yellow-700">
            {p.emAndamento ? "Mês em andamento — valores parciais, atualizados com o SGP" : "Ainda não fechado"}
          </span>
        )}
        {p.ultimaSync && <span className="px-1 py-1 text-muted-foreground">Dados do SGP de {dataHora(p.ultimaSync)}</span>}
      </div>

      {semMetaNoMesAtual && (
        <div className="mb-4 rounded-lg border border-farol-amarelo/50 bg-farol-amarelo/10 p-3 text-sm">
          A meta de {nomeMes(atual)} ainda não foi cadastrada pela gestão. Enquanto isso, aqui está o resultado de{" "}
          {nomeMes(mes)}.
        </div>
      )}

      {a ? (
        <CartaoResultadoAgente a={a} linkSgp={linkSgp} debito={p.debito} />
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Sem meta ou regra de comissão cadastrada em {nomeMes(mes)}.
          </CardContent>
        </Card>
      )}

      <p className="mt-4 text-sm">
        <Link href="/minha-comissao" className="text-primary hover:underline">
          Simulador e demonstrativo da comissão →
        </Link>
      </p>
    </>
  );
}
