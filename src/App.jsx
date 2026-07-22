import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import ProfileSetup from './pages/ProfileSetup'
import Dashboard from './pages/Dashboard'
import AddAssociate from './pages/AddAssociate'
import AddClient from './pages/AddClient'
import ChooseClient from './pages/ChooseClient'
import ChooseTemplate from './pages/ChooseTemplate'
import TemplateEditor from './pages/TemplateEditor'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-700 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function Protected({ children, needsProfile = true }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (needsProfile && (!profile || !profile.firm_name)) return <Navigate to="/profile-setup" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/profile-setup" element={<Protected needsProfile={false}><ProfileSetup /></Protected>} />
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/add-associate" element={<Protected><AddAssociate /></Protected>} />
        <Route path="/add-client" element={<Protected><AddClient /></Protected>} />
        <Route path="/choose-client" element={<Protected><ChooseClient /></Protected>} />
        <Route path="/choose-template" element={<Protected><ChooseTemplate /></Protected>} />
        <Route path="/template-editor" element={<Protected><TemplateEditor /></Protected>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
