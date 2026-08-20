import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com service role — IGNORA RLS. Uso exclusivo de rotinas de sistema
 * (fechamento automático por inatividade, reconciliação com o SGP, futuro
 * worker de sync). NUNCA importar em componente de página nem expor ao
 * navegador; o import de "server-only" quebra o build se acontecer.
 */
export function criarClienteAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
