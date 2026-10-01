import { redirect } from "next/navigation";

/** Modo TV oficial é o dashboard comercial (01/10/2026). */
export default function TvPage() {
  redirect("/tv/comercial");
}
