vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/components/cricket/tournament-name", () => ({ TournamentName: () => null }));
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (config: unknown) => config, Link: () => null }));
vi.mock("@/lib/feature-access", async (original) => { const mod = await original<typeof import("@/lib/feature-access")>(); return { ...mod, useFeatureAccess: () => ({allows: () => true, access: mod.allFeatures(true)}) }; });
import { PlayoffDecider, Scorer } from "@/routes/_authenticated/score.$matchId";
import { Scorecard, Balls } from "@/routes/match.$matchId";
import { supabase } from "@/integrations/supabase/client";
import { derive } from "@/lib/cricket/match";
import { deliveryFixture as ball, matchFixture as match } from "@/test/tournament-fixtures";
import type { useScoring } from "@/lib/cricket/use-scoring";
const regulation = [ball({innings:1}),ball({innings:2})];
const supers = ([3,4] as const).flatMap(innings => Array.from({length:6},(_,i)=>ball({id: innings+'-'+i, innings,seq:i+1})));
function setup(toss=false) {
 const m=match({overs:1,balls_per_over:1,status:'paused',rules:{playoffNode:'final'},live:{innings:toss?4:2}});
 const ds=toss?[...regulation,...supers]:regulation;
 const mutate=vi.fn().mockResolvedValue(true);
 const lm={match:m,derived:derive(m,ds),deliveries:ds,mutate,pending:0,online:true,syncing:false,conflict:false} as unknown as ReturnType<typeof useScoring>;
 return {lm,mutate};
}
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('starts the Super Over through the durable operation after checking backend support',async()=>{
 vi.spyOn(supabase,'rpc').mockResolvedValue({data:true,error:null} as never);
 const {lm,mutate}=setup();render(<PlayoffDecider lm={lm} onUndo={()=>{}}/>);
 expect(screen.getByText(/Eagles bats first/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Start Super Over'}));
 await waitFor(()=>expect(mutate).toHaveBeenCalledWith(expect.objectContaining({kind:'state',patch:{live:{innings:3},status:'innings_break',tie_break_toss_winner:null}})));
});
it('requires a toss winner and preserves the original toss fields',async()=>{
 vi.spyOn(supabase,'rpc').mockResolvedValue({data:true,error:null} as never);
 const {lm,mutate}=setup(true);render(<PlayoffDecider lm={lm} onUndo={()=>{}}/>);
 const confirm=screen.getByRole('button',{name:'Confirm toss winner and finish match'});expect(confirm).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Toss winner'),{target:{value:'B'}});fireEvent.click(confirm);
 await waitFor(()=>expect(mutate).toHaveBeenCalledWith(expect.objectContaining({patch:{tie_break_toss_winner:'B',status:'completed'}})));
});
it('blocks confirmation until queued deliveries have synchronized',()=>{
 const {lm}=setup();render(<PlayoffDecider lm={{...lm,pending:1}} onUndo={()=>{}}/>);
 expect(screen.getByRole('button',{name:'Start Super Over'})).toBeDisabled();
});
it('shows separate Super Over scorecard and ball-log selectors',()=>{
 const {lm}=setup(true),d=lm.derived!;
 const view=render(<Scorecard match={lm.match!} d={d} inn1={[regulation[0]!]} inn2={[regulation[1]!]}/>);
 expect(screen.getByRole('button',{name:'Super Over - Eagles'})).toBeInTheDocument();
 view.unmount();render(<Balls d={d} inn1={[regulation[0]!]} inn2={[regulation[1]!]} n1='Lions' n2='Eagles'/>);
 expect(screen.getByRole('button',{name:'Super Over - Eagles'})).toBeInTheDocument();
});
it('pauses a tied final Super Over ball for the deciding toss',async()=>{
 const {lm,mutate}=setup(true);
 const m={...lm.match!,status:'live',live:{innings:4,striker:'Alex',nonStriker:'Sam',bowler:'Lee'}};
 const ds=lm.deliveries.slice(0,-1);
 render(<Scorer lm={{...lm,match:m,deliveries:ds,derived:derive(m,ds)}}/>);
 fireEvent.click(screen.getByRole('button',{name:'0'}));
 await waitFor(()=>expect(mutate).toHaveBeenCalledWith(expect.objectContaining({kind:'ball',delivery:expect.objectContaining({innings:4,seq:6}),patch:expect.objectContaining({status:'paused',live:{innings:4}})})));
});

it('pauses a tied regulation playoff instead of completing the match',async()=>{
 const {lm,mutate}=setup();
 const m={...lm.match!,status:'live',live:{innings:2,striker:'Alex',nonStriker:'Sam',bowler:'Lee'}};
 const ds=[regulation[0]!];
 render(<Scorer lm={{...lm,match:m,deliveries:ds,derived:derive(m,ds)}}/>);
 fireEvent.click(screen.getByRole('button',{name:'0'}));
 await waitFor(()=>expect(mutate).toHaveBeenCalledWith(expect.objectContaining({kind:'ball',patch:expect.objectContaining({status:'paused',live:{innings:2}})})));
});

it('reopens a mistaken deciding toss without removing any delivery',()=>{
 const {lm,mutate}=setup(true),m={...lm.match!,status:'completed',tie_break_toss_winner:'B'};
 render(<Scorer lm={{...lm,match:m,derived:derive(m,lm.deliveries)}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Correct deciding toss'}));
 expect(mutate).toHaveBeenCalledWith(expect.objectContaining({kind:'state',delivery:null,patch:{tie_break_toss_winner:null,status:'paused'}}));
});
