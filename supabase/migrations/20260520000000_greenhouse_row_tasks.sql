CREATE TABLE IF NOT EXISTS public.greenhouse_row_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  greenhouse_id UUID NOT NULL REFERENCES public.greenhouses(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK (row_number BETWEEN 1 AND 8),
  task_name TEXT NOT NULL DEFAULT 'Tarea',
  task_type public.task_type NOT NULL DEFAULT 'cortar',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (greenhouse_id, row_number)
);

ALTER TABLE public.greenhouse_row_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "greenhouse_row_tasks_all" ON public.greenhouse_row_tasks
  FOR ALL USING (true) WITH CHECK (true);
