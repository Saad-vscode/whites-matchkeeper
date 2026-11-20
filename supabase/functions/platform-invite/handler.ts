export type InviteEnvironment = {
  url: string;
  anonKey: string;
  serviceKey: string;
  appUrl: string;
  allowedOrigins: string[];
};
/** Credentials exist only in the Edge Function environment. Every reservation uses the caller JWT. */
export async function handleInvite(
  request: Request,
  env: InviteEnvironment,
  send: typeof fetch = fetch,
): Promise<Response> {
  const origin = request.headers.get("origin") ?? "";
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "Access-Control-Allow-Origin": env.allowedOrigins.includes(origin) ? origin : env.appUrl,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const respond = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !env.allowedOrigins.includes(origin))
    return respond(403, { error: "Origin not allowed" });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return respond(405, { error: "Method not allowed" });
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    return respond(401, { error: "Sign in again to continue." });
  if (Number(request.headers.get("content-length") ?? 0) > 4096)
    return respond(413, { error: "Request too large" });
  const callerHeaders = {
    apikey: env.anonKey,
    Authorization: authorization,
    "Content-Type": "application/json",
  };
  const serviceHeaders: Record<string, string> = {
    apikey: env.serviceKey,
    "Content-Type": "application/json",
  };
  if (!env.serviceKey.startsWith("sb_secret_"))
    serviceHeaders["Authorization"] = "Bearer " + env.serviceKey;
  let id: string | undefined;
  let reserved = false;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return respond(413, { error: "Request too large" });
    const body = JSON.parse(raw);
    if (
      typeof body.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.id) ||
      typeof body.email !== "string" ||
      typeof body.name !== "string" ||
      !["user", "admin"].includes(body.role)
    )
      return respond(400, { error: "Invalid invitation" });
    id = body.id;
    const user = await send(env.url + "/auth/v1/user", { headers: callerHeaders });
    if (!user.ok) return respond(401, { error: "Your session has expired. Sign in again." });
    const reservation = await send(env.url + "/rest/v1/rpc/platform_reserve_invitation", {
      method: "POST",
      headers: callerHeaders,
      body: JSON.stringify({
        _id: id,
        _email: body.email.trim().toLowerCase(),
        _name: body.name.trim(),
        _role: body.role,
      }),
    });
    const details = await reservation.json();
    if (!reservation.ok)
      return respond(details.code === "42501" ? 403 : 409, {
        error: details.message ?? "Invitation could not be reserved.",
      });
    if (!details.send)
      return respond(409, {
        error: `Invitation already ${details.state}. Check the directory before retrying.`,
      });
    reserved = true;
    const invite = await send(
      env.url + "/auth/v1/invite?redirect_to=" + encodeURIComponent(env.appUrl + "/accept-invite"),
      {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({
          email: body.email.trim().toLowerCase(),
          data: { full_name: body.name.trim(), crease_invitation: id },
        }),
      },
    );
    const finish = await send(env.url + "/rest/v1/rpc/platform_finish_invitation", {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({ _id: id, _sent: invite.ok }),
    });
    if (!invite.ok)
      return respond(502, {
        error:
          "The invitation was not confirmed. Check the user directory and email delivery configuration before retrying.",
      });
    if (!finish.ok)
      return respond(202, {
        message: "Invitation sent. Delivery audit is pending; do not send it again.",
      });
    return respond(200, {
      message: "Invitation sent. The user can securely set their own password from the email.",
    });
  } catch {
    // An uncertain network response may already have created the account or sent mail.
    // Preserve the pending reservation: never retry automatically or delete the account.
    return respond(503, {
      error: reserved
        ? "Delivery outcome is unknown. Check the directory before retrying; the reservation is retained."
        : "Invitation service unavailable. Please try again.",
    });
  }
}
