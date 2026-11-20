const featureState = vi.hoisted(() => ({ restricted: false }));
vi.mock("@/lib/feature-access", async (original) => { const module = await original<typeof import("@/lib/feature-access")>(); const access = module.allFeatures(true); return { ...module, useFeatureAccess: () => ({ allows: () => !featureState.restricted, access }) }; });
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
vi.mock("@tanstack/react-router",()=>({createFileRoute:()=> (config:unknown)=>({options:config})}));
vi.mock("./bits",()=>({SiteHeader:()=>null}));
vi.mock("./match-audio",()=>({MatchAudio:()=>null}));
import { Route } from "@/routes/settings";
import { readAnimationSettings } from "@/lib/cricket/tv-settings";
const Settings=Route.options.component as ComponentType;
beforeEach(()=>{
  featureState.restricted = false;
  const values = new Map<string,string>();
  vi.stubGlobal("localStorage", {
    getItem: (key:string)=>values.get(key) ?? null,
    setItem: (key:string,value:string)=>values.set(key,String(value)),
    removeItem: (key:string)=>values.delete(key),
    clear: ()=>values.clear(),
  });
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers()});
it("inherits legacy wicket opt-outs for new dismissals but respects explicit choices",()=>{
  localStorage.setItem("crease-tv-animations",JSON.stringify({events:{wicket:false}}));
  expect(readAnimationSettings().events).toMatchObject({caught:false,stumped:false});
  localStorage.setItem("crease-tv-animations",JSON.stringify({events:{wicket:false,caught:true}}));
  expect(readAnimationSettings().events).toMatchObject({caught:true,stumped:false});
});
it("persists individual choices and receives changes from another TV tab",()=>{
  render(<Settings/>);
  fireEvent.click(screen.getByRole("checkbox",{name:/^Four /}));
  expect(readAnimationSettings().events.four).toBe(false);
  const next={...readAnimationSettings(),enabled:false};
  localStorage.setItem("crease-tv-animations",JSON.stringify(next));
  act(()=>window.dispatchEvent(new Event("storage")));
  expect(screen.getByRole("checkbox",{name:"Enable match animations"})).not.toBeChecked();
});
it("previews without a match and closes after the configured duration",()=>{
  vi.useFakeTimers();render(<Settings/>);
  fireEvent.change(screen.getByRole("combobox",{name:"Animation duration"}),{target:{value:"2000"}});
  fireEvent.click(screen.getByRole("button",{name:"Wickets"}));
  fireEvent.click(screen.getByRole("button",{name:"Preview Golden duck!"}));
  expect(screen.getByRole("dialog",{name:"Animation preview"})).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveAccessibleName("Golden duck! · Sample player");
  act(()=>vi.advanceTimersByTime(2000));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("recovers safe defaults from corrupt stored preferences",()=>{
  localStorage.setItem("crease-tv-animations",'not-json');
  expect(readAnimationSettings().duration).toBe(2800);
  localStorage.setItem("crease-tv-animations",JSON.stringify({duration:90000,motion:"unknown",events:{four:false}}));
  expect(readAnimationSettings()).toMatchObject({duration:2800,motion:"full",events:{four:false,six:true}});
});

it("hides restricted settings and restores the saved selections", () => {
 const view = render(<Settings />);
 fireEvent.click(screen.getByRole("checkbox", { name: /^Four / }));
 featureState.restricted = true;
 view.rerender(<Settings />);
 expect(screen.queryByRole("checkbox", { name: "Enable match animations" })).toBeNull();
 expect(screen.queryByRole("combobox", { name: "Color theme" })).toBeNull();
 expect(screen.queryByText("Victory celebrations & tournament honours")).toBeNull();
 featureState.restricted = false;
 view.rerender(<Settings />);
 expect(screen.getByRole("checkbox", { name: /^Four / })).not.toBeChecked();
});
