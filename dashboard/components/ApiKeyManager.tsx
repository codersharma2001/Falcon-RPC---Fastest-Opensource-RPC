'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, type ApiKey } from '../lib/api';
import { UsageChart } from './UsageChart';

interface UsagePoint {
  day: string;
  request_count: number;
}

interface TopMethod {
  method: string;
  total: number;
}

interface BillingRecord {
  id: number;
  billing_period_start: string;
  billing_period_end: string;
  total_requests: number;
  overage_requests: number;
  amount_due: number;
  currency: string;
  plan: string;
}

interface AllowListEntry {
  id: number;
  cidr: string;
}

interface AggregateUsage {
  plan: string;
  total_requests: number;
}

interface Props {
  token: string;
}

export function ApiKeyManager({ token }: Props) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPlan, setNewPlan] = useState('dev');
  const [newName, setNewName] = useState('');
  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);
  const [selectedKeySecret, setSelectedKeySecret] = useState<string | null>(null);
  const [dailyUsage, setDailyUsage] = useState<UsagePoint[]>([]);
  const [topMethods, setTopMethods] = useState<TopMethod[]>([]);
  const [billing, setBilling] = useState<BillingRecord[]>([]);
  const [allowList, setAllowList] = useState<AllowListEntry[]>([]);
  const [newCidr, setNewCidr] = useState('');
  const [aggregates, setAggregates] = useState<AggregateUsage[]>([]);

  useEffect(() => {
    void refreshKeys();
    void refreshAggregates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!selectedKey) return;
    void refreshDetails(selectedKey.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey?.id]);

  const refreshKeys = async (preferredId?: string) => {
    try {
      setLoading(true);
      const data = await apiFetch<ApiKey[]>('/api/keys', token);
      setKeys(data);
      if (data.length > 0) {
        const nextSelected =
          data.find((item) => item.id === (preferredId ?? selectedKey?.id)) ?? data[0];
        setSelectedKey(nextSelected);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load keys');
    } finally {
      setLoading(false);
    }
  };

  const refreshAggregates = async () => {
    try {
      const data = await apiFetch<{ data: AggregateUsage[] }>('/api/usage/aggregate', token);
      setAggregates(data.data);
    } catch (err) {
      console.error(err);
    }
  };

  const refreshDetails = async (apiKeyId: string) => {
    try {
      setSelectedKeySecret(null);
      const [usageRes, methodRes, billingRes, allowListRes, secretRes] = await Promise.all([
        apiFetch<{ data: UsagePoint[] }>(`/api/usage/${apiKeyId}/daily`, token),
        apiFetch<{ data: TopMethod[] }>(`/api/usage/${apiKeyId}/top-methods`, token),
        apiFetch<{ data: BillingRecord[] }>(`/api/billing/${apiKeyId}`, token),
        apiFetch<{ entries: AllowListEntry[] }>(`/api/keys/${apiKeyId}/allowlist`, token),
        apiFetch<{ id: string; apiKey: string | null }>(`/api/keys/${apiKeyId}/secret`, token)
      ]);
      setDailyUsage(usageRes.data);
      setTopMethods(methodRes.data);
      setBilling(billingRes.data);
      setAllowList(allowListRes.entries);
      setSelectedKeySecret(secretRes.apiKey ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    }
  };

  const createKey = async () => {
    if (!newName.trim()) {
      setError('Key name is required');
      return;
    }
    try {
      setError(null);
      const result = await apiFetch<{ id: string; apiKey: string }>(
        '/api/keys',
        token,
        {
          method: 'POST',
          body: JSON.stringify({ plan: newPlan, name: newName })
        }
      );
      setNewKeySecret(result.apiKey);
      setNewName('');
      await refreshKeys(result.id);
      await refreshAggregates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key');
    }
  };

  const addCidr = async () => {
    if (!selectedKey) return;
    if (!newCidr.trim()) return;
    try {
      await apiFetch(`/api/keys/${selectedKey.id}/allowlist`, token, {
        method: 'POST',
        body: JSON.stringify({ cidr: newCidr.trim() })
      });
      setNewCidr('');
      await refreshDetails(selectedKey.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add CIDR');
    }
  };

  const removeCidr = async (entryId: number) => {
    if (!selectedKey) return;
    try {
      await apiFetch(`/api/allowlist/${entryId}`, token, { method: 'DELETE' });
      await refreshDetails(selectedKey.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove CIDR');
    }
  };

  const totalRequests = useMemo(() => dailyUsage.reduce((acc, item) => acc + item.request_count, 0), [dailyUsage]);

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-900/30 border border-red-500/60 text-sm rounded p-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Create API Key</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm mb-1">Name</label>
              <input
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Plan</label>
              <select
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2"
                value={newPlan}
                onChange={(e) => setNewPlan(e.target.value)}
              >
                <option value="free">Free</option>
                <option value="dev">Developer</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            <button
              onClick={createKey}
              className="w-full bg-emerald-600 hover:bg-emerald-500 transition-colors rounded py-2 font-semibold"
            >
              Create Key
            </button>
            {newKeySecret && (
              <div className="bg-emerald-900/40 border border-emerald-500/60 rounded p-3 text-sm break-all">
                <strong>New Key</strong>
                <p className="mt-1">{newKeySecret}</p>
              </div>
            )}
          </div>
        </div>

        <div className="card lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Usage by Plan</h2>
          <div className="flex flex-wrap gap-3">
            {aggregates.map((item) => (
              <div key={item.plan} className="bg-slate-800/60 rounded px-4 py-3">
                <p className="text-sm uppercase tracking-wide text-slate-400">{item.plan}</p>
                <p className="text-xl font-semibold">{item.total_requests.toLocaleString()} requests</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold">API Keys</h2>
            <p className="text-sm text-slate-400">Manage and monitor issued API keys</p>
          </div>
          <div>
            <select
              className="rounded border border-slate-700 bg-slate-950 px-3 py-2"
              value={selectedKey?.id ?? ''}
              onChange={(e) => {
                const key = keys.find((item) => item.id === e.target.value) ?? null;
                setSelectedKey(key);
              }}
            >
              {keys.map((key) => (
                <option key={key.id} value={key.id}>
                  {key.name ?? key.id.slice(0, 8)} — {key.plan}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-400">
                <th className="py-2">Name</th>
                <th>Plan</th>
                <th>Created</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} className="border-t border-slate-800">
                  <td className="py-2">{key.name ?? key.id.slice(0, 12)}</td>
                  <td className="capitalize">{key.plan}</td>
                  <td>{new Date(key.created_at).toLocaleString()}</td>
                  <td>{key.revoked_at ? 'Revoked' : 'Active'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedKey && (
        <>
          <div className="card">
            <h3 className="text-lg font-semibold mb-2">API Key Secret</h3>
            {selectedKeySecret ? (
              <code className="block bg-slate-900/70 border border-slate-700 rounded px-3 py-2 break-all text-sm">
                {selectedKeySecret}
              </code>
            ) : (
              <p className="text-sm text-slate-500">Secret unavailable for this key.</p>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="card xl:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Daily Usage</h3>
                <p className="text-sm text-slate-400">{selectedKey.name ?? selectedKey.id}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-400 uppercase">Total</p>
                <p className="text-xl font-semibold">{totalRequests.toLocaleString()}</p>
              </div>
            </div>
            <UsageChart data={dailyUsage} />
          </div>

          <div className="card space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Top Methods</h3>
              <ul className="space-y-2 text-sm">
                {topMethods.map((method) => (
                  <li key={method.method} className="flex justify-between">
                    <span>{method.method}</span>
                    <span className="text-slate-400">{method.total.toLocaleString()}</span>
                  </li>
                ))}
                {topMethods.length === 0 && <p className="text-slate-500">No data yet</p>}
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">IP Allowlist</h3>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-2"
                    placeholder="192.168.1.0/24"
                    value={newCidr}
                    onChange={(e) => setNewCidr(e.target.value)}
                  />
                  <button
                    onClick={addCidr}
                    className="bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded"
                  >
                    Add
                  </button>
                </div>
                <ul className="space-y-1 text-sm">
                  {allowList.map((entry) => (
                    <li key={entry.id} className="flex justify-between bg-slate-800/60 rounded px-3 py-2">
                      <span>{entry.cidr}</span>
                      <button
                        className="text-red-400"
                        onClick={() => removeCidr(entry.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                  {allowList.length === 0 && <p className="text-slate-500">No restrictions</p>}
                </ul>
              </div>
            </div>
          </div>
        </div>
        </>
      )}

      <div className="card">
        <h3 className="text-lg font-semibold mb-3">Billing Summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="py-2">Period</th>
                <th>Plan</th>
                <th>Total</th>
                <th>Overage</th>
                <th>Amount Due</th>
              </tr>
            </thead>
            <tbody>
              {billing.map((record) => (
                <tr key={record.id} className="border-t border-slate-800">
                  <td className="py-2">
                    {record.billing_period_start} → {record.billing_period_end}
                  </td>
                  <td className="capitalize">{record.plan}</td>
                  <td>{record.total_requests.toLocaleString()}</td>
                  <td>{record.overage_requests.toLocaleString()}</td>
                  <td>
                    {record.currency} {record.amount_due.toFixed(4)}
                  </td>
                </tr>
              ))}
              {billing.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500">
                    No billing records yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
