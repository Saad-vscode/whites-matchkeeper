import { useRef, useState } from "react";
import { ImagePlus, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function LogoUpload({
  value,
  onChange,
  disabled = false,
  label = "logo",
  onProcessingChange,
}: {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  label?: string;
  onProcessingChange?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function select(file?: File) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      toast.error("Choose a PNG, JPG or WebP image up to 5 MB.");
      return;
    }
    setBusy(true);
    onProcessingChange?.(true);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error();
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      onChange(canvas.toDataURL("image/webp", 0.85));
    } catch {
      toast.error("Could not read this image. Please choose another.");
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
      onProcessingChange?.(false);
    }
  }
  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp"
        aria-label={`Choose ${label}`}
        onChange={(e) => {
          void select(e.target.files?.[0]);
          e.target.value = "";
        }}
        disabled={disabled || busy}
      />
      <div className="flex items-center gap-3">
        {value ? (
          <img
            src={value}
            alt={`${label} preview`}
            className="h-12 w-12 rounded-lg border object-contain p-1"
          />
        ) : (
          <ImagePlus className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        )}
        <Button
          type="button"
          variant="outline"
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Upload />}
          {busy ? "Preparing…" : value ? `Change ${label}` : `Upload ${label}`}
        </Button>
        {value && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Remove ${label}`}
            disabled={disabled || busy}
            onClick={() => onChange("")}
          >
            <X />
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">PNG, JPG or WebP · Up to 5 MB</p>
    </div>
  );
}
