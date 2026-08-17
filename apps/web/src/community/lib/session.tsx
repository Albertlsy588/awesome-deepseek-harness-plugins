/**
 * Send the reader to GitHub, coming back to where they were.
 *
 * Identity itself comes from `useViewer` at the site root — the community has no
 * session of its own. The return address is validated on the server
 * (sanitizeReturnTo), not here, so a crafted link cannot turn this into a
 * redirector.
 */
export function startSignIn(): void {
  const returnTo = `${window.location.pathname}${window.location.search}`
  window.location.href = `/api/v1/community/sign-in?returnTo=${encodeURIComponent(returnTo)}`
}
