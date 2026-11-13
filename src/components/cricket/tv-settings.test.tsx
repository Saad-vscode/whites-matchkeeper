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
  const values = new Map<string,string>();
  vi.stubGlobal("localStorage", {
    getItem: (key:string)=>values.get(key) ?? null,
    setItem: (key:string,value:string)=>values.set(key,String(value)),
    removeItem: (key:string)=>values.delete(key),
    clear: ()=>values.clear(),
  });
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers()});
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
