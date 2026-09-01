import Link from "next/link";
import { ehVendedora } from "@/lib/tipos";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { FormularioVisita } from "@/components/externa/formulario-visita";
import { formatarMoeda } from "@/lib/format";
import { CartaoAgenteComercial } from "@/components/agentes/cartao-agente-comercial";

export const dynamic = "force-dynamic";

/**
 * Setor Corporativo — mesmo fluxo da Venda Externa (visita → ticket no CRM),
 * para o agente de planos corporativos. Cliente PJ leva mais tempo para
 * converter: o ticket concentra as tratativas até o fechamento.
 */
export default async function CorporativoPage() {
  const usuario = await exigirPerfil(["gestor", "agente_corporativo"]);
  const supabase = criarClienteServidor();
  const hoje = new Date().toISOString().slice(0, 10);

  const [{ data: planos }, { data: vendedoras }, { data: visitas }] = await Promise.all([
    supabase
      .from("planos")
      .select("id, nome, valor_referencia, setor_corporativo")
      .eq("ativo", true)
      .gt("valor_referencia", 0)
      .order("valor_referencia", { ascending: false }),
    ehVendedora(usuario.perfil)
      ? Promise.resolve({ data: [] as { id: string; nome: string }[] })
      : supabase.from("vendedores").select("id, nome").eq("ativo", true).order("nome"),
    supabase
      .from("visitas_externas")
      .select(
        "id, criado_em, lat, lng, foto_doc_path, tickets(id, cliente_nome, valor_estimado, vendedores(nome))"
      )
      .eq("setor", "corporativo")
      .gte("criado_em", `${hoje}T00:00:00`)
      .order("criado_em", { ascending: false })
      .limit(30),
  ]);

  // corporativo vende os planos marcados no Administração; nenhum marcado = todos
  const doSetor = (planos ?? []).filter((p) => p.setor_corporativo);
  const planosSetor = doSetor.length > 0 ? doSetor : (planos ?? []);

  type Visita = {
    id: string;
    criado_em: string;
    lat: number | null;
    lng: number | null;
    foto_doc_path: string | null;
    tickets: {
      id: string;
      cliente_nome: string;
      valor_estimado: number | null;
      vendedores: { nome: string } | null;
    } | null;
  };
  const lista = ((visitas ?? []) as unknown as Visita[]).filter((v) => v.tickets);

  return (
    <div
      className="-m-4 min-h-screen p-4 lg:-m-6 lg:p-6"
      style={{
        background: "linear-gradient(160deg, #eef2ff 0%, #f5f7ff 45%, #eef6ff 100%)",
      }}
    >
      <div className="mx-auto max-w-md">
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Setor Corporativo 🏢</h1>
          <p className="text-sm text-slate-500">
            Registre a visita — o ticket entra no CRM e concentra as tratativas até o fechamento
          </p>
        </div>

        {ehVendedora(usuario.perfil) && usuario.vendedor_id && (
          <CartaoAgenteComercial vendedorId={usuario.vendedor_id} />
        )}

        <FormularioVisita
          planos={planosSetor}
          vendedoras={vendedoras ?? []}
          ehVendedora={ehVendedora(usuario.perfil)}
          setor="corporativo"
        />

        {/* visitas de hoje */}
        <div className="mt-6 rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
          <p className="mb-2 text-sm font-bold text-slate-800">
            📋 Visitas corporativas de hoje ({lista.length})
          </p>
          {lista.length === 0 ? (
            <p className="py-3 text-center text-sm text-slate-400">
              Nenhuma visita registrada hoje ainda.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lista.map((v) => (
                <li key={v.id} className="flex items-center gap-2 py-2.5">
                  <span className="w-11 shrink-0 text-xs font-semibold tabular-nums text-slate-400">
                    {new Date(v.criado_em).toLocaleTimeString("pt-BR", {
                      timeZone: "America/Santarem",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/crm/${v.tickets!.id}`}
                      className="block truncate text-sm font-semibold text-slate-800 hover:text-primary hover:underline"
                    >
                      {v.tickets!.cliente_nome}
                    </Link>
                    <p className="truncate text-xs text-slate-400">
                      {v.tickets!.vendedores?.nome ?? "—"}
                      {v.foto_doc_path ? " · 🪪 doc" : ""}
                      {v.lat ? " · 📍 GPS" : ""}
                    </p>
                  </div>
                  {v.tickets!.valor_estimado != null && v.tickets!.valor_estimado > 0 && (
                    <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-600">
                      {formatarMoeda(v.tickets!.valor_estimado)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
