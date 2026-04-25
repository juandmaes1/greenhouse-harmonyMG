import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sprout, LogOut } from 'lucide-react';

export default function NoRole() {
  const { signOut, user } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center animate-fade-in">
        <CardHeader>
          <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-2">
            <Sprout className="w-8 h-8 text-muted-foreground" />
          </div>
          <CardTitle className="font-heading">Sin rol asignado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Tu cuenta ({user?.email}) aún no tiene un rol asignado. Contacta al administrador.
          </p>
          <Button variant="outline" onClick={signOut} className="gap-2">
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
