import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import { setToken } from '../auth/token';
import './Auth.css'; // same CSS as Login.jsx

export default function Signup() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');

    // Basic validation
    if (!email.trim() || !password.trim()) {
      setErr('Please enter both email and password.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setErr('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setErr('Password must be at least 6 characters long.');
      return;
    }

    try {
      setLoading(true);
      const { data } = await api.post('/signup', { email, password });
      setToken(data.access_token);
      nav('/dashboard');
    } catch (e) {
      const message = e?.response?.data?.error;
      if (message && message.toLowerCase().includes('exists')) {
        setErr('An account with this email already exists.');
      } else {
        setErr(message || 'Signup failed.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <form className="auth-form" onSubmit={onSubmit}>
        <h2 className="auth-title">Create Your Account</h2>
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
          {loading ? 'Signing up...' : 'Sign Up'}
        </button>

        <small className="auth-footer">
          Already have an account? <Link to="/login" className="auth-link">Login</Link>
        </small>
      </form>
    </div>
  );
}
