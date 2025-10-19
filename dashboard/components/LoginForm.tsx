'use client';

import { useState } from 'react';
import { login } from '../lib/auth';

interface Props {
  onAuthenticated: (token: string) => void;
}

export function LoginForm({ onAuthenticated }: Props) {
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('change_me');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = await login(email, password);
      localStorage.setItem('openpayg-token', token);
      onAuthenticated(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-32 card">
      <h1 className="text-2xl font-semibold mb-6">Admin Login</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Email</label>
          <input
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Password</label>
          <input
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          className="w-full bg-emerald-600 hover:bg-emerald-500 transition-colors rounded py-2 font-semibold"
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
