import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function AssignMatchScorer({
  matchId,
  matchName,
  disabled,
}: {
  matchId: string;
  matchName: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const qc = useQueryClient();
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value);
          setError("");
          if (!value) setEmail("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          Assign scorer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign scorer</DialogTitle>
          <DialogDescription>
            {matchName}. Enter the email of someone who already has an account. Existing scorers
            keep their access.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || !email.trim()) return;
            setBusy(true);
            setError("");
            try {
              const { error: failure } = await supabase.rpc("assign_scorer", {
                _match: matchId,
                _email: email.trim().toLowerCase(),
              });
              if (failure) throw new Error(failure.message);
              await qc.invalidateQueries({ queryKey: ["tournament-permissions"] });
              toast.success("Scorer assigned");
              setOpen(false);
              setEmail("");
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Could not assign scorer. Please try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block space-y-2 text-sm font-medium">
            <span>Scorer email</span>
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="scorer@example.com"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button disabled={busy || !email.trim()}>
              {busy ? "Assigning…" : "Confirm assignment"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setEmail("");
                setError("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
