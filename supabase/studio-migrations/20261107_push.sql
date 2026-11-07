-- Studio iPhone push notifications (FEAT-CLA-027). Run in the clarendon-studio SQL editor.
create table if not exists studio_devices (
  token text primary key,                       -- APNs device token (hex)
  platform text not null default 'ios',
  env text not null default 'production',       -- 'production' | 'sandbox' (dev-signed builds use the sandbox gateway)
  app_version text,
  device_name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz                       -- set when APNs says Unregistered / BadDeviceToken
);
create table if not exists studio_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                           -- 'suggestion' | 'review' | 'comment' | 'message' | 'feedback' | 'transactions' | 'bank' | 'insights' | 'sales' | 'test'
  title text not null,
  body text not null,
  link text,                                    -- studio://inbox, studio://money/triage, studio://grow/ads …
  dedupe_key text unique,                       -- same key never sends twice
  app_id text,
  sent_at timestamptz,
  sent_to int not null default 0,
  error text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists studio_notifications_created_idx on studio_notifications (created_at desc);
-- Small key/value cursor store for the digest (what has already been seen).
create table if not exists studio_push_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table studio_devices enable row level security;
alter table studio_notifications enable row level security;
alter table studio_push_state enable row level security;
-- Service role only (the server writes; the app reads through /api/push).

-- APPLIED 2026-11-07 (tables) by the master project via the Supabase connector. Scheduler: 20261107_push_cron.sql.
