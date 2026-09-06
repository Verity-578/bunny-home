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
  updated_at timestamptz not null default now()
);

insert into public.settings (id) values (1)
on conflict (id) do nothing;
