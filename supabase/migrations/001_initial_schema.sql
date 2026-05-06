-- FocusGroupAI - Initial Schema

-- Sessions
create table sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  model text not null default 'claude-haiku-4-5-20251001',
  concurrency int not null default 20,
  status text not null default 'draft',
  created_at timestamptz default now()
);

-- Profile dimensions (reusable templates)
create table profile_dimensions (
  id uuid primary key default gen_random_uuid(),
  dimension_type text not null,
  value text not null,
  label_pt text,
  created_at timestamptz default now(),
  unique(dimension_type, value)
);

-- Agent profiles per session
create table agent_profiles (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  name text not null,
  role text not null,
  industry text not null,
  company_size text not null,
  extra_context text,
  system_prompt text not null,
  created_at timestamptz default now()
);

-- Questions per session
create table questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  text text not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- Responses (one per agent x question)
create table responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  agent_profile_id uuid references agent_profiles(id) on delete cascade,
  question_id uuid references questions(id) on delete cascade,
  response_text text,
  model_used text,
  input_tokens int,
  output_tokens int,
  status text not null default 'pending',
  error_message text,
  created_at timestamptz default now(),
  unique(agent_profile_id, question_id)
);

-- AI-generated insights
create table insights (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  question_id uuid references questions(id),
  insight_type text not null,
  content jsonb not null,
  model_used text,
  created_at timestamptz default now()
);

-- Indexes
create index idx_agent_profiles_session on agent_profiles(session_id);
create index idx_questions_session on questions(session_id);
create index idx_responses_session on responses(session_id);
create index idx_responses_question on responses(question_id);
create index idx_responses_agent on responses(agent_profile_id);
create index idx_responses_status on responses(status);
create index idx_insights_session on insights(session_id);

-- Seed default dimensions
insert into profile_dimensions (dimension_type, value, label_pt) values
  -- Roles
  ('role', 'cfo', 'CFO'),
  ('role', 'controller', 'Controller'),
  ('role', 'financial_analyst', 'Analista Financeiro'),
  ('role', 'treasurer', 'Tesoureiro'),
  ('role', 'accounting_manager', 'Gerente de Contabilidade'),
  ('role', 'fp_and_a_manager', 'Gerente de FP&A'),
  ('role', 'tax_manager', 'Gerente Tributario'),
  ('role', 'internal_auditor', 'Auditor Interno'),
  -- Industries
  ('industry', 'banking', 'Banco / Financeiro'),
  ('industry', 'retail', 'Varejo'),
  ('industry', 'healthcare', 'Saude'),
  ('industry', 'manufacturing', 'Manufatura / Industria'),
  ('industry', 'technology', 'Tecnologia'),
  ('industry', 'energy', 'Energia'),
  ('industry', 'agribusiness', 'Agronegocio'),
  ('industry', 'construction', 'Construcao Civil'),
  -- Company sizes
  ('company_size', 'mid_market', 'Medio Porte (100-999 funcionarios)'),
  ('company_size', 'large', 'Grande Porte (1.000-9.999 funcionarios)'),
  ('company_size', 'enterprise', 'Enterprise (10.000+ funcionarios)'),
  ('company_size', 'multinational', 'Multinacional');
