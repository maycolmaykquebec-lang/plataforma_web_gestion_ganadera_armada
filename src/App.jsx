import AltasBajasPage from './pages/AltasBajasPage'
import EvaluacionDescartePage from './pages/EvaluacionDescartePage'
import ReportesPage from './pages/ReportesPage'
import UsuariosPage from './pages/UsuariosPage'
import AuditoriaPage from './pages/AuditoriaPage'
import RespaldosPage from './pages/RespaldosPage'
import { menuPermitido } from './auth/permisos'
import { usePerfil } from './contexts/PerfilContext'
import MovimientosPage from './pages/MovimientosPage'
import ControlReproductivoPage from './pages/ControlReproductivoPage'
import InventarioGanaderoPage from './pages/InventarioGanaderoPage'
import ControlSanitarioPage from './pages/ControlSanitarioPage'
import HistorialIndividualPage from './pages/HistorialIndividualPage'
import SemovientesPage from './pages/SemovientesPage'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import DashboardPage from './pages/DashboardPage'
import DashboardLayout from './layouts/DashboardLayout'
import ProtectedRoute from './components/ProtectedRoute'

function Modulo({ id, children }) {
  const perfil = usePerfil()
  return menuPermitido(perfil).includes(id) ? children : <Navigate to="/dashboard" replace />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/semovientes" element={<SemovientesPage />} />
            <Route path="/historial" element={<HistorialIndividualPage />} />
            <Route path="/sanidad" element={<ControlSanitarioPage />} />
            <Route path="/reproduccion" element={<ControlReproductivoPage />} />
            <Route path="/movimientos" element={<MovimientosPage />} />
            <Route path="/altas-bajas" element={<Modulo id="altas"><AltasBajasPage /></Modulo>} />
            <Route path="/descarte" element={<Modulo id="descarte"><EvaluacionDescartePage /></Modulo>} />
            <Route path="/reportes" element={<Modulo id="reportes"><ReportesPage /></Modulo>} />
            <Route path="/usuarios" element={<Modulo id="usuarios"><UsuariosPage /></Modulo>} />
            <Route path="/auditoria" element={<Modulo id="auditoria"><AuditoriaPage /></Modulo>} />
            <Route path="/respaldos" element={<Modulo id="respaldos"><RespaldosPage /></Modulo>} />
            <Route path="/inventario" element={<InventarioGanaderoPage />} />
            <Route path="/reproductivo" element={<ControlReproductivoPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

