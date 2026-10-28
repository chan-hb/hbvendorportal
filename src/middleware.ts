import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Redirect helper only. Actual authorisation lives in the page guards
 * (requireUser, requireInternal, requireAdmin) which run on the server with
 * full database access. This just avoids showing a signed-out visitor a
 * flash of the app shell before the redirect.
 */
export function middleware(req: NextRequest) {
  const hasSession =
    req.cookies.has("authjs.session-token") ||
    req.cookies.has("__Secure-authjs.session-token");

  if (hasSession) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   api, login, forgot-password, set-password  - reachable signed out
     *   _next/static, _next/image                  - build output
     *   anything with a file extension             - assets in /public, which
     *     are served from the root and would otherwise be redirected to the
     *     login page for signed-out visitors
     */
    "/((?!api|login|forgot-password|set-password|_next/static|_next/image|.*\\.[\\w]+$).*)",
  ],
};
