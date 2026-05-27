export function normalizeName(name: string): string {
  if (!name) throw new Error('name required');
  return name.trim().toLowerCase();
}

export function normalizeEmail(email: string): string {
  if (!email) throw new Error('email required');
  return email.trim().toLowerCase();
}

export function normalizeUsername(username: string): string {
  if (!username) throw new Error('username required');
  return username.trim().toLowerCase();
}
