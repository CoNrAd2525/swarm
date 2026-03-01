create extension if not exists pgcrypto;
create table if not exists revenue_events (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,
  source text,
  amount numeric(18,2) not null default 0,
  currency text not null default 'USD',
  status text not null default 'pending',
  occurred_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists revenue_events_status_idx on revenue_events(status);
create index if not exists revenue_events_occurred_idx on revenue_events(occurred_at);
create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,
  revenue_external_id text references revenue_events(external_id),
  rail text not null,
  amount numeric(18,2) not null default 0,
  currency text not null default 'USD',
  status text not null default 'prepared',
  txid text,
  paid_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payouts_status_idx on payouts(status);
create index if not exists payouts_paid_idx on payouts(paid_at);
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_revenue_events_updated_at'
  ) then
    create trigger trg_revenue_events_updated_at before update on revenue_events
      for each row execute function set_updated_at();
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_payouts_updated_at'
  ) then
    create trigger trg_payouts_updated_at before update on payouts
      for each row execute function set_updated_at();
  end if;
end$$;
