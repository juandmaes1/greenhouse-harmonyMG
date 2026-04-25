import { CheckCircle2, Leaf } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { getSupabaseErrorMessage, supabase} from '@/lib/supabase';
import { cn } from '@/lib/utils';

const taskLabels: Record<string, string> = {
  cortar: 'Cortar',
  fertilizar: 'Fertilizar',
  quimicos: 'Químicos',
  poscosecha: 'Poscosecha',
};

const taskColors: Record<string, string> = {
  cortar: 'border-l-warning',
  fertilizar: 'border-l-primary',
  quimicos: 'border-l-info',
  poscosecha: 'border-l-destructive',
};

export default function SupervisorPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: tasks,
    error,
  } = useQuery({
    queryKey: ['pending-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, greenhouses(name), beds(row_number, column_number), chemicals(name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (taskId: string) => {
      if (!user) {
        throw new Error('No hay una sesión activa para completar tareas.');
      }

      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'completed' as const,
          completed_by: user.id,
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
      toast({ title: 'Tarea completada' });
    },
    onError: mutationError =>
      toast({
        title: 'Error',
        description: getSupabaseErrorMessage(mutationError, 'No fue posible completar la tarea.'),
        variant: 'destructive',
      }),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="font-heading text-2xl font-bold">Tareas pendientes</h1>

      {error && (
        <p className="text-sm text-destructive">
          {getSupabaseErrorMessage(error, 'No fue posible cargar las tareas pendientes.')}
        </p>
      )}

      {tasks?.length === 0 && !error && (
        <div className="text-center py-12">
          <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-3" />
          <p className="text-muted-foreground">¡No hay tareas pendientes!</p>
        </div>
      )}

      <div className="space-y-3">
        {tasks?.map(task => (
          <Card key={task.id} className={cn('border-l-4', taskColors[task.task_type])}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Leaf className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">{(task.greenhouses as { name?: string } | null)?.name}</span>
                  <span className="text-xs bg-muted px-2 py-0.5 rounded">{taskLabels[task.task_type]}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {task.is_general
                    ? 'Todo el invernadero'
                    : `Fila ${(task.beds as { row_number?: number; column_number?: number } | null)?.row_number}, Col ${(task.beds as { row_number?: number; column_number?: number } | null)?.column_number}`}
                  {(task.chemicals as { name?: string } | null)?.name &&
                    ` · ${(task.chemicals as { name?: string } | null)?.name}`}
                </p>
                {task.notes && <p className="text-xs text-muted-foreground italic">{task.notes}</p>}
              </div>
              <Button
                size="sm"
                onClick={() => completeMutation.mutate(task.id)}
                disabled={completeMutation.isPending}
                className="gap-1"
              >
                <CheckCircle2 className="w-4 h-4" /> Completar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
