from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    log_files = relationship("LogFile", back_populates="uploader")


class LogFile(Base):
    __tablename__ = "log_files"

    id = Column(Integer, primary_key=True, index=True)
    device_name = Column(String(255), nullable=False, index=True)
    original_filename = Column(String(255), nullable=False)
    minio_object_key = Column(String(500), nullable=False)
    file_size = Column(Integer)
    log_year = Column(Integer, nullable=False)
    log_month = Column(Integer, nullable=False)
    uploaded_at = Column(DateTime, server_default=func.now())
    uploaded_by = Column(Integer, ForeignKey("users.id"))

    uploader = relationship("User", back_populates="log_files")
    snapshot = relationship(
        "DeviceSnapshot", back_populates="log_file", uselist=False, cascade="all, delete-orphan"
    )


class DeviceSnapshot(Base):
    __tablename__ = "device_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    log_file_id = Column(Integer, ForeignKey("log_files.id"), unique=True)
    device_name = Column(String(255), nullable=False, index=True)
    sysname = Column(String(255))
    system_type = Column(String(255))
    uptime = Column(String(255))
    primary_version = Column(String(255))
    secondary_version = Column(String(255))
    serial_number = Column(String(255))
    banner = Column(String(50))
    sntp = Column(String(50))
    cpu = Column(Float)
    fan_operational = Column(Integer)
    fan_total = Column(Integer)
    temp_value = Column(Float)
    temp_status = Column(String(50))
    ssh_access = Column(String(100))
    ssh_enabled = Column(String(50))
    ssh_access_profile_status = Column(String(50))
    snmp_access = Column(String(100))
    snmp_enabled = Column(String(50))
    snmp_access_profile_status = Column(String(50))
    snmp_errors = Column(String(50))
    snmp_auth_errors = Column(String(50))
    account_admin = Column(Boolean)
    account_user = Column(Boolean)
    parsed_at = Column(DateTime, server_default=func.now())

    log_file = relationship("LogFile", back_populates="snapshot")
    vlans = relationship("DeviceVlan", back_populates="snapshot", cascade="all, delete-orphan")
    port_vlans = relationship("DevicePortVlan", back_populates="snapshot", cascade="all, delete-orphan")
    power_supplies = relationship("DevicePower", back_populates="snapshot", cascade="all, delete-orphan")


class DeviceVlan(Base):
    __tablename__ = "device_vlans"

    id = Column(Integer, primary_key=True, index=True)
    snapshot_id = Column(Integer, ForeignKey("device_snapshots.id"))
    vlan_name = Column(String(255))
    vlan_id = Column(String(50))

    snapshot = relationship("DeviceSnapshot", back_populates="vlans")


class DevicePortVlan(Base):
    __tablename__ = "device_port_vlans"

    id = Column(Integer, primary_key=True, index=True)
    snapshot_id = Column(Integer, ForeignKey("device_snapshots.id"))
    vlan_name = Column(String(255))

    snapshot = relationship("DeviceSnapshot", back_populates="port_vlans")


class DevicePower(Base):
    __tablename__ = "device_power"

    id = Column(Integer, primary_key=True, index=True)
    snapshot_id = Column(Integer, ForeignKey("device_snapshots.id"))
    supply_id = Column(String(50))
    state = Column(String(50))

    snapshot = relationship("DeviceSnapshot", back_populates="power_supplies")


class DocumentTemplate(Base):
    __tablename__ = "document_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(String(500))
    file_type = Column(String(10), nullable=False)  # 'docx' or 'xlsx'
    original_filename = Column(String(255), nullable=False)
    minio_object_key = Column(String(500), nullable=False)
    file_size = Column(Integer)
    variables = Column(JSON)  # [{"key": "이름", "label": "담당자 이름"}, ...]
    created_at = Column(DateTime, server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"))

    creator = relationship("User", foreign_keys=[created_by])
    records = relationship("DocumentRecord", back_populates="template", cascade="all, delete-orphan")


class DocumentRecord(Base):
    __tablename__ = "document_records"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("document_templates.id"))
    title = Column(String(255), nullable=False)
    field_values = Column(JSON)  # {"이름": "송봉근", "나이": "26"}
    original_filename = Column(String(255))
    minio_object_key = Column(String(500))
    file_size = Column(Integer)
    created_at = Column(DateTime, server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"))

    template = relationship("DocumentTemplate", back_populates="records")
    creator = relationship("User", foreign_keys=[created_by])
