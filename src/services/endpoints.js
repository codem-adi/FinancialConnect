import api from './api';

export const authApi = {
  me: () => api.get('/auth/me'),
  login: (email, password) => api.post('/auth/login', { email, password }),
  signup: (payload) => api.post('/auth/signup', payload),
  verifyOtp: (payload) => api.post('/auth/verify-otp', payload),
  resendOtp: (email, purpose) => api.post('/auth/resend-otp', { email, purpose }),
  loginOtp: (email) => api.post('/auth/login-otp', { email }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (payload) => api.post('/auth/reset-password', payload),
  otpStatus: (email) => api.get('/auth/otp-status', { params: { email } }),
  leaveRequestOtp: () => api.post('/team/leave/request-otp'),
  leave: (otp) => api.post('/team/leave', { otp }),
};

export const appApi = {
  getData: () => api.get('/'),
  saveData: (body) => api.put('/', body),
  saveFinance: (body) => api.put('/finance', body),
  savePlan: (body) => api.post('/plans', body),
  deletePlan: (id) => api.delete(`/plans/${id}`),
  duplicatePlan: (id) => api.post(`/plans/${id}/duplicate`),
  activatePlan: (id) => api.patch(`/plans/active/${id}`),
  setTheme: (theme) => api.put('/theme', { theme }),
  joinCode: () => api.get('/team/join-code'),
  joinRequests: () => api.get('/team/join-requests'),
  approveJoin: (id) => api.post(`/team/join-requests/${id}/approve`),
  rejectJoin: (id) => api.post(`/team/join-requests/${id}/reject`),
  teamMembers: () => api.get('/team/members'),
  inviteMember: (email, role) => api.post('/team/members', { email, role }),
  updateMemberRole: (memberId, role) => api.patch(`/team/members/${memberId}`, { role }),
  removeMember: (memberId) => api.delete(`/team/members/${memberId}`),
  auditLog: (limit, offset) => api.get('/audit', { params: { limit, offset } }),
  notifications: (limit) => api.get('/notifications', { params: { limit } }),
  markNotificationRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllNotificationsRead: () => api.patch('/notifications/read-all'),
  health: () => api.get('/health'),
};
