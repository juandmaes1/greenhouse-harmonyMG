-- ============================================================
-- MIGRACIÓN MÍNIMA — solo lo que falta en la BD actual
-- Correr en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Columnas faltantes en tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_name text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_definition_id uuid;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS cancelled_reason text;

-- 2. Valor 'cancelled' en el enum task_status
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'cancelled';

-- 3. Valor 'consultant' en el enum app_role
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'consultant';

-- 4. UNIQUE en weeks.start_date (necesario para el upsert)
ALTER TABLE public.weeks ADD CONSTRAINT IF NOT EXISTS weeks_start_date_key UNIQUE (start_date);
