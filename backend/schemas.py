from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class Token(BaseModel):
    access_token: str
    token_type: str


class UserBase(BaseModel):
    username: str
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    position: Optional[str] = None
    is_admin: bool = False


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    password: Optional[str] = None
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    position: Optional[str] = None
    is_admin: Optional[bool] = None


class UserResponse(UserBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class UserDirectoryResponse(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    position: Optional[str] = None

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


# Document schemas

class DocumentVariableSchema(BaseModel):
    key: str
    label: str
    type: str = "text"
    img_width: Optional[float] = None
    img_height: Optional[float] = None
    img_unit: Optional[str] = "mm"


class DocumentTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None


class DocumentTemplateUpdate(BaseModel):
    name: Optional[str] = None
    folder_name: Optional[str] = None
    description: Optional[str] = None
    variables: Optional[List[DocumentVariableSchema]] = None


class DocumentTemplateResponse(BaseModel):
    id: int
    name: str
    folder_name: Optional[str] = None
    description: Optional[str] = None
    file_type: str
    original_filename: str
    file_size: Optional[int] = None
    variables: List[DocumentVariableSchema] = []
    created_at: datetime
    created_by_username: Optional[str] = None

    class Config:
        from_attributes = True


class TemplateBundleItemResponse(BaseModel):
    id: int
    template_id: int
    display_name: str
    output_name_pattern: Optional[str] = None
    file_type: Optional[str] = None
    order: int = 0

    class Config:
        from_attributes = True


class TemplateBundleResponse(BaseModel):
    id: int
    name: str
    template_folder: Optional[str] = None
    description: Optional[str] = None
    variables: list = []
    items: List[TemplateBundleItemResponse] = []
    created_at: datetime
    created_by_username: Optional[str] = None

    class Config:
        from_attributes = True


class BundlePurchaseOrderExtractResponse(BaseModel):
    filename: str
    field_values: dict
    purchase_items: list = []
    extracted_keys: List[str] = []
    inferred_keys: List[str] = []
    missing_keys: List[str] = []
    warnings: List[str] = []


class DocumentRecordCreate(BaseModel):
    template_id: int
    title: str
    field_values: dict


class DocumentRecordResponse(BaseModel):
    id: int
    template_id: int
    template_name: Optional[str] = None
    file_type: Optional[str] = None
    title: str
    field_values: dict
    original_filename: Optional[str] = None
    file_size: Optional[int] = None
    created_at: datetime
    created_by_username: Optional[str] = None

    class Config:
        from_attributes = True
