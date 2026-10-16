import { Suspense } from "react";
import { exigirUsuario } from "@/lib/auth";
import { PaginaInterChat } from "./pagina";

export const dynamic = "force-dynamic";

/** InterChat em tela cheia (celular e computador). O estado vem do provedor no layout. */
export default async function InterChatPage() {
  await exigirUsuario();
  return (
    <Suspense>
      <PaginaInterChat />
    </Suspense>
  );
}
