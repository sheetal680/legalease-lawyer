import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import Dashboard from './pages/Dashboard'
import AddAssociate from './pages/AddAssociate'
import AddClient from './pages/AddClient'
import ChooseClient from './pages/ChooseClient'
import DocumentSetup from './pages/DocumentSetup'
import ChooseTemplate from './pages/ChooseTemplate'
import TemplateDetails from './pages/TemplateDetails'
import TemplateEditor from './pages/TemplateEditor'
import ClientReport from './pages/ClientReport'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-700 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/add-associate" element={<Protected><AddAssociate /></Protected>} />
        <Route path="/add-client" element={<Protected><AddClient /></Protected>} />
        <Route path="/choose-client" element={<Protected><ChooseClient /></Protected>} />
        <Route path="/document-setup" element={<Protected><DocumentSetup /></Protected>} />
        <Route path="/choose-template" element={<Protected><ChooseTemplate /></Protected>} />
        <Route path="/template-details" element={<Protected><TemplateDetails /></Protected>} />
        <Route path="/client-report" element={<Protected><ClientReport /></Protected>} />
        <Route path="/template-editor" element={<Protected><TemplateEditor /></Protected>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
