/**
 * +native-intent — expo-router hook that rewrites inbound system URLs before
 * routing. Universal links to the web invite page are remapped onto the
 * in-app claim screens:
 *
 *   https://helloparade.app/invite.html?t={token}  → /plan-invite/{token}
 *   https://helloparade.app/invite.html?tt={token} → /trip-invite/{token}
 *
 * Everything else passes through unchanged. Must never throw — a bad URL
 * falls back to the original path and lets the router 404 gracefully.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    // Universal links arrive as full https URLs; custom-scheme links can be
    // bare paths. Strip scheme + host manually (URL isn't reliable this
    // early — polyfills load with the app tree).
    let pathname = path;
    const schemeIdx = pathname.indexOf('://');
    if (schemeIdx !== -1) {
      const afterScheme = pathname.slice(schemeIdx + 3);
      const slashIdx = afterScheme.indexOf('/');
      pathname = slashIdx === -1 ? '/' : afterScheme.slice(slashIdx);
    }
    const hashIdx = pathname.indexOf('#');
    if (hashIdx !== -1) pathname = pathname.slice(0, hashIdx);

    if (!pathname.startsWith('/invite.html')) return path;

    const query = pathname.split('?')[1] ?? '';
    const params: Record<string, string> = {};
    for (const pair of query.split('&')) {
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      params[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
    }

    // ?tt= is a trip invite, ?t= a plan invite (matches web invite.html).
    if (params.tt) return `/trip-invite/${encodeURIComponent(params.tt)}`;
    if (params.t) return `/plan-invite/${encodeURIComponent(params.t)}`;
    return path;
  } catch {
    return path;
  }
}
