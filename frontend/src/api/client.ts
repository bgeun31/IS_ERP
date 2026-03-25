import axios from 'axios';
import type { DeviceListItem, DeviceSnapshot, LogFile, UploadResponse, User } from '../types';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const login = (username: string, password: string) => {
  const params = new URLSearchParams({ username, password });
  return api.post<{ access_token: string; token_type: string }>('/auth/login', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
};
export const getMe = () => api.get<User>('/auth/me');

// Devices
export const getDevices = () => api.get<DeviceListItem[]>('/devices');
export const getDevice = (name: string) =>
  api.get<{ device_name: string; snapshots: DeviceSnapshot[] }>(`/devices/${encodeURIComponent(name)}`);

// Logs
export const getLogs = (year?: number, month?: number) =>
  api.get<LogFile[]>('/logs', { params: { year, month } });
export const uploadLogs = (formData: FormData) => api.post<UploadResponse>('/logs/upload', formData);
export const deleteLog = (id: number) => api.delete(`/logs/${id}`);
export const getRawLog = (id: number) => api.get<{ content: string; filename: string }>(`/logs/${id}/raw`);

// Users
export const getUsers = () => api.get<User[]>('/users');
export const createUser = (data: { username: string; password: string; is_admin: boolean }) =>
  api.post<User>('/users', data);
export const updateUser = (id: number, data: { password?: string; is_admin?: boolean }) =>
  api.put<User>(`/users/${id}`, data);
export const deleteUser = (id: number) => api.delete(`/users/${id}`);

export default api;
