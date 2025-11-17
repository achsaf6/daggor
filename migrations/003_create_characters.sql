-- Create characters table for mobile player profiles
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  movement_speed numeric,
  token_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Maintain updated_at automatically
create or replace function public.set_current_timestamp_on_characters()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_current_timestamp_on_characters
  on public.characters;

create trigger set_current_timestamp_on_characters
before update on public.characters
for each row
execute procedure public.set_current_timestamp_on_characters();

-- Row Level Security so the client (anon) key can use it
alter table public.characters enable row level security;

drop policy if exists "characters select" on public.characters;
create policy "characters select"
  on public.characters for select using (true);

drop policy if exists "characters insert" on public.characters;
create policy "characters insert"
  on public.characters for insert
  with check (true);

drop policy if exists "characters update" on public.characters;
create policy "characters update"
  on public.characters for update
  using (true);


