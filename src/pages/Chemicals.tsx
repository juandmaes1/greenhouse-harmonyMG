import { useState } from 'react';
import { FlaskConical, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getSupabaseErrorMessage, supabase } from '@/lib/supabase';

export default function Chemicals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const {
    data: chemicals,
    error,
  } = useQuery({
    queryKey: ['chemicals-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chemicals').select('*').order('name');

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('chemicals').insert({ name, description: description || null });

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chemicals-all'] });
      setOpen(false);
      setName('');
      setDescription('');
      toast({ title: 'Químico agregado' });
    },
    onError: mutationError =>
      toast({
        title: 'Error',
        description: getSupabaseErrorMessage(mutationError, 'No fue posible crear el químico.'),
        variant: 'destructive',
      }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, available }: { id: string; available: boolean }) => {
      const { error } = await supabase.from('chemicals').update({ available }).eq('id', id);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chemicals-all'] });
    },
    onError: mutationError =>
      toast({
        title: 'Error',
        description: getSupabaseErrorMessage(mutationError, 'No fue posible actualizar el químico.'),
        variant: 'destructive',
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('chemicals').delete().eq('id', id);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chemicals-all'] });
      toast({ title: 'Químico eliminado' });
    },
    onError: mutationError =>
      toast({
        title: 'Error',
        description: getSupabaseErrorMessage(mutationError, 'No fue posible eliminar el químico.'),
        variant: 'destructive',
      }),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Químicos disponibles</h1>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Agregar
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {getSupabaseErrorMessage(error, 'No fue posible cargar los químicos.')}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {chemicals?.map(chemical => (
          <Card key={chemical.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <FlaskConical className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium text-sm">{chemical.name}</p>
                  {chemical.description && (
                    <p className="text-xs text-muted-foreground">{chemical.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={chemical.available}
                  onCheckedChange={available => toggleMutation.mutate({ id: chemical.id, available })}
                />
                <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(chemical.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Agregar químico</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input value={name} onChange={event => setName(event.target.value)} placeholder="Nombre del químico" />
            <Textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="Descripción (opcional)"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={!name || createMutation.isPending}>
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
