import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Login from "./pages/Login";
import NoRole from "./pages/NoRole";
import Greenhouses from "./pages/Greenhouses";
import Chemicals from "./pages/Chemicals";
import UsersPage from "./pages/Users";
import Stats from "./pages/Stats";
import SupervisorPage from "./pages/Supervisor";
import AppLayout from "./components/AppLayout";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  if (!user) return <Login />;
  if (!role) return <NoRole />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Greenhouses />} />
        {role === 'admin' && <Route path="/chemicals" element={<Chemicals />} />}
        {role === 'admin' && <Route path="/users" element={<UsersPage />} />}
        {role === 'admin' && <Route path="/stats" element={<Stats />} />}
        {(role === 'supervisor' || role === 'admin') && (
          <Route path="/supervisor" element={<SupervisorPage />} />
        )}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
