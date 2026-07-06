import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import api from '../api/client'
import { isAuthed } from '../auth/token'

export default function ProtectedRoute({ children }) {
  const [ok, setOk] = useState(isAuthed())

  // Optional: verify token by hitting a protected endpoint quickly
  useEffect(() => {
    if (!ok) return
    api.get('/favorites').then(
      () => setOk(true),
      () => setOk(false)
    )
  }, [])

  if (!ok) return <Navigate to="/login" replace />
  return children
}