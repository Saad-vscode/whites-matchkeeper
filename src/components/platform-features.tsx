import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, RotateCcw, Save, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDirectory, roleLabel, type ManagedUser } from "@/lib/platform-users";
import type { PlatformRole } from "@/lib/platform-admin";
import { featureDetails, saveFeatures, type FeatureAccess } from "@/lib/feature-access";

export function FeatureEditor({
  target,
  actorRole,
}: {
  target: ManagedUser;
  actorRole: PlatformRole;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["platform-features", target.id],
    queryFn: () => featureDetails(target.id),
    retry: false,
    gcTime: 0,
    refetchInterval: 10000,
  });
  const [draft, setDraft] = useState<Partial<FeatureAccess>>({});
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setDraft({});
    setReset(false);
    setMessage("");
  }, [target.id]);
  const editable =
    target.status === "active" &&
    (actorRole === "owner" || (actorRole === "admin" && target.role === "user"));
  const rows = query.isError ? [] : (query.data ?? []);
  const enabled = rows.filter((row) =>
    reset ? row.default_enabled : (draft[row.id] ?? row.enabled),
  ).length;
  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      await saveFeatures(target.id, draft, reset);
      setDraft({});
      setReset(false);
      await Promise.all([
        query.refetch(),
        client.invalidateQueries({ queryKey: ["feature-access"] }),
        client.invalidateQueries({ queryKey: ["platform-user-details"] }),
      ]);
      setMessage("Permissions saved. Connected devices refresh within five seconds.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <SlidersHorizontal size={19} className="text-primary" />
            Feature permissions
          </h2>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {target.full_name || target.email} · {roleLabel(target.role)}
          </p>
        </div>
        {!!rows.length && (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {enabled} enabled · {rows.length - enabled} restricted
          </span>
        )}
      </header>
      <p className="text-xs leading-relaxed text-muted-foreground">
        TV and tournament features follow the organizer’s permissions. Sound and offline scoring
        follow the signed-in scorer. Saved preferences are preserved.
      </p>
      {query.isPending && <p role="status">Loading permissions…</p>}
      {query.isError && (
        <p role="alert">
          Unable to verify permissions.{" "}
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </p>
      )}
      {!editable && (
        <p className="text-sm text-muted-foreground">
          These permissions are read-only for this administrator or account status.
        </p>
      )}
      {Array.from(new Set(rows.map((row) => row.category))).map((category) => (
        <fieldset disabled={!editable || busy} key={category} className="space-y-1">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-primary">
            {category}
          </legend>
          <div className="divide-y divide-border">
            {rows
              .filter((row) => row.category === category)
              .map((row) => (
                <label
                  key={row.id}
                  className="flex cursor-pointer items-center justify-between gap-4 py-3"
                >
                  <span className="min-w-0">
                    <strong className="block text-sm font-semibold">{row.label}</strong>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {row.changed_at
                        ? `${row.administrator ?? "Administrator"} · ${new Date(row.changed_at).toLocaleString()}`
                        : "Default access · Enabled"}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0 accent-primary"
                    checked={reset ? row.default_enabled : (draft[row.id] ?? row.enabled)}
                    onChange={(event) => {
                      setReset(false);
                      setDraft((current) => ({
                        ...(reset
                          ? Object.fromEntries(rows.map((item) => [item.id, item.default_enabled]))
                          : current),
                        [row.id]: event.target.checked,
                      }));
                    }}
                  />
                </label>
              ))}
          </div>
        </fieldset>
      ))}
      {editable && !!rows.length && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setReset(false);
              setDraft(Object.fromEntries(rows.map((row) => [row.id, true])));
            }}
          >
            <CheckCheck size={16} />
            Enable all
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setReset(true);
              setDraft({});
            }}
          >
            <RotateCcw size={16} />
            Reset to defaults
          </Button>
          <Button
            disabled={busy || (!reset && !Object.keys(draft).length)}
            onClick={() => void save()}
          >
            <Save size={16} />
            {busy ? "Saving…" : "Save permissions"}
          </Button>
        </div>
      )}
      {reset && (
        <p className="text-xs text-muted-foreground">
          Default access will be restored when you save.
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}

export function PlatformFeatures({ actorRole }: { actorRole: PlatformRole }) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [target, setTarget] = useState<ManagedUser | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const users = useQuery({
    queryKey: ["feature-users", term, page],
    queryFn: () =>
      getDirectory({ search: term, role: "all", status: "active", sort: "name", page }),
    gcTime: 0,
    retry: false,
    refetchInterval: 10000,
  });
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
      <section className="rounded-2xl border border-border bg-card p-4">
        <label
          className="mb-3 flex items-center gap-2 text-sm font-semibold"
          htmlFor="feature-user-search"
        >
          <Search size={16} />
          Find an account
        </label>
        <Input
          id="feature-user-search"
          placeholder="Name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {users.isPending ? (
          <p className="py-4" role="status">
            Loading accounts…
          </p>
        ) : users.isError ? (
          <p role="alert" className="py-4">
            Unable to load accounts.{" "}
            <Button variant="outline" onClick={() => void users.refetch()}>
              Retry
            </Button>
          </p>
        ) : (
          <>
            <div className="my-3 max-h-[28rem] space-y-1 overflow-y-auto">
              {users.data?.rows.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setTarget(user)}
                  aria-pressed={target?.id === user.id}
                  className={`w-full rounded-xl p-3 text-left ${target?.id === user.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                >
                  <strong className="block truncate text-sm">{user.full_name || user.email}</strong>
                  <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                </button>
              ))}
              {!users.data?.rows.length && (
                <p className="py-4 text-sm text-muted-foreground">No matching accounts.</p>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!page}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-xs">Page {page + 1}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={(page + 1) * 20 >= (users.data?.total ?? 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </section>
      {target ? (
        <FeatureEditor key={target.id} target={target} actorRole={actorRole} />
      ) : (
        <section className="rounded-2xl border border-dashed border-border p-8">
          <SlidersHorizontal className="mb-3 text-primary" />
          <h2 className="font-bold">Access that fits each organizer</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Select an account to review its features. Existing accounts keep all features until an
            administrator changes their permissions.
          </p>
        </section>
      )}
    </div>
  );
}
