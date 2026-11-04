export function refuseOfflineWorker(host: string, production: boolean, framed: boolean, disabled: boolean) {
  const hostname = host.toLowerCase();
  const platform = /\.(lovable\.app|gpt-eng\.com|gptengineer\.run)$/.test(hostname);
  const label = hostname.split(".")[0] ?? "";
  return !production || framed || disabled ||
    (platform && (/^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(label) || /^project--.+-dev$/.test(label))) ||
    /(^|\.)(lovableproject\.com|lovableproject-dev\.com|beta\.lovable\.dev)$/.test(hostname);
}

export async function registerOfflineWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (refuseOfflineWorker(window.location.hostname, import.meta.env.PROD, window.self !== window.top, new URLSearchParams(window.location.search).get("sw") === "off")) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.filter((r) => [r.active, r.waiting, r.installing].some((w) => w && new URL(w.scriptURL).pathname === "/sw.js")).map((r) => r.unregister()));
    return;
  }
  const { registerSW } = await import("virtual:pwa-register");
  registerSW({ immediate: true });
}