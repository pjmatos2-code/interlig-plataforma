import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { estadoLeituras, lerCancelamentosRecentes, lerTrechoOcorrencias } from "@/lib/sgp/leituras-prevencao";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const PERFIS = ["gestor", "direcao", "agente_retencao", "agente_atendimento", "supervisor"];

/**
 * Botão "Atualizar agora" da Prevenção de cancelamento (14/11/2026). Cada
 * chamada faz UM passo: os cancelamentos recentes, ou um trecho de até 7 dias
 * de ocorrências. A resposta diz se ainda falta algo, e a tela repete até
 * alcançar hoje. Assim nenhuma chamada fica longa, e o que já foi lido fica
 * gravado mesmo se a pessoa sair da tela no meio.
 *
 * No SGP é só leitura. A gravação vai para o banco da plataforma, como na
 * rotina automática.
 */
export async function POST(request: Request) {
  const usuario = await exigirUsuario();
  if (!PERFIS.includes(usuario.perfil)) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const corpo = (await request.json().catch(() => ({}))) as { etapa?: string };
  const admin = criarClienteAdmin();

  if (corpo.etapa === "cancelamentos") {
    const r = await lerCancelamentosRecentes(admin);
    if (!r.ok) console.error(`prevenção: cancelamentos falharam (${usuario.perfil}):`, r.erro);
    return NextResponse.json({ ...r, estado: await estadoLeituras(admin) }, { status: r.ok ? 200 : 502 });
  }
  if (corpo.etapa === "ocorrencias") {
    const r = await lerTrechoOcorrencias(admin);
    if (!r.ok && !r.ocupado) console.error(`prevenção: ocorrências falharam (${usuario.perfil}):`, r.erro);
    const status = r.ok ? 200 : r.ocupado ? 409 : 502;
    return NextResponse.json({ ...r, estado: await estadoLeituras(admin) }, { status });
  }
  return NextResponse.json({ erro: "Etapa inválida." }, { status: 400 });
}
