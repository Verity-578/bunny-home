-- Bunny's Home database schema (Supabase SQL Editor)
-- Run this after creating your Supabase project.

create extension if not exists "pgcrypto";

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null default '新对话',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,
  reasoning_content text,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_session
  on public.messages(session_id, created_at);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  session_id text not null default 'global',
  summary text not null,
  conversation_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.settings (
  id integer primary key default 1 check (id = 1),
  session_id text not null default 'global',
  system_prompt text,
  temperature numeric(4,2) not null default 0.7,
  max_context_rounds integer not null default 20,
  max_context_tokens integer not null default 8000,
  compress_threshold integer not null default 12000,
  compress_keep_rounds integer not null default 10,
  max_reply_tokens integer not null default 2000,
  theme_color text not null default '#2e7d91',
  persona_prompt text,
  language_style_prompt text,
  proactive_enabled boolean not null default false,
  proactive_interval_minutes integer not null default 180,
  proactive_batch_count integer not null default 1,
  proactive_quiet_start text not null default '23:00',
  proactive_quiet_end text not null default '08:00',
  last_proactive_at timestamptz,
  memory_collection_enabled boolean not null default true,
  memory_every_messages integer not null default 8,
  updated_at timestamptz not null default now()
);

insert into public.settings (id) values (1)
on conflict (id) do nothing;

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_favorites_session
  on public.favorites(session_id, created_at);

alter table public.settings
  add column if not exists theme_color text not null default '#2e7d91';

alter table public.settings
  add column if not exists persona_prompt text;

alter table public.settings
  add column if not exists language_style_prompt text;

alter table public.settings
  add column if not exists proactive_enabled boolean not null default false;

alter table public.settings
  add column if not exists proactive_interval_minutes integer not null default 180;

alter table public.settings
  add column if not exists proactive_batch_count integer not null default 1;

alter table public.settings
  add column if not exists proactive_quiet_start text not null default '23:00';

alter table public.settings
  add column if not exists proactive_quiet_end text not null default '08:00';

alter table public.settings
  add column if not exists last_proactive_at timestamptz;

alter table public.settings
  add column if not exists memory_collection_enabled boolean not null default true;

alter table public.settings
  add column if not exists memory_every_messages integer not null default 8;

create table if not exists public.memory_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'memory' check (kind in ('memory', 'diary', 'preference', 'relationship')),
  title text not null default '',
  content text not null,
  importance numeric(5,2) not null default 1,
  tags jsonb not null default '[]'::jsonb,
  source_session_id uuid references public.sessions(id) on delete set null,
  diary_date text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_memory_entries_created
  on public.memory_entries(created_at desc);

create unique index if not exists idx_memory_entries_diary_date
  on public.memory_entries(diary_date) where kind = 'diary' and diary_date is not null;
