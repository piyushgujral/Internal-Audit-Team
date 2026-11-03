-- AuditFlow initial schema
-- Run in Supabase SQL Editor. No secrets belong in this file.
create extension if not exists pgcrypto;

create type public.app_role as enum ('admin','manager','senior','auditor','read_only');
create type public.task_status as enum ('pending','in_progress','under_review','completed','on_hold');
create type public.engagement_status as enum ('planning','fieldwork','review','reporting','closed');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 full_name text,
 role public.app_role not null default 'auditor',
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.clients (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 industry text,
 contact_name text,
 contact_email text,
 is_active boolean not null default true,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table public.client_memberships (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 access_level public.app_role not null default 'auditor',
 created_at timestamptz not null default now(),
 unique(client_id,user_id)
);

create table public.engagements (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 name text not null,
 financial_year text,
 start_date date,
 target_end_date date,
 status public.engagement_status not null default 'planning',
 engagement_lead uuid references public.profiles(id),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

alter table public.engagements add constraint engagements_id_client_id_key unique(id,client_id);

create table public.tasks (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 engagement_id uuid not null references public.engagements(id) on delete cascade,
 parent_task_id uuid references public.tasks(id) on delete set null,
 title text not null,
 description text,
 area text,
 subtask text,
 assignee_id uuid references public.profiles(id),
 assignee_name text,
 reviewer_id uuid references public.profiles(id),
 reviewer_name text,
 priority text not null default 'medium' check(priority in ('high','medium','low')),
 status public.task_status not null default 'pending',
 progress integer not null default 0 check(progress between 0 and 100),
 start_date date,
 due_date date,
 completed_at timestamptz,
 budgeted_hours numeric(10,2) not null default 0 check(budgeted_hours >= 0),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint task_engagement_client_match foreign key (engagement_id,client_id) references public.engagements(id,client_id)
);
create index tasks_client_due_idx on public.tasks(client_id,due_date);
create index tasks_assignee_idx on public.tasks(assignee_id,status);
create index memberships_user_idx on public.client_memberships(user_id,client_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 insert into public.profiles(id,email,full_name)
 values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''));
 return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_role()
returns public.app_role language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() and is_active=true $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select coalesce(public.current_role()='admin',false) $$;

create or replace function public.can_access_client(cid uuid)
returns boolean language sql stable security definer set search_path=public
as $$
 select public.is_admin() or exists(
  select 1 from public.client_memberships m
  where m.client_id=cid and m.user_id=auth.uid()
 )
$$;

create or replace function public.can_manage_client(cid uuid)
returns boolean language sql stable security definer set search_path=public
as $$
 select public.is_admin() or exists(
  select 1 from public.client_memberships m
  where m.client_id=cid and m.user_id=auth.uid()
  and m.access_level in ('manager','senior')
 )
$$;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.client_memberships enable row level security;
alter table public.engagements enable row level security;
alter table public.tasks enable row level security;

create policy "profiles self or admin read" on public.profiles for select
 using(id=auth.uid() or public.is_admin());
create policy "profiles admin update" on public.profiles for update
 using(public.is_admin()) with check(public.is_admin());

create policy "clients accessible read" on public.clients for select
 using(public.can_access_client(id));
create policy "clients admin create" on public.clients for insert
 with check(public.is_admin() and created_by=auth.uid());
create policy "clients admin update" on public.clients for update
 using(public.is_admin()) with check(public.is_admin());
create policy "clients admin delete" on public.clients for delete
 using(public.is_admin());

create policy "memberships self or admin read" on public.client_memberships for select
 using(user_id=auth.uid() or public.is_admin() or public.can_manage_client(client_id));
create policy "memberships admin manage" on public.client_memberships for all
 using(public.is_admin()) with check(public.is_admin());

create policy "engagements accessible read" on public.engagements for select
 using(public.can_access_client(client_id));
create policy "engagements manager create" on public.engagements for insert
 with check(public.can_manage_client(client_id) and created_by=auth.uid());
create policy "engagements manager update" on public.engagements for update
 using(public.can_manage_client(client_id)) with check(public.can_manage_client(client_id));
create policy "engagements admin delete" on public.engagements for delete
 using(public.is_admin());

create policy "tasks accessible read" on public.tasks for select
 using(public.can_access_client(client_id) or assignee_id=auth.uid() or reviewer_id=auth.uid());
create policy "tasks manager create" on public.tasks for insert
 with check(public.can_manage_client(client_id) and created_by=auth.uid());
create policy "tasks manager or assignee update" on public.tasks for update
 using(public.can_manage_client(client_id) or assignee_id=auth.uid() or reviewer_id=auth.uid())
 with check(public.can_access_client(client_id));
create policy "tasks manager delete" on public.tasks for delete
 using(public.can_manage_client(client_id));

-- NOTE: Admin provisioning and client membership grants should be performed only by a trusted admin.
