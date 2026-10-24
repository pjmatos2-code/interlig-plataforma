/**
 * Períodos da Performance Comercial (24/10/2026) — puro, testado em
 * periodo.test.ts. Datas civis de Santarém (aaaa-mm-dd). O comparativo é o
 * período anterior EQUIVALENTE: mesmo tamanho imediatamente antes; no "mês
 * atual" é o mesmo intervalo de dias do mês passado (01 a dd).
 */
export type PresetPeriodo = "hoje" | "ontem" | "7d" | "30d" | "mes" | "mes_anterior" | "personalizado";

export type PeriodoPerf = {
  preset: PresetPeriodo;
  de: string;
  ate: string;
  deAnterior: string;
  ateAnterior: string;
  rotulo: string;
  dias: number;
};

export const ROTULO_PRESET: Record<PresetPeriodo, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  mes: "Mês atual",
  mes_anterior: "Mês anterior",
  personalizado: "Personalizado",
};

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const soma = (iso: string, d: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000) + 1;
const ultimoDia = (ano: number, mes1a12: number) => new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate();

/** mesmo dia no mês anterior, sem estourar (31/03 → 28 ou 29/02) */
function mesmoDiaMesAnterior(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const anoAnt = m === 1 ? a - 1 : a;
  const mesAnt = m === 1 ? 12 : m - 1;
  return `${anoAnt}-${String(mesAnt).padStart(2, "0")}-${String(Math.min(d, ultimoDia(anoAnt, mesAnt))).padStart(2, "0")}`;
}

const fmt = (iso: string) => iso.split("-").reverse().join("/");

export function resolverPeriodoPerf(sp: { periodo?: string; de?: string; ate?: string }, hoje: string): PeriodoPerf {
  const preset = (Object.keys(ROTULO_PRESET) as PresetPeriodo[]).includes(sp.periodo as PresetPeriodo) ? (sp.periodo as PresetPeriodo) : "mes";
  let de = hoje;
  let ate = hoje;
  let deAnterior: string;
  let ateAnterior: string;
  switch (preset) {
    case "hoje":
      deAnterior = ateAnterior = soma(hoje, -1);
      break;
    case "ontem":
      de = ate = soma(hoje, -1);
      deAnterior = ateAnterior = soma(hoje, -2);
      break;
    case "7d":
      de = soma(hoje, -6);
      deAnterior = soma(hoje, -13);
      ateAnterior = soma(hoje, -7);
      break;
    case "30d":
      de = soma(hoje, -29);
      deAnterior = soma(hoje, -59);
      ateAnterior = soma(hoje, -30);
      break;
    case "mes_anterior": {
      const fimAnt = soma(`${hoje.slice(0, 7)}-01`, -1);
      de = `${fimAnt.slice(0, 7)}-01`;
      ate = fimAnt;
      const fimAntAnt = soma(de, -1);
      deAnterior = `${fimAntAnt.slice(0, 7)}-01`;
      ateAnterior = fimAntAnt;
      break;
    }
    case "personalizado": {
      const d1 = DATA.test(sp.de ?? "") ? sp.de! : `${hoje.slice(0, 7)}-01`;
      const d2 = DATA.test(sp.ate ?? "") ? sp.ate! : hoje;
      de = d1 <= d2 ? d1 : d2;
      ate = (d1 <= d2 ? d2 : d1) > hoje ? hoje : d1 <= d2 ? d2 : d1;
      if (de > ate) de = ate;
      // limite de 366 dias para não varrer a base inteira
      if (diasEntre(de, ate) > 366) de = soma(ate, -365);
      const n = diasEntre(de, ate);
      ateAnterior = soma(de, -1);
      deAnterior = soma(de, -n);
      break;
    }
    default: {
      // mês atual: 01 até hoje; comparativo = 01 até o mesmo dia do mês passado
      de = `${hoje.slice(0, 7)}-01`;
      const ref = mesmoDiaMesAnterior(hoje);
      deAnterior = `${ref.slice(0, 7)}-01`;
      ateAnterior = ref;
    }
  }
  const rotulo = preset === "personalizado" || preset === "7d" || preset === "30d" || preset === "mes" || preset === "mes_anterior"
    ? `${ROTULO_PRESET[preset]} · ${fmt(de)} a ${fmt(ate)}`
    : `${ROTULO_PRESET[preset]} · ${fmt(de)}`;
  return { preset, de, ate, deAnterior: deAnterior!, ateAnterior: ateAnterior!, rotulo, dias: diasEntre(de, ate) };
}

/** instantes [início, fim] do período em ms (Santarém) */
export function limitesMs(de: string, ate: string): [number, number] {
  return [Date.parse(`${de}T00:00:00-03:00`), Date.parse(`${ate}T23:59:59.999-03:00`)];
}
