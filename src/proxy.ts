import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js Middleware proxy for lightweight edge request routing and security header handling.
 * Authentication is enforced at the Server Component and Server Action layer via `requireProfile()`.
 */
export async function proxy(request: NextRequest) {
  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/files|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
