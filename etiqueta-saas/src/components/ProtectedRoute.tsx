import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { FullPageSpinner } from './ui/Spinner';
import { Button } from './ui/Button';

function ProfileMissing({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-semibold text-neutral-800">Conta sem perfil</h1>
      <p className="max-w-sm text-sm text-neutral-600">
        Seu usuario foi autenticado, mas ainda nao esta vinculado a uma empresa.
        Peca ao administrador para concluir o cadastro.
      </p>
      <Button variant="secondary" onClick={onSignOut}>
        Sair
      </Button>
    </div>
  );
}

export function ProtectedRoute({ masterOnly = false }: { masterOnly?: boolean }) {
  const { session, profile, loading, isMaster, signOut } = useAuth();

  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <ProfileMissing onSignOut={signOut} />;
  if (masterOnly && !isMaster) return <Navigate to="/" replace />;

  return <Outlet />;
}
