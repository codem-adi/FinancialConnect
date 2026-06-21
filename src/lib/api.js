import { authHeaders, getAuthToken } from './authStorage';
import { API_BASE } from './apiBase';
const LOCAL_KEY = 'retirewise-data';

export function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveToLocalStorage(data) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
}

export async function fetchAppData() {
  if (!getAuthToken()) return null;
  try {
    const res = await fetch(`${API_BASE}/`, { headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      saveToLocalStorage(data);
      return data;
    }
    if (res.status === 401) return null;
  } catch { /* fallback */ }
  return loadFromLocalStorage();
}

export async function saveAppData(data, audit) {
  saveToLocalStorage(data);
  const body = audit ? { ...data, _audit: audit } : data;
  const res = await fetch(`${API_BASE}/`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save data');
  }
  return res.json();
}

export async function savePersonalFinance(finance, audit) {
  const body = audit ? { ...finance, _audit: audit } : finance;
  const res = await fetch(`${API_BASE}/finance`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save');
  }
  return res.json();
}

export async function savePlan(plan, audit) {
  const body = audit ? { ...plan, _audit: audit } : plan;
  const res = await fetch(`${API_BASE}/plans`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deletePlan(id) {
  await fetch(`${API_BASE}/plans/${id}`, { method: 'DELETE', headers: authHeaders() });
}

export async function duplicatePlan(id) {
  const res = await fetch(`${API_BASE}/plans/${id}/duplicate`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return res.json();
}

export async function activatePlan(id) {
  const res = await fetch(`${API_BASE}/plans/active/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  return res.ok ? res.json() : { activePlanId: id };
}

export async function setTheme(theme) {
  await fetch(`${API_BASE}/theme`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ theme }),
  });
}

export async function fetchJoinCode() {
  const res = await fetch(`${API_BASE}/team/join-code`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not load join code');
  return data;
}

export async function fetchJoinRequests() {
  const res = await fetch(`${API_BASE}/team/join-requests`, { headers: authHeaders() });
  return res.ok ? res.json() : { requests: [] };
}

export async function approveJoinRequest(id) {
  const res = await fetch(`${API_BASE}/team/join-requests/${id}/approve`, {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Approve failed');
  return data;
}

export async function rejectJoinRequest(id) {
  const res = await fetch(`${API_BASE}/team/join-requests/${id}/reject`, {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Reject failed');
  return data;
}

export async function fetchTeamMembers() {
  const res = await fetch(`${API_BASE}/team/members`, { headers: authHeaders() });
  return res.ok ? res.json() : { members: [] };
}

export async function inviteTeamMember(email, role) {
  const res = await fetch(`${API_BASE}/team/members`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Invite failed');
  return data;
}

export async function updateTeamMemberRole(memberId, role) {
  const res = await fetch(`${API_BASE}/team/members/${memberId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Update failed');
  return data;
}

export async function removeTeamMember(memberId) {
  const res = await fetch(`${API_BASE}/team/members/${memberId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Remove failed');
  return data;
}

export async function requestLeaveGroupOtp() {
  const res = await fetch(`${API_BASE}/team/leave/request-otp`, {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not send verification code');
  return data;
}

export async function leaveGroup(otp) {
  const res = await fetch(`${API_BASE}/team/leave`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ otp }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not leave group');
  return data;
}

export async function fetchAuditLog(limit = 20, offset = 0) {
  const res = await fetch(`${API_BASE}/audit?limit=${limit}&offset=${offset}`, { headers: authHeaders() });
  return res.ok ? res.json() : { logs: [], hasMore: false, offset: 0, limit };
}

export async function fetchNotifications(limit = 10) {
  const res = await fetch(`${API_BASE}/notifications?limit=${limit}`, { headers: authHeaders() });
  return res.ok ? res.json() : { notifications: [], unreadCount: 0 };
}

export async function markNotificationRead(id) {
  await fetch(`${API_BASE}/notifications/${id}/read`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
}

export async function markAllNotificationsRead() {
  await fetch(`${API_BASE}/notifications/read-all`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
}

export function exportJSON(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `retirewise-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importJSON(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  await saveAppData(data, { section: 'general', action: 'import', summary: 'Imported data from JSON file' });
  return data;
}
