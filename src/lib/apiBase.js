/** Backend API base path. Set VITE_API_URL on Render before build (e.g. https://your-api.onrender.com). */
function resolveApiBase() {
  const raw = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE || '').trim();
  if (!raw) return '/api';
  const url = raw.replace(/\/$/, '');
  return url.endsWith('/api') ? url : `${url}/api`;
}

export const API_BASE = resolveApiBase();
