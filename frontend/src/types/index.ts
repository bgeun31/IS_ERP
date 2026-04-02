export interface User {
  id: number;
  username: string;
  full_name: string | null;
  phone_number: string | null;
  position: string | null;
  is_admin: boolean;
  created_at: string;
}

export interface UserDirectoryEntry {
  id: number;
  username: string;
  full_name: string | null;
  phone_number: string | null;
  position: string | null;
}

export interface DeviceVlan {
  vlan_name: string;
  vlan_id: string;
}

export interface DevicePower {
  supply_id: string;
  state: string;
}

export interface DeviceSnapshot {
  id: number;
  log_file_id: number;
  device_name: string;
  sysname: string | null;
  system_type: string | null;
  uptime: string | null;
  primary_version: string | null;
  secondary_version: string | null;
  serial_number: string | null;
  banner: string | null;
  sntp: string | null;
  cpu: number | null;
  fan_operational: number | null;
  fan_total: number | null;
  temp_value: number | null;
  temp_status: string | null;
  ssh_access: string | null;
  ssh_enabled: string | null;
  ssh_access_profile_status: string | null;
  snmp_access: string | null;
  snmp_enabled: string | null;
  snmp_access_profile_status: string | null;
  snmp_errors: string | null;
  snmp_auth_errors: string | null;
  account_admin: boolean | null;
  account_user: boolean | null;
  vlans: DeviceVlan[];
  port_vlans: string[];
  power_supplies: DevicePower[];
  parsed_at: string | null;
  log_year: number | null;
  log_month: number | null;
  original_filename: string | null;
}

export interface DeviceListItem {
  device_name: string;
  latest_snapshot: DeviceSnapshot | null;
  snapshot_count: number;
}

export interface LogFile {
  id: number;
  device_name: string;
  original_filename: string;
  log_year: number;
  log_month: number;
  file_size: number | null;
  uploaded_at: string;
  uploaded_by_username: string | null;
}

export interface UploadResult {
  filename: string;
  device_name: string;
  success: boolean;
  error?: string;
}

export interface UploadResponse {
  results: UploadResult[];
  success_count: number;
  error_count: number;
}

// Document types

export interface DocumentVariable {
  key: string;
  label: string;
  type?: 'text' | 'image';
  img_width?: number | null;
  img_height?: number | null;
  img_unit?: 'mm' | 'cm' | null;
}

export interface DocumentTemplate {
  id: number;
  name: string;
  description: string | null;
  file_type: 'docx' | 'xlsx';
  original_filename: string;
  file_size: number | null;
  variables: DocumentVariable[];
  created_at: string;
  created_by_username: string | null;
}

export interface BundleVariable {
  key: string;
  label: string;
  type: string;
  section: string;
}

export interface TemplateBundleItem {
  id: number;
  template_id: number;
  display_name: string;
  output_name_pattern: string | null;
  file_type: 'docx' | 'xlsx' | null;
  order: number;
}

export interface TemplateBundle {
  id: number;
  name: string;
  description: string | null;
  variables: BundleVariable[];
  items: TemplateBundleItem[];
  created_at: string;
  created_by_username: string | null;
}

export interface BundlePurchaseOrderExtractResult {
  filename: string;
  field_values: Record<string, string>;
  extracted_keys: string[];
  inferred_keys: string[];
  missing_keys: string[];
  warnings: string[];
}

export interface DocumentRecord {
  id: number;
  template_id: number;
  template_name: string | null;
  file_type: 'docx' | 'xlsx' | null;
  title: string;
  field_values: Record<string, string>;
  original_filename: string | null;
  file_size: number | null;
  created_at: string;
  created_by_username: string | null;
}
