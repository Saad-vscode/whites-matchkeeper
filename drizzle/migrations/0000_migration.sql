create type public.app_role as enum ('admin','user');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid(),
  name text not null,
  team_a text not null,
  team_b text not null,
  team_a_players text[] not null default '{}',
  team_b_players text[] not null default '{}',
  players_per_team int not null default 11 check (players_per_team between 2 and 15),
  overs int not null default 20 check (overs between 1 and 100),
  balls_per_over int not null default 6 check (balls_per_over between 1 and 12),
  venue text,
  match_date date,
  rules jsonb not null default '{}'::jsonb,
  status text not null default 'scheduled' check (status in ('scheduled','live','paused','innings_break','completed','abandoned','cancelled')),
  toss_winner text check (toss_winner in ('A','B')),
  toss_decision text check (toss_decision in ('bat','bowl')),
  live jsonb not null default '{}'::jsonb,
  result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.matches to anon;
grant select, insert, update, delete on public.matches to authenticated;
grant all on public.matches to service_role;
alter table public.matches enable row level security;

create table public.match_scorers (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null,
  email text,
  primary key (match_id, user_id)
);
grant select, delete on public.match_scorers to authenticated;
grant all on public.match_scorers to service_role;
alter table public.match_scorers enable row level security;

create or replace function public.is_match_owner(_match uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.matches where id = _match and created_by = auth.uid())
    or public.has_role(auth.uid(), 'admin')
$$;
create or replace function public.can_score(_match uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_match_owner(_match)
    or exists (select 1 from public.match_scorers where match_id = _match and user_id = auth.uid())
$$;

create policy "matches public read" on public.matches for select to anon, authenticated using (true);
create policy "matches create own" on public.matches for insert to authenticated with check (created_by = auth.uid());
create policy "matches update by scorers" on public.matches for update to authenticated using (public.can_score(id)) with check (public.can_score(id));
create policy "matches delete by owner" on public.matches for delete to authenticated using (public.is_match_owner(id));

create policy "scorers visible to owner or self" on public.match_scorers for select to authenticated using (user_id = auth.uid() or public.is_match_owner(match_id));
create policy "scorers removable by owner" on public.match_scorers for delete to authenticated using (public.is_match_owner(match_id));

create or replace function public.assign_scorer(_match uuid, _email text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_match_owner(_match) then raise exception 'Not allowed'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(_email));
  if uid is null then raise exception 'No account found with that email'; end if;
  insert into public.match_scorers(match_id, user_id, email) values (_match, uid, lower(trim(_email))) on conflict do nothing;
end $$;
revoke execute on function public.assign_scorer(uuid, text) from anon, public;
grant execute on function public.assign_scorer(uuid, text) to authenticated;

create table public.deliveries (
  id uuid primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  innings int not null check (innings in (1,2)),
  seq int not null check (seq >= 1),
  striker text not null,
  non_striker text not null,
  bowler text not null,
  runs_bat int not null default 0 check (runs_bat between 0 and 12),
  extra_type text not null default 'none' check (extra_type in ('none','wide','noball','bye','legbye','penalty')),
  extras int not null default 0 check (extras between 0 and 20),
  wicket jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (match_id, innings, seq)
);
grant select on public.deliveries to anon;
grant select, insert, delete on public.deliveries to authenticated;
grant all on public.deliveries to service_role;
alter table public.deliveries enable row level security;
create policy "deliveries public read" on public.deliveries for select to anon, authenticated using (true);
create policy "deliveries insert by scorers" on public.deliveries for insert to authenticated with check (public.can_score(match_id) and created_by = auth.uid());
create policy "deliveries delete by scorers" on public.deliveries for delete to authenticated using (public.can_score(match_id));

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
create trigger matches_touch before update on public.matches for each row execute function public.touch_updated_at();

alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.deliveries;
alter table public.matches replica identity full;
alter table public.deliveries replica identity full;