import { describe, expect, it } from "vitest";
import { userActions, type ManagedUser } from "./platform-users";
const regular: ManagedUser = {
  id: "target",
  email: "person@example.com",
  full_name: "Person",
  avatar_url: null,
  role: "user",
  status: "active",
  tournaments: 3,
  created_at: "2026-01-01",
  last_sign_in_at: null,
};
describe("User management action visibility", () => {
  it("protects owners and self even from owners", () => {
    expect(userActions("owner", "actor", { ...regular, role: "owner" })).toEqual([]);
    expect(userActions("owner", "target", regular)).toEqual([]);
    expect(userActions("user", "actor", regular)).toEqual([]);
  });
  it("limits admins to regular accounts and reserves privilege changes to owners", () => {
    expect(userActions("admin", "actor", regular)).toEqual(["edit", "block", "deactivate"]);
    expect(userActions("admin", "actor", { ...regular, role: "admin" })).toEqual([]);
    expect(userActions("owner", "actor", regular)).toContain("grant_admin");
    expect(userActions("owner", "actor", { ...regular, role: "admin" })).toContain("revoke_admin");
  });
  it("offers recovery and avoids promoting blocked or invited accounts", () => {
    expect(userActions("owner", "actor", { ...regular, status: "deactivated" })).toEqual([
      "restore",
    ]);
    expect(userActions("owner", "actor", { ...regular, status: "blocked" })).toContain("unblock");
    expect(userActions("owner", "actor", { ...regular, status: "invited" })).not.toContain(
      "grant_admin",
    );
  });
});
