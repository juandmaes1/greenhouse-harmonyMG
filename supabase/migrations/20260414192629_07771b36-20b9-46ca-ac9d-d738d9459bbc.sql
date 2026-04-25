
-- Create enums
CREATE TYPE public.app_role AS ENUM ('admin', 'engineer', 'supervisor');
CREATE TYPE public.task_type AS ENUM ('cortar', 'fertilizar', 'quimicos', 'poscosecha');
CREATE TYPE public.task_status AS ENUM ('pending', 'completed');

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Greenhouses table
CREATE TABLE public.greenhouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rows INT NOT NULL DEFAULT 50,
  columns INT NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.greenhouses ENABLE ROW LEVEL SECURITY;

-- Beds table
CREATE TABLE public.beds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  greenhouse_id UUID REFERENCES public.greenhouses(id) ON DELETE CASCADE NOT NULL,
  row_number INT NOT NULL,
  column_number INT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (greenhouse_id, row_number, column_number)
);
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;

-- Chemicals table
CREATE TABLE public.chemicals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.chemicals ENABLE ROW LEVEL SECURITY;

-- Tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  greenhouse_id UUID REFERENCES public.greenhouses(id) ON DELETE CASCADE NOT NULL,
  bed_id UUID REFERENCES public.beds(id) ON DELETE CASCADE,
  task_type task_type NOT NULL,
  chemical_id UUID REFERENCES public.chemicals(id),
  assigned_by UUID REFERENCES auth.users(id) NOT NULL,
  completed_by UUID REFERENCES auth.users(id),
  status task_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  is_general BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Trigger for profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_greenhouses_updated_at
  BEFORE UPDATE ON public.greenhouses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies

-- user_roles
CREATE POLICY "Users can read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- profiles
CREATE POLICY "All can read profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- greenhouses
CREATE POLICY "All can read greenhouses" ON public.greenhouses
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert greenhouses" ON public.greenhouses
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update greenhouses" ON public.greenhouses
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete greenhouses" ON public.greenhouses
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- beds
CREATE POLICY "All can read beds" ON public.beds
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert beds" ON public.beds
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete beds" ON public.beds
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- chemicals
CREATE POLICY "All can read chemicals" ON public.chemicals
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert chemicals" ON public.chemicals
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update chemicals" ON public.chemicals
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete chemicals" ON public.chemicals
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- tasks
CREATE POLICY "All can read tasks" ON public.tasks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and engineer can create tasks" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer')
  );

CREATE POLICY "Supervisor can update tasks" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')
  );

CREATE POLICY "Admin can delete tasks" ON public.tasks
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
