/**
 * pendingDeepLink — remembers a deep-link destination across the login bounce.
 *
 * When a signed-out user opens a universal link into a protected (app) route
 * (e.g. an iMessage /imessage-plan or /invite/{code} link), (app)/_layout
 * redirects them to login. We stash the intended href here first and replay it
 * once the authenticated shell mounts, so the tap isn't lost.
 *
 * Module-scoped (not persisted) — it only needs to survive the in-session hop
 * from the protected route to login and back.
 */
let pending: string | null = null;

export function setPendingDeepLink(href: string): void {
  pending = href;
}

export function consumePendingDeepLink(): string | null {
  const href = pending;
  pending = null;
  return href;
}
