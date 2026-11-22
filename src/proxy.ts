import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js Middleware proxy for lightweight edge request routing and security header handling.
 * Authentication is enforced at the Server Component and Server Action layer via `requireProfile()`.
 */
export async function proxy(request: NextRequest) {
  // Guard against malformed Server Action probes or scanner fuzzing (e.g. next-action: "x").
  // Genuine Next.js 16 Server Action IDs are strictly 42 characters.
  const nextAction = request.headers.get("next-action");
  if (nextAction && nextAction.length !== 42) {
    return new NextResponse("Invalid action reference", { status: 400 });
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/files|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
