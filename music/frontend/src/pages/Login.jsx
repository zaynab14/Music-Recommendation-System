import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api/client'
import { setToken } from '../auth/token'
import './Auth.css';

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');

    if (!email.trim() || !password.trim()) {
      setErr('Please enter both email and password.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setErr('Please enter a valid email address.');
      return;
    }

    try {
      setLoading(true);
      const { data } = await api.post('/login', { email, password });
      setToken(data.access_token);
      nav('/dashboard');
    } catch (e) {
      setErr(e?.response?.data?.error || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  }

  // 👇 handle Google login click
  const handleGoogleLogin = () => {
    window.location.href = "http://localhost:5000/auth/google"; 
    // (replace with your backend Google OAuth route)
  };

  return (
    <div className="auth-container">
      <form className="auth-form" onSubmit={onSubmit}>
        <h2 className="auth-title">Welcome Back</h2>
        {err && <div className="auth-error">{err}</div>}

        <input
          className="auth-input"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="auth-input"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button className="auth-button" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>

        <div className="divider">or</div>

        <button 
          type="button" 
          className="google-button" 
          onClick={handleGoogleLogin}
        >
          <img src="/google.png" alt="Google" className="google-icon" />
          Continue with Google
        </button>

        <small className="auth-footer">
          No account? <Link to="/signup" className="auth-link">Sign up</Link>
        </small>
      </form>
    </div>
  );
}
