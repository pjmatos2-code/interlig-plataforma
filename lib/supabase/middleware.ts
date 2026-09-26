import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/sync e /api/webhooks têm autenticação própria por segredo (CRON_SECRET
// e SZCHAT_WEBHOOK_SECRET) — não passam pela sessão de usuário.
const ROTAS_PUBLICAS = ["/login", "/auth", "/api/sync", "/api/webhooks", "/api/sz"];

export async function atualizarSessao(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const caminho = request.nextUrl.pathname;
  const publica = ROTAS_PUBLICAS.some((rota) => caminho.startsWith(rota));

  // rota pública que não precisa de sessão: nem chama o Auth (o cron do
  // /api/sync batia no Auth a cada 5 min à toa)
  if (publica && caminho !== "/login") return response;

  // 26/09/2026: uma lentidão do Supabase Auth derrubou o site inteiro com
  // 504 MIDDLEWARE_INVOCATION_TIMEOUT. O middleware é só conveniência
  // (redirect + refresh do cookie) — a autenticação REAL acontece em cada
  // página (exigirUsuario) e na RLS. Em instabilidade, deixa a navegação
  // seguir em vez de estourar o tempo.
  let user: { id: string } | null = null;
  try {
    const resultado = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, rejeitar) =>
        setTimeout(() => rejeitar(new Error("auth demorou > 5s")), 5000)
      ),
    ]);
    user = resultado.data.user;
  } catch {
    return response; // fail-open: a página decide (e redireciona se preciso)
  }

  if (!user && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("proximo", caminho);
    return NextResponse.redirect(url);
  }

  if (user && caminho === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
