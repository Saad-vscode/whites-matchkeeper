import { FeatureEditor } from "@/components/platform-features";
﻿import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  MoreHorizontal,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UserRound,
  Mail,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  getDirectory,
  getUserDetails,
  manageUser,
  inviteUser,
  roleLabel,
  userActions,
  type ManagedUser,
  type UserAction,
} from "@/lib/platform-users";
import type { PlatformRole } from "@/lib/platform-admin";
const labels: Record<UserAction, string> = {
  edit: "Edit profile",
  grant_admin: "Grant admin access",
  revoke_admin: "Revoke admin access",
  block: "Block account",
  unblock: "Unblock account",
  deactivate: "Delete account",
  restore: "Restore account",
};
const selectClass =
  "h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground";
const date = (value: string | null) => (value ? new Date(value).toLocaleDateString() : "Never");
function Avatar({ user }: { user: ManagedUser }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 text-sm font-bold text-primary">
      {user.avatar_url?.startsWith("https://") && !failed ? (
        <img
          src={user.avatar_url}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        (user.full_name || user.email || "?").slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
function Status({ status }: { status: ManagedUser["status"] }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${status === "active" ? "border-primary/20 bg-primary/10 text-primary" : status === "blocked" || status === "deactivated" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-border bg-muted text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}
export function PlatformUsers({
  actorId,
  actorRole,
}: {
  actorId: string;
  actorRole: PlatformRole;
}) {
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<ManagedUser | null>(null);
  const [operation, setOperation] = useState<{ user: ManagedUser; action: UserAction } | null>(
    null,
  );
  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [inviteId, setInviteId] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ["platform-users", actorId, term, role, status, sort, page],
    queryFn: () => getDirectory({ search: term, role, status, sort, page }),
    gcTime: 0,
    retry: false,
    refetchInterval: 30000,
  });
  const details = useQuery({
    queryKey: ["platform-user-details", actorId, detail?.id],
    queryFn: () => getUserDetails(detail!.id),
    enabled: !!detail,
    gcTime: 0,
    retry: false,
    refetchInterval: 30000,
  });
  const data = query.isError ? undefined : query.data;
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["platform-users"] }),
      cache.invalidateQueries({ queryKey: ["platform-user-details"] }),
      cache.invalidateQueries({ queryKey: ["platform-overview"] }),
      cache.invalidateQueries({ queryKey: ["platform-role"] }),
    ]);
  };
  const mutation = useMutation({
    mutationFn: async () => {
      if (inviting) return inviteUser(inviteId, email, name, inviteRole);
      if (!operation) throw new Error("Select an action first.");
      await manageUser(operation.user.id, operation.action, name, avatar, reason);
      return "Account updated.";
    },
    onSuccess: async (message) => {
      toast.success(message);
      setOperation(null);
      setInviting(false);
      setDetail(null);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const begin = (user: ManagedUser, action: UserAction) => {
    mutation.reset();
    setDetail(null);
    setOperation({ user, action });
    setName(user.full_name);
    setAvatar(user.avatar_url ?? "");
    setReason("");
    setConfirm("");
  };
  const menu = (user: ManagedUser) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${user.full_name || user.email}`}
        >
          <MoreHorizontal size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="tournament-page">
        <DropdownMenuItem onClick={() => setDetail(user)}>View user details</DropdownMenuItem>
        {userActions(actorRole, actorId, user).map((action) => (
          <DropdownMenuItem
            key={action}
            onClick={() => begin(user, action)}
            className={action === "deactivate" ? "text-destructive" : ""}
          >
            {labels[action]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const canSubmit = inviting
    ? !!name.trim() && !!email.trim()
    : !!operation &&
      (operation.action !== "edit" || !!name.trim()) &&
      (!["block", "deactivate"].includes(operation.action) || !!reason.trim()) &&
      (operation.action !== "deactivate" || confirm === operation.user.email);
  const currentAction = operation?.action;
  return (
    <section aria-label="User management" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Manage people and access while preserving their cricket history.
        </p>
        <Button
          className="gap-2 rounded-xl"
          onClick={() => {
            mutation.reset();
            setInviting(true);
            setInviteId(crypto.randomUUID());
            setName("");
            setEmail("");
            setInviteRole("user");
          }}
        >
          <Plus size={17} />
          Add user
        </Button>
      </div>
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {(
            [
              ["Registered users", data.summary.total],
              ["Active accounts", data.summary.active],
              ["Blocked accounts", data.summary.blocked],
              ["Platform admins", data.summary.admins],
              ["New · 30 days", data.summary.new],
            ] as const
          ).map(([label, count]) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{count.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-2xl border border-border bg-card">
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_auto_auto_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-muted-foreground" size={16} />
            <Input
              aria-label="Search users"
              placeholder="Search name or email"
              maxLength={200}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            aria-label="Filter by role"
            className={selectClass}
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All roles</option>
            <option value="user">Registered users</option>
            <option value="admin">Platform admins</option>
            {actorRole === "owner" && <option value="owner">Platform owners</option>}
          </select>
          <select
            aria-label="Filter by status"
            className={selectClass}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            {["all", "active", "blocked", "invited", "deactivated"].map((v) => (
              <option value={v} key={v}>
                {v === "all" ? "All statuses" : v.charAt(0).toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort users"
            className={selectClass}
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(0);
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
          </select>
          <Button variant="outline" aria-label="Refresh users" onClick={() => void query.refetch()}>
            <RefreshCw size={16} />
          </Button>
        </div>
        {query.isPending && (
          <div role="status" className="p-8 text-center text-muted-foreground">
            Loading accounts…
          </div>
        )}
        {query.isError && (
          <div role="alert" className="p-6">
            <AlertCircle size={20} className="mb-2 text-destructive" />
            <p>Unable to load accounts. Your session or access may have changed.</p>
            <p className="mt-1 text-sm text-muted-foreground">{query.error.message}</p>
            <Button variant="outline" className="mt-3" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {data && !data.rows.length && (
          <div className="p-10 text-center">
            <UserRound className="mx-auto mb-3 text-primary" />
            <h2 className="font-semibold">No accounts found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Try another name or adjust your filters.
            </p>
          </div>
        )}
        {!!data?.rows.length && (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    {[
                      "User",
                      "Role",
                      "Status",
                      "Tournaments",
                      "Registered",
                      "Last sign-in",
                      "Actions",
                    ].map((label) => (
                      <th key={label} scope="col" className="px-4 py-3 font-semibold">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-4">
                        <button
                          className="flex items-center gap-3 text-left"
                          onClick={() => setDetail(user)}
                        >
                          <Avatar user={user} />
                          <span>
                            <span className="block max-w-56 truncate font-semibold">
                              {user.full_name || "Name not provided"}
                            </span>
                            <span className="block max-w-56 truncate text-xs text-muted-foreground">
                              {user.email}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-4 text-xs font-semibold">{roleLabel(user.role)}</td>
                      <td className="px-4 py-4">
                        <Status status={user.status} />
                      </td>
                      <td className="px-4 py-4 tabular-nums">{user.tournaments}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-xs">
                        {date(user.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-xs text-muted-foreground">
                        {date(user.last_sign_in_at)}
                      </td>
                      <td className="px-4 py-4">{menu(user)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-border lg:hidden">
              {data.rows.map((user) => (
                <article key={user.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar user={user} />
                    <button onClick={() => setDetail(user)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate font-semibold">
                        {user.full_name || "Name not provided"}
                      </span>
                      <span className="block break-all text-xs text-muted-foreground">
                        {user.email}
                      </span>
                    </button>
                    {menu(user)}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold">{roleLabel(user.role)}</span>
                    <Status status={user.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-muted-foreground">Tournaments</dt>
                      <dd className="mt-1">{user.tournaments}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Registered</dt>
                      <dd className="mt-1">{date(user.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Last sign-in</dt>
                      <dd className="mt-1">{date(user.last_sign_in_at)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </>
        )}
        {data && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-xs text-muted-foreground">
            <span>
              {data.total.toLocaleString()} accounts · Page {page + 1} of{" "}
              {Math.max(1, Math.ceil(data.total / 20))}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!page}
                aria-label="Previous users"
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * 20 >= data.total}
                aria-label="Next users"
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Active excludes blocked, deactivated and unaccepted invited accounts. New registrations
        cover the last 30 days.{" "}
        {actorRole === "admin"
          ? "You can manage registered users; other administrators are visible only to the Platform Owner."
          : ""}
      </p>
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>User details</DialogTitle>
            <DialogDescription>
              Account information, cricket history and administrative actions.
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <>
              <div className="flex gap-3 rounded-xl bg-muted/40 p-4">
                <Avatar user={detail} />
                <div className="min-w-0">
                  <h3 className="break-words font-bold">
                    {detail.full_name || "Name not provided"}
                  </h3>
                  <p className="break-all text-sm text-muted-foreground">{detail.email}</p>
                  <p className="mt-2 text-xs font-semibold">{roleLabel(detail.role)}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <Status status={detail.status} />
                <span>Joined {date(detail.created_at)}</span>
                <span>Last sign-in {date(detail.last_sign_in_at)}</span>
              </div>
              {details.isPending ? (
                <p role="status">Loading details…</p>
              ) : details.isError ? (
                <p role="alert" className="text-destructive">
                  Details unavailable. Access may have changed.
                </p>
              ) : (
                <>
                  {details.data?.reason && (
                    <p className="rounded-lg border border-border p-3 text-sm">
                      Account reason: {details.data.reason}
                    </p>
                  )}
                  <section>
                    <h3 className="mb-2 font-semibold">
                      Created tournaments ({detail.tournaments})
                    </h3>
                    {details.data?.tournaments.length ? (
                      details.data.tournaments.map((t) => (
                        <Link
                          key={t.id}
                          to="/t/$tournamentId"
                          params={{ tournamentId: t.id }}
                          className="block border-b border-border py-2 text-sm text-primary"
                        >
                          {t.name}
                        </Link>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No tournaments created.</p>
                    )}
                    {detail.tournaments > 100 && (
                      <p className="text-xs text-muted-foreground">
                        Showing the latest 100 tournaments.
                      </p>
                    )}
                  </section>
                  <section>
                    <h3 className="mb-2 font-semibold">Administrative history</h3>
                    {details.data?.history.length ? (
                      details.data.history.map((h, i) => (
                        <div key={i} className="border-b border-border py-3 text-sm">
                          <p className="font-medium capitalize">{h.action.replaceAll("_", " ")}</p>
                          {h.reason && <p className="mt-1">{h.reason}</p>}
                          <p className="mt-1 break-all text-xs text-muted-foreground">
                            {new Date(h.created_at).toLocaleString()} · Admin{" "}
                            {h.actor_id ?? "System"}
                          </p>
                          <details className="mt-1 text-xs">
                            <summary className="cursor-pointer text-primary">
                              Recorded changes
                            </summary>
                            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-2">
                              {JSON.stringify(h.changes, null, 2)}
                            </pre>
                          </details>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No administrative actions recorded.
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">Latest 50 actions.</p>
                  </section>
                </>
              )}
              <FeatureEditor target={detail} actorRole={actorRole} />
              <div className="flex flex-wrap gap-2">
                {userActions(actorRole, actorId, detail).map((action) => (
                  <Button
                    key={action}
                    variant="outline"
                    size="sm"
                    onClick={() => begin(detail, action)}
                  >
                    {labels[action]}
                  </Button>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={inviting || !!operation}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) {
            setInviting(false);
            setOperation(null);
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {inviting ? "Invite a new user" : currentAction ? labels[currentAction] : ""}
            </DialogTitle>
            <DialogDescription>
              {inviting
                ? "Send a secure invitation. The recipient chooses their own password."
                : `${operation?.user.full_name || "Account"} (${operation?.user.email})`}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit && !mutation.isPending) mutation.mutate();
            }}
          >
            {(inviting || currentAction === "edit") && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="managed-name">Full name</Label>
                  <Input
                    id="managed-name"
                    maxLength={100}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                {inviting ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="managed-email">Email address</Label>
                      <Input
                        id="managed-email"
                        type="email"
                        maxLength={254}
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="invite-role">Platform role</Label>
                      <select
                        id="invite-role"
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className={`${selectClass} w-full`}
                      >
                        <option value="user">Registered User</option>
                        {actorRole === "owner" && <option value="admin">Platform Admin</option>}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="managed-avatar">Avatar URL (optional, HTTPS)</Label>
                      <Input
                        id="managed-avatar"
                        type="url"
                        maxLength={2000}
                        value={avatar}
                        onChange={(e) => setAvatar(e.target.value)}
                        placeholder="https://…"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The login email remains unchanged. Email changes require the account holder's
                      verification.
                    </p>
                  </>
                )}
              </>
            )}
            {currentAction === "grant_admin" && (
              <p className="rounded-xl bg-muted p-4 text-sm">
                This user will gain access to platform administration and regular-user management.
                Their personal tournaments and scoring permissions will stay unchanged.
              </p>
            )}
            {currentAction === "revoke_admin" && (
              <p className="rounded-xl bg-muted p-4 text-sm">
                Administrative requests will be denied immediately. Their registered account and
                cricket history will remain available.
              </p>
            )}
            {currentAction === "block" && (
              <p className="rounded-xl bg-muted p-4 text-sm">
                Sign-in, protected actions and queued scoring synchronisation will be blocked until
                this account is unblocked. Public tournaments remain visible.
              </p>
            )}
            {currentAction === "deactivate" && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
                <p className="font-semibold">Recoverable deletion</p>
                <p className="mt-2">
                  This account owns {operation?.user.tournaments} tournaments. Access will be
                  deactivated. Tournaments, completed results, matches and player statistics will be
                  preserved. Permanent deletion is not available.
                </p>
              </div>
            )}
            {(currentAction === "unblock" || currentAction === "restore") && (
              <p className="text-sm">
                Restore normal account access. Existing tournaments and history remain intact.
              </p>
            )}
            {currentAction && currentAction !== "edit" && (
              <div className="space-y-2">
                <Label htmlFor="action-reason">
                  Reason{" "}
                  {["block", "deactivate"].includes(currentAction) ? "(required)" : "(optional)"}
                </Label>
                <textarea
                  id="action-reason"
                  required={["block", "deactivate"].includes(currentAction)}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="min-h-20 w-full rounded-lg border border-input bg-background p-3 text-sm"
                />
              </div>
            )}
            {currentAction === "deactivate" && (
              <div className="space-y-2">
                <Label htmlFor="confirm-email">Type the account email to confirm</Label>
                <Input
                  id="confirm-email"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="off"
                />
              </div>
            )}
            {mutation.isError && (
              <p role="alert" className="break-words text-sm text-destructive">
                {mutation.error.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => {
                  setInviting(false);
                  setOperation(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit || mutation.isPending}
                variant={currentAction === "deactivate" ? "destructive" : "default"}
              >
                {mutation.isPending ? (
                  "Working…"
                ) : inviting ? (
                  <>
                    <Mail size={16} className="mr-2" />
                    Send invitation
                  </>
                ) : currentAction === "edit" ? (
                  "Save changes"
                ) : (
                  "Confirm"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
