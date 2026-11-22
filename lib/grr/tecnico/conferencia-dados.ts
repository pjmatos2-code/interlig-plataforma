import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { noExpediente, relogioSantarem } from "@/lib/sync/agenda";
import { hojeSantarem, ultimaSemanaCompleta } from "@/lib/relatorio-semanal/periodo";
import { metaVigente } from "../config";
import { semanaAtual } from "../semana";
import { DIRECIONAMENTO_DESDE } from "@/lib/operacao/direcionamento";
import { MOTIVOS_CALENDARIO } from "@/lib/operacao/calendario";
import { INDICADORES_TECNICO } from "./catalogo";
import { lerMetasTecnico, recortesTecnico } from "./dados";
import { lerFotoTecnico } from "./fotos";
import { conferirTecnico, type ItemConferencia } from "./conferencia";

const somar = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** lê as medidas da conferência do setor técnico (só leitura) */
export async function carregarConferenciaTecnico(): Promise<ItemConferencia[]> {
  const admin = criarClienteAdmin();
  const agora = Date.now();
  const hoje = hojeSantarem();
  const semana = semanaAtual(hoje);
  const ultima = ultimaSemanaCompleta(hoje);
  const conta = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const seteDias = new Date(agora - 7 * 86_400_000).toISOString();

  const [leitura, pendentes, ativadas, ativadasIds, osTotal, osSemTec, desde21, desde21SemHora, metas, recortes] = await Promise.all([
    admin.from("sync_runs").select("finalizado_em, status").eq("entidade", "operacao").order("iniciado_em", { ascending: false }).limit(1).maybeSingle(),
    conta(admin.from("ocorrencias_sgp").select("sgp_ocorrencia_id", { count: "exact", head: true }).eq("tipo", "Operacional - Instalação equipamento").gte("criada_em", `${DIRECIONAMENTO_DESDE}T00:00:00-03:00`).is("direcionada_em", null).not("responsavel", "is", null)),
    conta(admin.from("contratos").select("id", { count: "exact", head: true }).gte("data_ativacao", semana.inicio).lte("data_ativacao", hoje)),
    admin.from("contratos").select("sgp_contrato_id").gte("data_ativacao", semana.inicio).lte("data_ativacao", hoje).limit(2000),
    conta(admin.from("os_tecnicas").select("sgp_os_id", { count: "exact", head: true }).eq("status", "Encerrada").in("motivo", MOTIVOS_CALENDARIO).gte("encerrada_em", seteDias)),
    conta(admin.from("os_tecnicas").select("sgp_os_id", { count: "exact", head: true }).eq("status", "Encerrada").in("motivo", MOTIVOS_CALENDARIO).gte("encerrada_em", seteDias).is("responsavel", null)),
    conta(admin.from("contratos").select("id", { count: "exact", head: true }).gte("data_ativacao", "2026-11-22")),
    conta(admin.from("contratos").select("id", { count: "exact", head: true }).gte("data_ativacao", "2026-11-22").is("ativado_em", null)),
    lerMetasTecnico(admin),
    recortesTecnico(admin),
  ]);

  // instalações da semana com a hora do direcionamento
  const ids = (ativadasIds.data ?? []).map((c) => c.sgp_contrato_id).filter((x): x is string => Boolean(x));
  const comHora = new Set<string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await admin.from("ocorrencias_sgp").select("sgp_contrato_id").eq("tipo", "Operacional - Instalação equipamento").not("direcionada_em", "is", null).in("sgp_contrato_id", ids.slice(i, i + 300));
    for (const d of data ?? []) comHora.add(String(d.sgp_contrato_id));
  }

  const empresa = recortes[0];
  const comMeta = INDICADORES_TECNICO.filter((d) => metaVigente(metas.metas, d, empresa.chave, semana.inicio)).length;
  const foto = await lerFotoTecnico(ultima, empresa, admin);
  const r = relogioSantarem(agora);
  const segundaDoFechamento = somar(ultima.fim, 1);

  return conferirTecnico({
    agora,
    noExpediente: noExpediente(agora),
    ultimaLeituraOperacao: (leitura.data?.finalizado_em as string | undefined) ?? null,
    ultimaLeituraOperacaoOk: leitura.data ? leitura.data.status === "sucesso" : null,
    direcionamentoPendentes: pendentes,
    ativadasSemana: ativadas,
    ativadasSemHora: Math.max(0, ativadas - comHora.size),
    osEncerradas7d: osTotal,
    osSemTecnico7d: osSemTec,
    ativadasDesde21: desde21,
    ativadasDesde21SemHora: desde21SemHora,
    indicadoresComMeta: comMeta,
    totalIndicadores: INDICADORES_TECNICO.length,
    fotoUltimaSemana: Boolean(foto),
    semanaUltima: `${ultima.inicio.slice(8, 10)}/${ultima.inicio.slice(5, 7)} a ${ultima.fim.slice(8, 10)}/${ultima.fim.slice(5, 7)}`,
    segundaJaPassouDas7: r.dia > segundaDoFechamento || (r.dia === segundaDoFechamento && r.hora >= 7),
  });
}
