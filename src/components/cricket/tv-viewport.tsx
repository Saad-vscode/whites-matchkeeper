import { useEffect, useRef, useState, type ReactNode } from "react";

/** Fit the entire broadcast after text, theme, award or screen-size changes. */
export function TvViewport({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    let raf = 0;
    const fit = () => {
      window.clearTimeout(raf);
      raf = window.setTimeout(() => {
        if (!frame.current || !canvas.current) return;
        const next = Math.min(1, frame.current.clientWidth / Math.max(1, canvas.current.scrollWidth + 1),
          frame.current.clientHeight / Math.max(1, canvas.current.scrollHeight + 1));
        setScale(previous => Math.abs(previous - next) < .001 ? previous : next);
      });
    };
    const resize = new ResizeObserver(fit);
    if (frame.current) resize.observe(frame.current);
    if (canvas.current) resize.observe(canvas.current);
    const mutation = new MutationObserver(fit);
    if (canvas.current) mutation.observe(canvas.current, { childList: true, subtree: true, characterData: true, attributes: true });
    window.addEventListener("resize", fit);
    document.addEventListener("visibilitychange", fit);
    fit();
    return () => { window.clearTimeout(raf); resize.disconnect(); mutation.disconnect(); window.removeEventListener("resize", fit); document.removeEventListener("visibilitychange", fit); };
  }, []);
  return <div className="tv-viewport" ref={frame}><div className="tv-canvas" ref={canvas} style={{ transform: "translateX(-50%) scale(" + scale + ")" }}>{children}</div></div>;
}
