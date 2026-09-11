import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return false;
  if (
    url.includes("your-project") ||
    url.includes("example.com") ||
    key.includes("your-anon-key") ||
    key.includes("placeholder") ||
    !url.startsWith("http")
  ) {
    return false;
  }
  return true;
}

/**
 * Next.js Edge / Middleware proxy that keeps Supabase authentication cookies fresh.
 *
 * Performance-optimized:
 * 1. Immediately bypasses if Supabase environment variables are missing or placeholders.
 * 2. Immediately bypasses if no Supabase auth cookies exist on the incoming request,
 *    saving hundreds of milliseconds on every navigation and asset prefetch.
 * 3. Gracefully catches any auth refresh failures to never stall page transitions.
 *
 * @param request The incoming Next.js HTTP request.
 * @returns NextResponse with updated session cookies attached.
 */
export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  // Only run session refresh if auth cookies actually exist on this request
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.includes("auth-token") || c.name.startsWith("sb-"));
  if (!hasAuthCookie) {
    return NextResponse.next({ request });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!;

  let response = NextResponse.next({ request });
  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) => {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    await supabase.auth.getUser();
  } catch {
    // Network or session refresh errors should never block navigation
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
