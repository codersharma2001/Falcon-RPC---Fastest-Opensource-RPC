export async function login(email: string, password: string): Promise<string> {
  const base = process.env.NEXT_PUBLIC_AUTH_API ?? 'http://localhost:8080';
  const response = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) {
    throw new Error('Invalid credentials');
  }
  const data = await response.json();
  return data.token as string;
}
