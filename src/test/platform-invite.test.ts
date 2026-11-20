import { expect, it, vi } from "vitest";
import { handleInvite } from "../../supabase/functions/platform-invite/handler";
const env = {
  url: "https://backend.test",
  anonKey: "public",
  serviceKey: "server-only",
  appUrl: "https://crease.test",
  allowedOrigins: ["https://crease.test"],
};
const body = {
  id: "10000000-0000-0000-0000-000000000001",
  email: "new@example.com",
  name: "New User",
  role: "user",
};
const request = () =>
  new Request("https://backend.test/functions/v1/platform-invite", {
    method: "POST",
    headers: {
      origin: env.appUrl,
      authorization: "Bearer user-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
it("rejects unauthenticated and expired requests before privileged operations", async () => {
  const send = vi.fn();
  expect(
    (await handleInvite(new Request("https://backend.test", { method: "POST" }), env, send)).status,
  ).toBe(401);
  expect(send).not.toHaveBeenCalled();
  send.mockResolvedValue(response({}, 401));
  expect((await handleInvite(request(), env, send)).status).toBe(401);
  expect(send).toHaveBeenCalledTimes(1);
});
it("does not send an invite when backend denies permission or detects a duplicate", async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce(response({ id: "actor" }))
    .mockResolvedValueOnce(response({ code: "42501", message: "Denied" }, 403));
  expect((await handleInvite(request(), env, send)).status).toBe(403);
  expect(send).toHaveBeenCalledTimes(2);
  const duplicate = vi
    .fn()
    .mockResolvedValueOnce(response({ id: "actor" }))
    .mockResolvedValueOnce(response({ state: "pending", send: false }));
  expect((await handleInvite(request(), env, duplicate)).status).toBe(409);
  expect(duplicate).toHaveBeenCalledTimes(2);
});
it("uses caller authorization for reservation and server key only for auth invite/finalization", async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce(response({ id: "actor" }))
    .mockResolvedValueOnce(response({ send: true }))
    .mockResolvedValueOnce(response({ id: "created" }))
    .mockResolvedValueOnce(response(null));
  const result = await handleInvite(request(), env, send);
  expect(result.status).toBe(200);
  expect(send.mock.calls[1]![1].headers.Authorization).toBe("Bearer user-token");
  expect(send.mock.calls[2]![1].headers.Authorization).toBe("Bearer server-only");
  expect(send.mock.calls[2]![1].body).not.toContain("password");
  expect(await result.text()).not.toContain("server-only");
});
it("preserves uncertain outcomes and does not automatically retry mail", async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce(response({ id: "actor" }))
    .mockResolvedValueOnce(response({ send: true }))
    .mockRejectedValueOnce(new Error("network disconnected"));
  const result = await handleInvite(request(), env, send);
  expect(result.status).toBe(503);
  expect(await result.text()).toContain("unknown");
  expect(send).toHaveBeenCalledTimes(3);
});
it("records a definite delivery failure and handles disallowed origins", async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce(response({ id: "actor" }))
    .mockResolvedValueOnce(response({ send: true }))
    .mockResolvedValueOnce(response({}, 500))
    .mockResolvedValueOnce(response(null));
  expect((await handleInvite(request(), env, send)).status).toBe(502);
  expect(send.mock.calls[3]![1].body).toContain('"_sent":false');
  const foreign = new Request("https://backend.test", {
    method: "POST",
    headers: { origin: "https://untrusted.test" },
  });
  expect((await handleInvite(foreign, env, send)).status).toBe(403);
});
