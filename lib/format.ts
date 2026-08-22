// Convenções do CLAUDE.md: moeda R$, datas dd/mm/aaaa, fuso America/Santarem.

export const FUSO = "America/Santarem";

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numero = new Intl.NumberFormat("pt-BR");

const dataCurta = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatarMoeda = (valor: number | null | undefined) =>
  moeda.format(valor ?? 0);

const moedaInteira = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/** Para cartões de KPI: valores ≥ R$ 1.000 dispensam os centavos. */
export const formatarMoedaKpi = (valor: number | null | undefined) =>
  Math.abs(valor ?? 0) >= 1000 ? moedaInteira.format(valor ?? 0) : moeda.format(valor ?? 0);

export const formatarNumero = (valor: number | null | undefined) =>
  numero.format(valor ?? 0);

export const formatarPercentual = (fracao: number | null | undefined, casas = 1) =>
  `${((fracao ?? 0) * 100).toFixed(casas).replace(".", ",")}%`;

export const formatarData = (valor: string | Date | null | undefined) => {
  if (!valor) return "—";
  // Data pura (aaaa-mm-dd): formatar como dia civil, sem deslocamento de fuso.
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split("-");
    return `${d}/${m}/${a}`;
  }
  return dataCurta.format(new Date(valor));
};

export const formatarDataHora = (valor: string | Date | null | undefined) =>
  valor ? dataHora.format(new Date(valor)) : "—";

/** "atualizado há X min" — selo exigido na seção 11 do PRD. */
export function haQuantoTempo(valor: string | Date | null | undefined) {
  if (!valor) return "sem sincronização";
  const minutos = Math.floor((Date.now() - new Date(valor).getTime()) / 60000);
  if (minutos < 1) return "agora há pouco";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  return `há ${Math.floor(horas / 24)} d`;
}
