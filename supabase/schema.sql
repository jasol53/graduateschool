-- Supabase Dashboard > SQL Editor에서 한 번 실행하세요.
create table if not exists public.research_projects (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.research_projects enable row level security;
create policy "owner read" on public.research_projects for select to authenticated using ((select auth.uid()) = user_id);
create policy "owner insert" on public.research_projects for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "owner update" on public.research_projects for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists public.research_ai_usage (
 user_id uuid not null references auth.users(id) on delete cascade,
 day date not null,
 calls integer not null default 0,
 primary key(user_id,day)
);
alter table public.research_ai_usage enable row level security;
-- 비용 보호: 원자적 일일 사용량 제한. service_role만 실행 가능.
create or replace function public.reserve_research_ai_call(p_user uuid,p_daily_limit integer default 15)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_calls integer;
begin
 if p_daily_limit < 1 or p_daily_limit > 100 then raise exception 'invalid limit'; end if;
 insert into public.research_ai_usage(user_id, day, calls) values(p_user,(now() at time zone 'UTC')::date,1)
 on conflict (user_id,day) do update set calls=public.research_ai_usage.calls+1
 where public.research_ai_usage.calls < p_daily_limit
 returning calls into v_calls;
 return coalesce(v_calls,0);
end $$;
revoke all on function public.reserve_research_ai_call(uuid,integer) from public, anon, authenticated;
grant execute on function public.reserve_research_ai_call(uuid,integer) to service_role;
