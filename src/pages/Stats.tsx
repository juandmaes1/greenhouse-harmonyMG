import { Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, ClipboardCheck, Clock, Leaf } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabaseErrorMessage, supabase } from '@/lib/supabase';

const COLORS = ['hsl(35, 90%, 55%)', 'hsl(145, 63%, 32%)', 'hsl(200, 80%, 50%)', 'hsl(0, 72%, 51%)'];

const taskLabels: Record<string, string> = {
  cortar: 'Cortar',
  fertilizar: 'Fertilizar',
  quimicos: 'Químicos',
  poscosecha: 'Poscosecha',
};

export default function Stats() {
  const {
    data: tasks,
    error: tasksError,
  } = useQuery({
    queryKey: ['all-tasks-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*, greenhouses(name)');

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  });

  const {
    data: greenhouses,
    error: greenhousesError,
  } = useQuery({
    queryKey: ['greenhouses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('greenhouses').select('*');

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  });

  const total = tasks?.length ?? 0;
  const completed = tasks?.filter(task => task.status === 'completed').length ?? 0;
  const pending = total - completed;

  const byType = Object.entries(taskLabels).map(([key, label]) => ({
    name: label,
    total: tasks?.filter(task => task.task_type === key).length ?? 0,
    completed: tasks?.filter(task => task.task_type === key && task.status === 'completed').length ?? 0,
  }));

  const byGreenhouse =
    greenhouses?.map(greenhouse => ({
      name: greenhouse.name,
      total: tasks?.filter(task => task.greenhouse_id === greenhouse.id).length ?? 0,
      completed:
        tasks?.filter(task => task.greenhouse_id === greenhouse.id && task.status === 'completed').length ?? 0,
    })) ?? [];

  const pieData = byType.map(entry => ({ name: entry.name, value: entry.total })).filter(entry => entry.value > 0);
  const queryError = tasksError ?? greenhousesError;

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="font-heading text-2xl font-bold">Estadísticas</h1>

      {queryError && (
        <p className="text-sm text-destructive">
          {getSupabaseErrorMessage(queryError, 'No fue posible cargar las estadísticas.')}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <ClipboardCheck className="w-8 h-8 text-primary" />
            <div>
              <p className="text-2xl font-heading font-bold">{total}</p>
              <p className="text-xs text-muted-foreground">Total tareas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <CheckCircle2 className="w-8 h-8 text-success" />
            <div>
              <p className="text-2xl font-heading font-bold">{completed}</p>
              <p className="text-xs text-muted-foreground">Completadas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Clock className="w-8 h-8 text-warning" />
            <div>
              <p className="text-2xl font-heading font-bold">{pending}</p>
              <p className="text-xs text-muted-foreground">Pendientes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Leaf className="w-8 h-8 text-primary" />
            <div>
              <p className="text-2xl font-heading font-bold">{greenhouses?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Invernaderos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">Tareas por invernadero</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={byGreenhouse}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" fill="hsl(145, 63%, 32%)" name="Total" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" fill="hsl(145, 63%, 52%)" name="Completadas" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">Distribución por tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
