import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

/** Number box that lets you clear and retype freely; the value is clamped when you leave the box. */
export function NumField({ value, min, max, onChange, id }: { value: number; min: number; max: number; onChange: (n: number) => void; id?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (t: string) => {
    const n = Math.round(Number(t));
    const v = t.trim() === "" || !Number.isFinite(n) ? value : Math.max(min, Math.min(max, n));
    setText(String(v));
    if (v !== value) onChange(v);
  };
  return (
    <Input id={id} type="number" inputMode="numeric" min={min} max={max} value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isInteger(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={(e) => commit(e.target.value)} />
  );
}
