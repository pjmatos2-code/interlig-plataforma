/**
 * Carga histórica das conversas comerciais do SZ (Performance Comercial).
 * SOMENTE LEITURA no SZ; grava só em conversas_atendimento/mensagens.
 * Idempotente — pode rodar de novo que pula o que já foi coletado.
 *
 * Uso (na raiz do projeto):
 *   npx esbuild scripts/performance/coletar-historico.ts --bundle --platform=node --format=esm \
 *     --outfile=/tmp/coletar.mjs --alias:@=. --alias:server-only=./scripts/performance/sem-server-only.ts --packages=external
 *   node --env-file=.env.local /tmp/coletar.mjs 2026-08-01 2026-10-23
 */
import { coletarDia, montarContextoColeta } from "@/lib/performance/coleta/job";
import { abrirSessaoSz } from "@/lib/performance/coleta/sz";

const [de, ate] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(de ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(ate ?? "")) {
  console.error("uso: coletar-historico <de aaaa-mm-dd> <ate aaaa-mm-dd>");
  process.exit(1);
}
const sz = await abrirSessaoSz();
if (!sz) throw new Error("credencial do robô SZ não configurada");
const ctx = await montarContextoColeta();
// PAUSA_MS=400 deixa a carga mais leve no horário comercial (o robô de produção usa a mesma conta)
const pausa = Math.max(100, Number(process.env.PAUSA_MS ?? 150) || 150);
const t0 = Date.now();
let total = { novas: 0, atualizadas: 0, puladas: 0, erros: 0 };
for (let d = de; d <= ate; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
  const ini = Date.now();
  // ritmo educado (pausa entre chamadas); falha do SZ → espera 60 s, reloga
  // UMA vez e retoma do ponto; se falhar de novo, para tudo (não insiste
  // com a conta do robô, que o robô de produção também usa)
  let r = await coletarDia(d, { sz, ctx, pausaMs: pausa });
  if (r.falhouListagem) {
    console.log(`${d}: SZ instável (${r.ultimoErro}); nova tentativa em 60 s`);
    await new Promise((ok) => setTimeout(ok, 60_000));
    await sz.login();
    const r2 = await coletarDia(d, { sz, ctx, pausaMs: pausa * 2, paginaInicial: r.proximaPagina ?? 1 });
    r = { ...r2, novas: r.novas + r2.novas, puladas: r.puladas + r2.puladas, listadas: r.listadas + r2.listadas, paginas: r.paginas + r2.paginas };
    if (r2.falhouListagem) {
      console.log(`${d}: falhou de novo (${r2.ultimoErro}). Parando a carga para não insistir com a conta do robô. Retome a partir de ${d}.`);
      break;
    }
  }
  total = { novas: total.novas + r.novas, atualizadas: total.atualizadas + r.atualizadas, puladas: total.puladas + r.puladas, erros: total.erros + r.erros };
  console.log(`${d}: ${r.paginas} pág · ${r.listadas} comerciais · ${r.novas} novas · ${r.puladas} puladas · ${r.erros} erros · ${((Date.now() - ini) / 1000).toFixed(0)}s${r.ultimoErro ? " · último erro: " + r.ultimoErro : ""}`);
}
console.log(`FIM em ${((Date.now() - t0) / 60000).toFixed(1)} min:`, JSON.stringify(total));
console.log("agentes sem vínculo:", JSON.stringify([...ctx.agentesSemVinculo]));
process.exit(0);
