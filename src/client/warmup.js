function warmApi() {
  if (apiWarmed) return;
  apiWarmed = true;
  // The first real request establishes the connection. An extra OPTIONS probe
  // duplicates browser-managed preflight and can keep startup network-idle open.
}
