import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProductsPage } from './pages/ProductsPage';
import { PrintLabelPage } from './pages/PrintLabelPage';
import { PhotosPage } from './pages/PhotosPage';
import { CompaniesPage } from './pages/admin/CompaniesPage';
import { UsersPage } from './pages/admin/UsersPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/produtos" element={<ProductsPage />} />
          <Route path="/imprimir" element={<PrintLabelPage />} />
          <Route path="/fotos" element={<PhotosPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute masterOnly />}>
        <Route element={<Layout />}>
          <Route path="/admin/empresas" element={<CompaniesPage />} />
          <Route path="/admin/usuarios" element={<UsersPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
