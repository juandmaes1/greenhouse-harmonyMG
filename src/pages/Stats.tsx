import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CheckCircle2, ClipboardCheck, Clock, Leaf, XCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { getSupabaseErrorMessage, supabase } from '@/lib/supabase';

const PIE_COLORS = ['hsl(35, 90%, 55%)', 'hsl(145, 63%, 32%)', 'hsl(200, 80%, 50%)', 'hsl(0, 72%, 51%)'];

const taskLabels: Record<string, string> = {
  cortar: 'Cortar',
  fertilizar: 'Fertilizar',
  quimicos: 'Quimicos',
  poscosecha: 'Poscosecha',
};

function StatCard({
  icon,
  value,
  label,
  iconClass,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  iconClass?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        <div className={iconClass}>{icon}</div>
        <div>
          <p className="text-2xl font-heading font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const getCurrentWeekStart = () => {
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(today.getDate() - today.getDay());
  return start.toISOString().split('T')[0];
};

const getTaskWeekStartStr = (task: { week_start?: string | null; created_at: string }): string => {
  if (task.week_start) return task.week_start.split('T')[0];
  const date = new Date(task.created_at);
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(date.getDate() - date.getDay());
  return start.toISOString().split('T')[0];
};

const formatWeekRange = (weekStartStr: string) => {
  const start = new Date(weekStartStr + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}`;
};

export default function Stats() {
  const [selectedGreenhouseId, setSelectedGreenhouseId] = useState<string>('');
  const [selectedDetailWeek, setSelectedDetailWeek] = useState<string>('');

  const { data: tasks, error: tasksError } = useQuery({
    queryKey: ['all-tasks-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*, greenhouses(name)');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: greenhouses, error: greenhousesError } = useQuery({
    queryKey: ['greenhouses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('greenhouses').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const currentWeekStart = getCurrentWeekStart();
  const effectiveSelectedId = selectedGreenhouseId || greenhouses?.[0]?.id || '';
  const selectedGreenhouse = greenhouses?.find(gh => gh.id === effectiveSelectedId);

  // ── Semana actual (global) ──────────────────────────────────
  const currentWeekTasks = useMemo(
    () => tasks?.filter(t => getTaskWeekStartStr(t) === currentWeekStart) ?? [],
    [tasks, currentWeekStart]
  );

  const total = currentWeekTasks.length;
  const completed = currentWeekTasks.filter(t => t.status === 'completed').length;
  const pending = currentWeekTasks.filter(t => t.status === 'pending').length;
  const cancelled = currentWeekTasks.filter(t => t.status === 'cancelled').length;

  const byGreenhouse = useMemo(
    () =>
      greenhouses?.map(gh => ({
        name: gh.name,
        total: currentWeekTasks.filter(t => t.greenhouse_id === gh.id).length,
        completed: currentWeekTasks.filter(t => t.greenhouse_id === gh.id && t.status === 'completed').length,
      })) ?? [],
    [greenhouses, currentWeekTasks]
  );

  const globalPieData = useMemo(
    () =>
      Object.entries(taskLabels)
        .map(([key, label], i) => ({
          name: label,
          value: currentWeekTasks.filter(t => t.task_type === key).length,
          fill: PIE_COLORS[i % PIE_COLORS.length],
        }))
        .filter(e => e.value > 0),
    [currentWeekTasks]
  );

  // ── Detalle por invernadero ─────────────────────────────────
  const availableWeeks = useMemo(() => {
    const weekSet = new Map<string, string>();
    tasks
      ?.filter(t => t.greenhouse_id === effectiveSelectedId)
      .forEach(task => {
        const ws = getTaskWeekStartStr(task);
        if (!weekSet.has(ws)) weekSet.set(ws, formatWeekRange(ws));
      });
    return Array.from(weekSet.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => b.value.localeCompare(a.value));
  }, [tasks, effectiveSelectedId]);

  const effectiveDetailWeek = selectedDetailWeek || availableWeeks[0]?.value || currentWeekStart;

  const ghTasks = useMemo(
    () =>
      tasks?.filter(
        t => t.greenhouse_id === effectiveSelectedId && getTaskWeekStartStr(t) === effectiveDetailWeek
      ) ?? [],
    [tasks, effectiveSelectedId, effectiveDetailWeek]
  );

  const ghTotal = ghTasks.length;
  const ghCompleted = ghTasks.filter(t => t.status === 'completed').length;
  const ghPending = ghTasks.filter(t => t.status === 'pending').length;
  const ghCancelled = ghTasks.filter(t => t.status === 'cancelled').length;
  const ghCompletionRate = ghTotal > 0 ? Math.round((ghCompleted / ghTotal) * 100) : 0;

  const ghByType = useMemo(
    () =>
      Object.entries(taskLabels).map(([key, label]) => ({
        name: label,
        total: ghTasks.filter(t => t.task_type === key).length,
        completadas: ghTasks.filter(t => t.task_type === key && t.status === 'completed').length,
        pendientes: ghTasks.filter(t => t.task_type === key && t.status === 'pending').length,
        canceladas: ghTasks.filter(t => t.task_type === key && t.status === 'cancelled').length,
      })),
    [ghTasks]
  );

  const ghPieData = ghByType
    .map((e, i) => ({ name: e.name, value: e.total, fill: PIE_COLORS[i % PIE_COLORS.length] }))
    .filter(e => e.value > 0);

  const queryError = tasksError ?? greenhousesError;

  return (
    <div className="space-y-8 animate-fade-in">
      <h1 className="font-heading text-2xl font-bold">Estadisticas</h1>

      {queryError && (
        <p className="text-sm text-destructive">
          {getSupabaseErrorMessage(queryError, 'No fue posible cargar las estadisticas.')}
        </p>
      )}

      {/* ── Semana actual ── */}
      <section className="space-y-4">
        <div>
          <h2 className="font-heading text-base font-semibold text-muted-foreground uppercase tracking-wide">
            Semana actual
          </h2>
          <p className="text-sm text-muted-foreground">{formatWeekRange(currentWeekStart)}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard icon={<ClipboardCheck className="h-8 w-8" />} iconClass="text-primary" value={total} label="Total tareas" />
          <StatCard icon={<CheckCircle2 className="h-8 w-8" />} iconClass="text-success" value={completed} label="Completadas" />
          <StatCard icon={<Clock className="h-8 w-8" />} iconClass="text-warning" value={pending} label="Pendientes" />
          <StatCard icon={<XCircle className="h-8 w-8" />} iconClass="text-destructive" value={cancelled} label="Canceladas" />
          <StatCard icon={<Leaf className="h-8 w-8" />} iconClass="text-primary" value={greenhouses?.length ?? 0} label="Invernaderos" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Tareas por invernadero</CardTitle>
            </CardHeader>
            <CardContent>
              {total === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sin tareas esta semana.</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={byGreenhouse}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total" fill="hsl(145, 63%, 32%)" name="Total" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completed" fill="hsl(145, 63%, 52%)" name="Completadas" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base">Distribucion por tipo</CardTitle>
            </CardHeader>
            <CardContent>
              {globalPieData.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sin tareas esta semana.</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={globalPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label />
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      {/* ── Detalle por invernadero ── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-heading text-base font-semibold text-muted-foreground uppercase tracking-wide">
            Detalle por invernadero
          </h2>
          <Select
            value={effectiveSelectedId}
            onValueChange={v => {
              setSelectedGreenhouseId(v);
              setSelectedDetailWeek('');
            }}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Seleccionar invernadero" />
            </SelectTrigger>
            <SelectContent>
              {greenhouses?.map(gh => (
                <SelectItem key={gh.id} value={gh.id}>
                  {gh.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {availableWeeks.length > 0 && (
            <Select value={effectiveDetailWeek} onValueChange={setSelectedDetailWeek}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Seleccionar semana" />
              </SelectTrigger>
              <SelectContent>
                {availableWeeks.map(w => (
                  <SelectItem key={w.value} value={w.value}>
                    {w.label}
                    {w.value === currentWeekStart ? ' (actual)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {!selectedGreenhouse ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Selecciona un invernadero para ver su detalle.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={<ClipboardCheck className="h-7 w-7" />} iconClass="text-primary" value={ghTotal} label="Total tareas" />
              <StatCard icon={<CheckCircle2 className="h-7 w-7" />} iconClass="text-success" value={ghCompleted} label="Completadas" />
              <StatCard icon={<Clock className="h-7 w-7" />} iconClass="text-warning" value={ghPending} label="Pendientes" />
              <StatCard icon={<XCircle className="h-7 w-7" />} iconClass="text-destructive" value={ghCancelled} label="Canceladas" />
            </div>

            {ghTotal === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Sin tareas para esta semana en {selectedGreenhouse.name}.
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="font-heading text-base">Tasa de completitud</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="flex items-end gap-2">
                        <span className="text-5xl font-heading font-bold">{ghCompletionRate}%</span>
                        <span className="mb-1 text-sm text-muted-foreground">de tareas completadas</span>
                      </div>
                      <Progress value={ghCompletionRate} className="h-3" />
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <div className="rounded-lg bg-muted/50 p-3 text-center">
                          <p className="text-xl font-bold text-success">{ghCompleted}</p>
                          <p className="text-xs text-muted-foreground">Completadas</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-3 text-center">
                          <p className="text-xl font-bold text-warning">{ghPending}</p>
                          <p className="text-xs text-muted-foreground">Pendientes</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-3 text-center">
                          <p className="text-xl font-bold text-destructive">{ghCancelled}</p>
                          <p className="text-xs text-muted-foreground">Canceladas</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="font-heading text-base">Distribucion por tipo</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={ghPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label />
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="font-heading text-base">Desglose por tipo de tarea</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={ghByType} layout="vertical" margin={{ left: 10, right: 20 }}>
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={85} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="total" name="Total" fill="hsl(145, 63%, 32%)" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="completadas" name="Completadas" fill="hsl(145, 63%, 52%)" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="pendientes" name="Pendientes" fill="hsl(40, 90%, 55%)" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="canceladas" name="Canceladas" fill="hsl(0, 72%, 55%)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
