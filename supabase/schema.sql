create extension if not exists pgcrypto;

create table if not exists recipe_groups (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  canonical_name text not null,
  category text not null default 'Autres',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recipe_versions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipe_groups(id) on delete cascade,
  version_label text not null,
  source_type text not null check (source_type in ('url','pdf','image','manual')),
  source_name text,
  source_url text,
  source_file_name text,
  servings text,
  ingredients jsonb not null default '[]'::jsonb,
  equipment jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  times jsonb not null default '{}'::jsonb,
  temperatures jsonb not null default '[]'::jsonb,
  allergens text[] not null default '{}',
  notes text,
  raw_excerpt text,
  created_at timestamptz not null default now()
);

create index if not exists recipe_groups_category_idx on recipe_groups(category);
create index if not exists recipe_groups_name_idx on recipe_groups(canonical_name);
create index if not exists recipe_versions_recipe_id_idx on recipe_versions(recipe_id);

alter table recipe_groups enable row level security;
alter table recipe_versions enable row level security;

-- L'application passe uniquement par les routes serveur avec la clé service_role.
-- Aucune policy publique n'est créée volontairement.
