DO $$
BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'consultant';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'cancelled';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date DATE NOT NULL UNIQUE,
  end_date DATE NOT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.weeks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.task_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  greenhouse_id UUID REFERENCES public.greenhouses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  task_type public.task_type NOT NULL,
  is_permanent BOOLEAN NOT NULL DEFAULT false,
  start_week DATE,
  end_week DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_definitions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.executed_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  bed_id UUID REFERENCES public.beds(id) ON DELETE CASCADE,
  executed_by UUID REFERENCES auth.users(id),
  executed_at TIMESTAMPTZ,
  completed BOOLEAN DEFAULT false,
  is_unplanned BOOLEAN DEFAULT false,
  notes TEXT
);

ALTER TABLE public.executed_tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS week_id UUID REFERENCES public.weeks(id),
  ADD COLUMN IF NOT EXISTS week_start DATE,
  ADD COLUMN IF NOT EXISTS task_definition_id UUID REFERENCES public.task_definitions(id),
  ADD COLUMN IF NOT EXISTS task_name TEXT,
  ADD COLUMN IF NOT EXISTS is_unplanned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

UPDATE public.tasks
SET
  week_start = COALESCE(week_start, created_at::date),
  task_name = COALESCE(task_name, INITCAP(task_type::text))
WHERE week_start IS NULL OR task_name IS NULL;

CREATE POLICY "All can read weeks" ON public.weeks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and engineer can manage weeks" ON public.weeks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));

CREATE POLICY "All can read task definitions" ON public.task_definitions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and engineer can manage task definitions" ON public.task_definitions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));

CREATE POLICY "All can read executed tasks" ON public.executed_tasks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and supervisor can insert executed tasks" ON public.executed_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

DROP POLICY IF EXISTS "Admin and engineer can create tasks" ON public.tasks;

CREATE POLICY "Admin engineer and supervisor can create tasks by workflow" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'engineer')
    OR (public.has_role(auth.uid(), 'supervisor') AND COALESCE(is_unplanned, false) = true)
  );

DROP POLICY IF EXISTS "Supervisor can update tasks" ON public.tasks;

CREATE POLICY "Admin engineer and supervisor can update tasks" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'engineer')
    OR public.has_role(auth.uid(), 'supervisor')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'engineer')
    OR public.has_role(auth.uid(), 'supervisor')
  );
