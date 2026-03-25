from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class Token(BaseModel):
    access_token: str
    token_type: str


class UserBase(BaseModel):
    username: str
    is_admin: bool = False


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    password: Optional[str] = None
    is_admin: Optional[bool] = None


class UserResponse(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class DeviceVlanSchema(BaseModel):
    vlan_name: str
    vlan_id: str


class DevicePowerSchema(BaseModel):
    supply_id: str
    state: str


class DeviceSnapshotSchema(BaseModel):
    id: int
    log_file_id: int
    device_name: str
    sysname: Optional[str] = None
    system_type: Optional[str] = None
    uptime: Optional[str] = None
    primary_version: Optional[str] = None
    secondary_version: Optional[str] = None
    serial_number: Optional[str] = None
    banner: Optional[str] = None
    sntp: Optional[str] = None
    cpu: Optional[float] = None
    fan_operational: Optional[int] = None
    fan_total: Optional[int] = None
    temp_value: Optional[float] = None
    temp_status: Optional[str] = None
    ssh_access: Optional[str] = None
    ssh_enabled: Optional[str] = None
    ssh_access_profile_status: Optional[str] = None
    snmp_access: Optional[str] = None
    snmp_enabled: Optional[str] = None
    snmp_access_profile_status: Optional[str] = None
    snmp_errors: Optional[str] = None
    snmp_auth_errors: Optional[str] = None
    account_admin: Optional[bool] = None
    account_user: Optional[bool] = None
    vlans: List[DeviceVlanSchema] = []
    port_vlans: List[str] = []
    power_supplies: List[DevicePowerSchema] = []
    parsed_at: Optional[datetime] = None
    log_year: Optional[int] = None
    log_month: Optional[int] = None
    original_filename: Optional[str] = None


class DeviceListItem(BaseModel):
    device_name: str
    latest_snapshot: Optional[DeviceSnapshotSchema] = None
    snapshot_count: int = 0


class LogFileSchema(BaseModel):
    id: int
    device_name: str
    original_filename: str
    log_year: int
    log_month: int
    file_size: Optional[int] = None
    uploaded_at: datetime
    uploaded_by_username: Optional[str] = None

    class Config:
        from_attributes = True


class UploadResult(BaseModel):
    filename: str
    device_name: str
    success: bool
    error: Optional[str] = None


class UploadResponse(BaseModel):
    results: List[UploadResult]
    success_count: int
    error_count: int
