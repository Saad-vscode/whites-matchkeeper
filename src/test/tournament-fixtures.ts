import type { Tables } from "@/integrations/supabase/types";
import type { TournamentDelivery } from "@/lib/cricket/tournament-summary";

export const tournamentFixture = (patch: Partial<Tables<"tournaments">> = {}): Tables<"tournaments"> => ({
  id:"tour",created_by:"owner",created_at:"2026-11-06",name:"Test Cup",short_name:"TC",logo_url:null,primary_color:"#009688",accent_color:"#eeeeee",location:null,description:null,start_date:null,end_date:null,competition_format:"league",ranking_rule:"points_nrr_wins",overs:1,balls_per_over:6,players_per_team:2,points_win:2,points_tie:1,points_loss:0,points_no_result:1,rules:{},...patch,
});
export const teamFixture = (id: string, name: string): Tables<"tournament_teams"> => ({id,name,tournament_id:"tour",created_at:"2026-11-06",short_name:null,color:"#009688",logo_url:null,captain:null,players:["Alex","Sam"]});
export const matchFixture = (patch: Partial<Tables<"matches">> = {}): Tables<"matches"> => ({
  id:"match",tournament_id:"tour",created_by:"owner",created_at:"2026-11-06",updated_at:"2026-11-06",name:"Test Cup",team_a:"Lions",team_b:"Eagles",team_a_id:"a",team_b_id:"b",team_a_players:["Alex","Sam"],team_b_players:["Alex","Lee"],toss_winner:"A",toss_decision:"bat",overs:1,balls_per_over:6,players_per_team:2,live:{innings:2},rules:{},score_revision:0,status:"completed",match_date:null,scheduled_time:null,venue:null,result:null,...patch,
});
export const deliveryFixture = (patch: Partial<TournamentDelivery> = {}): TournamentDelivery => ({id:"ball",match_id:"match",innings:1,seq:1,striker:"Alex",non_striker:"Sam",bowler:"Alex",runs_bat:0,extra_type:"none",extras:0,wicket:null,...patch});
