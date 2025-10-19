'use client';

import { useEffect, useState } from 'react';
import { LoginForm } from '../components/LoginForm';
import { ApiKeyManager } from '../components/ApiKeyManager';

export default function Page() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('openpayg-token');
    if (stored) {
      setToken(stored);
    }
  }, []);

  const handleLogout = () => {
    window.localStorage.removeItem('openpayg-token');
    setToken(null);
  };

  if (!token) {
    return <LoginForm onAuthenticated={setToken} />;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 backdrop-blur">
        <div className="max-w-6xl mx-auto flex justify-between items-center px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold">OpenPayG Dashboard</h1>
            <p className="text-sm text-slate-400">Monitor usage, billing, and keys in real time</p>
          </div>
          <button
            onClick={handleLogout}
            className="bg-slate-800 hover:bg-slate-700 rounded px-4 py-2 text-sm"
          >
            Sign Out
          </button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        <ApiKeyManager token={token} />
      </main>
    </div>
  );
}
