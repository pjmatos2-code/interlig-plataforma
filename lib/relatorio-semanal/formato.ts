/** formatação pt-BR dos números do relatório (funções puras) */

export const num = (v: number) => v.toLocaleString("pt-BR");
export const dec1 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** "R$ 11.706" — valores de soma, sem centavos */
export const reais = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
/** "R$ 136,12" — ticket e valores unitários */
export const reais2 = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** "R$ 74,8 mil" */
export const reaisMil = (v: number) => `R$ ${(v / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`;
export const pct = (v: number) => `${Math.round(v * 100)}%`;
/** "48% acima" / "12% abaixo" / "igual" */
export function variacao(atual: number, antes: number): string {
  if (!antes) return atual ? "sem base de comparação" : "igual";
  const d = (atual - antes) / antes;
  if (Math.abs(d) < 0.005) return "igual";
  return `${Math.round(Math.abs(d) * 100)}% ${d > 0 ? "acima" : "abaixo"}`;
}
/** "+70" / "−12" / "0" */
export const sinal = (v: number) => (v > 0 ? `+${num(v)}` : v < 0 ? `−${num(-v)}` : "0");
/** lista em português: "a, b e c" */
export function lista(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}
export const plural = (n: number, um: string, varios: string) => `${num(n)} ${n === 1 ? um : varios}`;
