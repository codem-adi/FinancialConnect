import { getAuthToken } from './authStorage';
import { appApi, authApi } from '../services/endpoints';

const LOCAL_KEY = 'retirewise-data';

function apiError(err, fallback) {
  throw new Error(err.response?.data?.error || fallback);
}

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
    const { data } = await appApi.getData();
    saveToLocalStorage(data);
    return data;
  } catch (err) {
    if (err.response?.status === 401) return null;
    return loadFromLocalStorage();
  }
}

export async function saveAppData(data, audit) {
  saveToLocalStorage(data);
  const body = audit ? { ...data, _audit: audit } : data;
  try {
    const { data: saved } = await appApi.saveData(body);
    return saved;
  } catch (err) {
    apiError(err, 'Failed to save data');
  }
}

export async function savePersonalFinance(finance, audit) {
  const body = audit ? { ...finance, _audit: audit } : finance;
  try {
    const { data } = await appApi.saveFinance(body);
    return data;
  } catch (err) {
    apiError(err, 'Failed to save');
  }
}

export async function savePlan(plan, audit) {
  const body = audit ? { ...plan, _audit: audit } : plan;
  const { data } = await appApi.savePlan(body);
  return data;
}

export async function deletePlan(id) {
  await appApi.deletePlan(id);
}

export async function duplicatePlan(id) {
  const { data } = await appApi.duplicatePlan(id);
  return data;
}

export async function activatePlan(id) {
  try {
    const { data } = await appApi.activatePlan(id);
    return data;
  } catch {
    return { activePlanId: id };
  }
}

export async function setTheme(theme) {
  await appApi.setTheme(theme);
}

export async function fetchJoinCode() {
  try {
    const { data } = await appApi.joinCode();
    return data;
  } catch (err) {
    apiError(err, 'Could not load join code');
  }
}

export async function fetchJoinRequests() {
  try {
    const { data } = await appApi.joinRequests();
    return data;
  } catch {
    return { requests: [] };
  }
}

export async function approveJoinRequest(id) {
  try {
    const { data } = await appApi.approveJoin(id);
    return data;
  } catch (err) {
    apiError(err, 'Approve failed');
  }
}

export async function rejectJoinRequest(id) {
  try {
    const { data } = await appApi.rejectJoin(id);
    return data;
  } catch (err) {
    apiError(err, 'Reject failed');
  }
}

export async function fetchTeamMembers() {
  try {
    const { data } = await appApi.teamMembers();
    return data;
  } catch {
    return { members: [] };
  }
}

export async function inviteTeamMember(email, role) {
  try {
    const { data } = await appApi.inviteMember(email, role);
    return data;
  } catch (err) {
    apiError(err, 'Invite failed');
  }
}

export async function updateTeamMemberRole(memberId, role) {
  try {
    const { data } = await appApi.updateMemberRole(memberId, role);
    return data;
  } catch (err) {
    apiError(err, 'Update failed');
  }
}

export async function removeTeamMember(memberId) {
  try {
    const { data } = await appApi.removeMember(memberId);
    return data;
  } catch (err) {
    apiError(err, 'Remove failed');
  }
}

export async function requestLeaveGroupOtp() {
  try {
    const { data } = await authApi.leaveRequestOtp();
    return data;
  } catch (err) {
    apiError(err, 'Could not send verification code');
  }
}

export async function leaveGroup(otp) {
  try {
    const { data } = await authApi.leave(otp);
    return data;
  } catch (err) {
    apiError(err, 'Could not leave group');
  }
}

export async function fetchAuditLog(limit = 20, offset = 0) {
  try {
    const { data } = await appApi.auditLog(limit, offset);
    return data;
  } catch {
    return { logs: [], hasMore: false, offset: 0, limit };
  }
}

export async function fetchNotifications(limit = 10) {
  try {
    const { data } = await appApi.notifications(limit);
    return data;
  } catch {
    return { notifications: [], unreadCount: 0 };
  }
}

export async function markNotificationRead(id) {
  await appApi.markNotificationRead(id);
}

export async function markAllNotificationsRead() {
  await appApi.markAllNotificationsRead();
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
