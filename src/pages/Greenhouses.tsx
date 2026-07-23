import { useMemo, useState } from 'react';
import { ArrowLeft, Leaf, Plus, Settings } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import GreenhouseMap from '@/components/GreenhouseMap';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { getSupabaseErrorMessage, supabase } from '@/lib/supabase';

export default function Greenhouses() {
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedGH, setSelectedGH] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [columns, setColumns] = useState(10);
  const [editId, setEditId] = useState('');
  const DEFAULT_ROWS = 16; // 8 arriba del camino + 8 abajo

  const currentWeekStart = useMemo(() => {
    const today = new Date()
    const start = new Date(today)
    start.setDate(today.getDate() - today.getDay())
    start.setHours(0, 0, 0, 0)
    return start.toISOString().split('T')[0]
  }, [])

  const { data: weekTasks = [] } = useQuery({
    queryKey: ['week-summary-tasks', currentWeekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('greenhouse_id, status, is_unplanned')
        .eq('week_start', currentWeekStart)
      if (error) return []
      return data ?? []
    },
  })

  const ghSummary = useMemo(() => {
    const map = new Map<string, { completed: number; pending: number; total: number; unplanned: number }>()
    weekTasks.forEach(task => {
      if (!task.greenhouse_id) return
      const cur = map.get(task.greenhouse_id) ?? { completed: 0, pending: 0, total: 0, unplanned: 0 }
      cur.total++
      if (task.status === 'completed') cur.completed++
      if (task.status === 'pending') cur.pending++
      if (task.is_unplanned) cur.unplanned++
      map.set(task.greenhouse_id, cur)
    })
    return map
  }, [weekTasks])

  const {
    data: greenhouses,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['greenhouses'],
    queryFn: async () => {
      const { data, error: queryError } = await supabase.from('greenhouses').select('*').order('name');

      if (queryError) {
        throw queryError;
      }

      return data ?? [];
    },
  });

  const selected = greenhouses?.find(greenhouse => greenhouse.id === selectedGH);

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: greenhouse, error: greenhouseError } = await supabase
        .from('greenhouses')
        .insert({ name, rows: DEFAULT_ROWS, columns })
        .select()
        .single();

      if (greenhouseError) throw greenhouseError;

      const beds = [];
      for (let row = 1; row <= DEFAULT_ROWS; row += 1) {
        for (let column = 1; column <= columns; column += 1) {
          beds.push({ greenhouse_id: greenhouse.id, row_number: row, column_number: column });
        }
      }

      for (let index = 0; index < beds.length; index += 500) {
        const { error: bedsError } = await supabase.from('beds').insert(beds.slice(index, index + 500));
        if (bedsError) throw bedsError;
      }

      const defaultRowTaskDefs = [
        { task_name: 'Corte',         task_type: 'cortar'     as const },
        { task_name: 'Fertilización', task_type: 'fertilizar' as const },
        { task_name: 'Químicos',      task_type: 'quimicos'   as const },
        { task_name: 'Poscosecha',    task_type: 'poscosecha' as const },
        { task_name: 'Riego',         task_type: 'fertilizar' as const },
        { task_name: 'Fumigación',    task_type: 'quimicos'   as const },
        { task_name: 'Tutoreo',       task_type: 'cortar'     as const },
        { task_name: 'Deshoje',       task_type: 'cortar'     as const },
      ];
      const defaultRowTasks = defaultRowTaskDefs.map((def, i) => ({
        greenhouse_id: greenhouse.id,
        row_number: i + 1,
        ...def,
        is_enabled: true,
      }));

      const { error: rowTasksError } = await supabase.from('greenhouse_row_tasks').insert(defaultRowTasks);
      if (rowTasksError) throw rowTasksError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['greenhouses'] });
      setCreateOpen(false);
      setName('');
      setColumns(10);
      toast({ title: 'Invernadero creado' });
    },
    onError: mutationError =>
      toast({
        title: 'Error',
        description: getSupabaseErrorMessage(mutationError, 'No fue posible crear el invernadero.'),
        variant: 'destructive',
      }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error: greenhouseError } = await supabase
        .from('greenhouses')
        .update({ name, rows: DEFAULT_ROWS, columns })
        .eq('id', editId);

      if (greenhouseError) throw greenhouseError;

      const { error: deleteBedsError } = await supabase.from('beds').delete().eq('greenhouse_id', editId);
      if (deleteBedsError) throw deleteBedsError;

      const beds = [];
      for (let row = 1; row <= DEFAULT_ROWS; row += 1) {
        for (let column = 1; column <= columns; column += 1) {
          beds.push({ greenhouse_id: editId, row_number: row, column_number: column });
        }
      }

      for (let index = 0; index < beds.length; index += 500) {
        const { error: insertBedsError } = await supabase.from('beds').insert(beds.slice(index, index + 500));
        if (insertBedsError) throw insertBedsError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['greenhouses'] });
      queryClient.invalidateQueries({ queryKey: ['beds'] });
      setEditOpen(false);
      toast({ title: 'Invernadero actualizado' });
    },
    onError: mutationError =>
      toast({
        title: 'Error',
        description: getSupabaseErrorMessage(mutationError, 'No fue posible actualizar el invernadero.'),
        variant: 'destructive',
      }),
  });

  if (selectedGH && selected) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedGH(null)}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="font-heading text-xl font-bold">{selected.name}</h1>
          <span className="text-muted-foreground text-sm">
            {selected.columns} camas
          </span>
          {role === 'admin' && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => {
                setEditId(selected.id);
                setName(selected.name);
                setColumns(selected.columns);
                setEditOpen(true);
              }}
            >
              <Settings className="w-4 h-4 mr-1" /> Editar
            </Button>
          )}
        </div>
        <GreenhouseMap greenhouseId={selected.id} rows={selected.rows} columns={selected.columns} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="font-heading text-2xl font-bold">Invernaderos</h1>
        <p className="text-sm text-destructive">
          {getSupabaseErrorMessage(error, 'No fue posible cargar los invernaderos.')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Invernaderos</h1>
        {role === 'admin' && (
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Crear invernadero
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {greenhouses?.map(greenhouse => {
            const summary = ghSummary.get(greenhouse.id)
            return (
              <Card
                key={greenhouse.id}
                className="relative cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => setSelectedGH(greenhouse.id)}
              >
                {summary && summary.total > 0 && (
                  <div className="absolute right-3 top-3 flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1 rounded-md border bg-white/95 px-2 py-1 text-xs shadow-sm">
                      <span className="font-medium text-green-600">{summary.completed} ✓</span>
                      <span className="text-muted-foreground">/ {summary.total}</span>
                    </div>
                    {summary.pending > 0 && (
                      <div className="rounded-md border bg-yellow-50 px-2 py-0.5 text-xs text-yellow-700">
                        {summary.pending} pendientes
                      </div>
                    )}
                    {summary.unplanned > 0 && (
                      <div className="rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs text-orange-700">
                        {summary.unplanned} imprevistos
                      </div>
                    )}
                  </div>
                )}
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Leaf className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="font-heading text-lg">{greenhouse.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {greenhouse.columns} camas · {greenhouse.rows} filas
                  </p>
                  {!summary || summary.total === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">Sin tareas esta semana</p>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
          {greenhouses?.length === 0 && (
            <p className="text-muted-foreground col-span-full text-center py-12">
              No hay invernaderos creados aún.
            </p>
          )}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Crear invernadero</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre</label>
              <Input value={name} onChange={event => setName(event.target.value)} placeholder="Invernadero 1" />
            </div>
            <div>
              <label className="text-sm font-medium">Número de camas (columnas)</label>
              <Input
                type="number"
                value={columns}
                onChange={event => setColumns(Number(event.target.value))}
                min={1}
                max={200}
              />
              <p className="mt-1 text-xs text-muted-foreground">Cada cama tendrá 8 tareas arriba y 8 abajo del camino.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !name}>
              {createMutation.isPending ? 'Creando...' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Editar invernadero</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre</label>
              <Input value={name} onChange={event => setName(event.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Número de camas (columnas)</label>
              <Input
                type="number"
                value={columns}
                onChange={event => setColumns(Number(event.target.value))}
                min={1}
                max={200}
              />
            </div>
            <p className="text-xs text-destructive">
              Cambiar el número de camas eliminará las camas existentes y sus tareas.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
