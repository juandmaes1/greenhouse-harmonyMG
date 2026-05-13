import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getSupabaseErrorMessage, supabase } from '@/lib/supabase';

const roleLabels = {
  admin: 'Administrador',
  engineer: 'Jefe de area',
  supervisor: 'Supervisor',
  consultant: 'Consultor',
};

export default function UsersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRoleByUser, setSelectedRoleByUser] = useState<Record<string, string>>({});

  const {
    data: roles,
    error: rolesError,
  } = useQuery({
    queryKey: ['all-user-roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_roles').select('*');

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  });

  const {
    data: profiles,
    error: profilesError,
  } = useQuery({
    queryKey: ['all-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*');

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  });

  const profileMap = new Map(profiles?.map(profile => [profile.user_id, profile]) ?? []);

  const addRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error: deleteError } = await supabase.from('user_roles').delete().eq('user_id', userId);

      if (deleteError) {
        throw deleteError;
      }

      const { error } = await supabase.from('user_roles').insert({
        user_id: userId,
        role: role as 'admin' | 'engineer' | 'supervisor' | 'consultant',
      });

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
      toast({ title: 'Rol asignado' });
    },
    onError: mutationError =>
      toast({
        title: 'Error',
        description: getSupabaseErrorMessage(mutationError, 'No fue posible asignar el rol.'),
        variant: 'destructive',
      }),
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_roles').delete().eq('id', id);

      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
      toast({ title: 'Rol eliminado' });
    },
    onError: mutationError =>
      toast({
        title: 'Error',
        description: getSupabaseErrorMessage(mutationError, 'No fue posible eliminar el rol.'),
        variant: 'destructive',
      }),
  });

  const usersWithRoles = new Set(roles?.map(role => role.user_id) ?? []);
  const unassigned = profiles?.filter(profile => !usersWithRoles.has(profile.user_id)) ?? [];
  const queryError = rolesError ?? profilesError;

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="font-heading text-2xl font-bold">Gestión de usuarios</h1>

      {queryError && (
        <p className="text-sm text-destructive">
          {getSupabaseErrorMessage(queryError, 'No fue posible cargar los usuarios.')}
        </p>
      )}

      <div className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Usuarios con rol</h2>
        {roles?.map(roleRecord => {
          const profile = profileMap.get(roleRecord.user_id);

          return (
            <Card key={roleRecord.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-sm">{profile?.full_name || 'Sin nombre'}</p>
                  <p className="text-xs text-muted-foreground">
                    {roleLabels[roleRecord.role as keyof typeof roleLabels]}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteRoleMutation.mutate(roleRecord.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
        {roles?.length === 0 && <p className="text-muted-foreground text-sm">No hay usuarios con rol asignado.</p>}
      </div>

      {unassigned.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-heading text-lg font-semibold">Usuarios sin rol</h2>
          {unassigned.map(profile => (
            <Card key={profile.id}>
              <CardContent className="flex items-center justify-between py-3">
                <p className="font-medium text-sm">{profile.full_name || 'Sin nombre'}</p>
                <Select
                  value={selectedRoleByUser[profile.user_id]}
                  onValueChange={value => {
                    setSelectedRoleByUser(previous => ({ ...previous, [profile.user_id]: value }));
                    addRoleMutation.mutate({ userId: profile.user_id, role: value });
                  }}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Asignar rol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="engineer">Jefe de area</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="consultant">Consultor</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
