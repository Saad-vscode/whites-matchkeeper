import { handleInvite } from "./handler.ts";
Deno.serve((request: Request) => {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appUrl = Deno.env.get("CREASE_APP_URL")?.replace(/\/$/, "");
  if (!url || !anonKey || !serviceKey || !appUrl)
    return new Response(JSON.stringify({ error: "Invitation service is not configured." }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  return handleInvite(request, {
    url,
    anonKey,
    serviceKey,
    appUrl,
    allowedOrigins: (Deno.env.get("CREASE_ALLOWED_ORIGINS") ?? appUrl)
      .split(",")
      .map((x) => x.trim()),
  });
});
