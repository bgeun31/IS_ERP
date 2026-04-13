import axios from 'axios';
import type {
  AssetItem,
  BundlePurchaseOrderExtractResult,
  DeviceListItem,
  DeviceSnapshot,
  DocumentRecord,
  DocumentTemplate,
  DocumentVariable,
  LogFile,
  TemplateBundle,
  UploadResponse,
  User,
  UserDirectoryEntry,
} from '../types';

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
export const getDevices = (year?: number, month?: number) =>
  api.get<DeviceListItem[]>('/devices', { params: { year, month } });
export const getDevice = (name: string) =>
  api.get<{ device_name: string; snapshots: DeviceSnapshot[] }>(`/devices/${encodeURIComponent(name)}`);

// Assets
export const getAssets = () => api.get<AssetItem[]>('/assets');
export const updateAsset = (deviceName: string, data: Partial<AssetItem>) =>
  api.put<AssetItem>(`/assets/${encodeURIComponent(deviceName)}`, data);
export const uploadAssetExcel = (formData: FormData) =>
  api.post<{ created: number; updated: number; skipped: number; errors: string[]; total_rows: number }>('/assets/upload', formData);
export const syncAssetsFromLogs = () =>
  api.post<{ synced: number; created: number }>('/assets/sync');

// Logs
export const getLogs = (year?: number, month?: number) =>
  api.get<LogFile[]>('/logs', { params: { year, month } });
export const uploadLogs = (formData: FormData) => api.post<UploadResponse>('/logs/upload', formData);
export const deleteLog = (id: number) => api.delete(`/logs/${id}`);
export const getRawLog = (id: number) => api.get<{ content: string; filename: string }>(`/logs/${id}/raw`);

// Users
export const getUsers = () => api.get<User[]>('/users');
export const getUserDirectory = () => api.get<UserDirectoryEntry[]>('/users/directory');
export const createUser = (data: {
  username: string;
  password: string;
  full_name?: string;
  phone_number?: string;
  position?: string;
  is_admin: boolean;
}) =>
  api.post<User>('/users', data);
export const updateUser = (id: number, data: {
  password?: string;
  full_name?: string;
  phone_number?: string;
  position?: string;
  is_admin?: boolean;
}) =>
  api.put<User>(`/users/${id}`, data);
export const deleteUser = (id: number) => api.delete(`/users/${id}`);

// Documents - Templates
export const getTemplates = () => api.get<DocumentTemplate[]>('/documents/templates');
export const createTemplate = (formData: FormData) =>
  api.post<DocumentTemplate>('/documents/templates', formData);
export const updateTemplate = (id: number, data: { name?: string; folder_name?: string; description?: string; variables?: DocumentVariable[] }) =>
  api.put<DocumentTemplate>(`/documents/templates/${id}`, data);
export const deleteTemplate = (id: number) => api.delete(`/documents/templates/${id}`);
export const replaceTemplateFile = (id: number, formData: FormData) =>
  api.post<DocumentTemplate>(`/documents/templates/${id}/file`, formData);
export const getTemplateFile = (id: number) =>
  api.get(`/documents/templates/${id}/file`, { responseType: 'arraybuffer' });

// Documents - Records
export const getRecords = () => api.get<DocumentRecord[]>('/documents/records');
export const createRecord = (formData: FormData) =>
  api.post<DocumentRecord>('/documents/records', formData);
export const deleteRecord = (id: number) => api.delete(`/documents/records/${id}`);
export const getRecordFile = (id: number) =>
  api.get(`/documents/records/${id}/file`, { responseType: 'arraybuffer' });

// Documents - Bundles
export const getBundles = () => api.get<TemplateBundle[]>('/documents/bundles');
export const getBundle = (id: number) => api.get<TemplateBundle>(`/documents/bundles/${id}`);
export const generateBundle = (id: number, formData: FormData) =>
  api.post(`/documents/bundles/${id}/generate`, formData, { responseType: 'arraybuffer' });
export const extractBundlePurchaseOrder = (id: number, formData: FormData) =>
  api.post<BundlePurchaseOrderExtractResult>(`/documents/bundles/${id}/purchase-order/extract`, formData);

export default api;
