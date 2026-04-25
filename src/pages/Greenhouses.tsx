import { useState } from 'react';
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
  const [rows, setRows] = useState(50);
  const [columns, setColumns] = useState(50);
  const [editId, setEditId] = useState('');

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
        .insert({ name, rows, columns })
        .select()
        .single();

      if (greenhouseError) {
        throw greenhouseError;
      }

      const beds = [];

      for (let row = 1; row <= rows; row += 1) {
        for (let column = 1; column <= columns; column += 1) {
          beds.push({ greenhouse_id: greenhouse.id, row_number: row, column_number: column });
        }
      }

      for (let index = 0; index < beds.length; index += 500) {
        const { error: bedsError } = await supabase.from('beds').insert(beds.slice(index, index + 500));

        if (bedsError) {
          throw bedsError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['greenhouses'] });
      setCreateOpen(false);
      setName('');
      setRows(50);
      setColumns(50);
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
        .update({ name, rows, columns })
        .eq('id', editId);

      if (greenhouseError) {
        throw greenhouseError;
      }

      const { error: deleteBedsError } = await supabase.from('beds').delete().eq('greenhouse_id', editId);

      if (deleteBedsError) {
        throw deleteBedsError;
      }

      const beds = [];

      for (let row = 1; row <= rows; row += 1) {
        for (let column = 1; column <= columns; column += 1) {
          beds.push({ greenhouse_id: editId, row_number: row, column_number: column });
        }
      }

      for (let index = 0; index < beds.length; index += 500) {
        const { error: insertBedsError } = await supabase.from('beds').insert(beds.slice(index, index + 500));

        if (insertBedsError) {
          throw insertBedsError;
        }
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
            {selected.rows} × {selected.columns} camas
          </span>
          {role === 'admin' && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => {
                setEditId(selected.id);
                setName(selected.name);
                setRows(selected.rows);
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
          {greenhouses?.map(greenhouse => (
            <Card
              key={greenhouse.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedGH(greenhouse.id)}
            >
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Leaf className="w-5 h-5 text-primary" />
                </div>
                <CardTitle className="font-heading text-lg">{greenhouse.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {greenhouse.rows} × {greenhouse.columns} camas
                </p>
              </CardContent>
            </Card>
          ))}
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Filas</label>
                <Input
                  type="number"
                  value={rows}
                  onChange={event => setRows(Number(event.target.value))}
                  min={1}
                  max={100}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Columnas</label>
                <Input
                  type="number"
                  value={columns}
                  onChange={event => setColumns(Number(event.target.value))}
                  min={1}
                  max={100}
                />
              </div>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Filas</label>
                <Input
                  type="number"
                  value={rows}
                  onChange={event => setRows(Number(event.target.value))}
                  min={1}
                  max={100}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Columnas</label>
                <Input
                  type="number"
                  value={columns}
                  onChange={event => setColumns(Number(event.target.value))}
                  min={1}
                  max={100}
                />
              </div>
            </div>
            <p className="text-xs text-destructive">
              Cambiar las dimensiones eliminará las camas existentes y sus tareas.
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
