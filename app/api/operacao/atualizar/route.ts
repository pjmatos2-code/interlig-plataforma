import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { DIAS_QUADRO, PERFIS_OPERACAO, diaSantarem, fatiaAtualizar } from "@/lib/operacao/regras";
import { janelaOsOperacao } from "@/lib/sync/agenda";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Botão "Atualizar" da Operação Técnica (21/11/2026). Cada chamada faz UM
 * passo — as OS dos últimos 31 dias, ou uma fatia das ocorrências — e a tela
 * chama em sequência: OS, fatia 0, 1 e 2. Nenhuma chamada fica longa e o que já
 * foi lido fica gravado mesmo se a pessoa sair no meio.
 *
 * No SGP é só leitura. A gravação vai para o espelho da plataforma, como na
 * rotina automática; no fim, o carimbo da rotina avança para ela não repetir a
 * mesma leitura logo em seguida.
 */
export async function POST(request: Request) {
  const usuario = await exigirUsuario();
  if (!PERFIS_OPERACAO.includes(usuario.perfil)) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const corpo = (await request.json().catch(() => ({}))) as { etapa?: string; fatia?: number };
  const agora = Date.now();
  const hoje = diaSantarem(agora)!;

  if (corpo.etapa === "os") {
    const janela = janelaOsOperacao(agora);
    const { sincronizarOsJanela } = await import("@/lib/sgp/os");
    const r = await sincronizarOsJanela(janela.de, janela.ate);
    if (!r.ok) console.error(`operação: OS falharam (${usuario.perfil}):`, r.erro);
    return NextResponse.json({ ok: r.ok, lidas: r.lidas, erro: r.erro }, { status: r.ok ? 200 : 502 });
  }

  if (corpo.etapa === "ocorrencias") {
    const fatia = fatiaAtualizar(hoje, Number(corpo.fatia));
    if (!fatia) return NextResponse.json({ erro: "Fatia inválida." }, { status: 400 });
    const { atualizarOcorrencias } = await import("@/lib/sgp/ocorrencias");
    const r = await atualizarOcorrencias(fatia.de, fatia.ateExclusivo);
    if (!r.ok) console.error(`operação: ocorrências falharam (${usuario.perfil}):`, r.erro);
    const ultima = Number(corpo.fatia) === 2;
    if (r.ok && ultima) {
      await criarClienteAdmin().rpc("mesclar_config", { p_sistema: "sgp", p_patch: { operacao_lida_em: new Date(agora).toISOString() } });
    }
    return NextResponse.json({ ok: r.ok, lidas: r.lidas, erro: r.erro, dias: DIAS_QUADRO }, { status: r.ok ? 200 : 502 });
  }

  return NextResponse.json({ erro: "Etapa inválida." }, { status: 400 });
}
