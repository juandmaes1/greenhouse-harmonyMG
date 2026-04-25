import { useState } from 'react';
import { Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { getSupabaseErrorMessage } from '@/lib/supabase';

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password, fullName);
        toast({ title: 'Cuenta creada', description: 'Revisa tu correo para confirmar.' });
      } else {
        await signIn(email, password);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: getSupabaseErrorMessage(error, 'No fue posible completar la autenticación.'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-2">
            <Sprout className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="font-heading text-2xl">GreenField</CardTitle>
          <p className="text-muted-foreground text-sm">Gestión de invernaderos</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <Input
                placeholder="Nombre completo"
                value={fullName}
                onChange={event => setFullName(event.target.value)}
                required
              />
            )}
            <Input
              type="email"
              placeholder="Correo electrónico"
              value={email}
              onChange={event => setEmail(event.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
              minLength={6}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Cargando...' : isSignUp ? 'Registrarse' : 'Iniciar sesión'}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            {isSignUp ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-primary font-medium hover:underline"
              type="button"
            >
              {isSignUp ? 'Iniciar sesión' : 'Registrarse'}
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
