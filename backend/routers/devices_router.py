from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import DeviceSnapshot, LogFile, User

router = APIRouter(prefix="/api/devices", tags=["devices"])


def _snapshot_to_dict(snap: DeviceSnapshot) -> dict:
    lf = snap.log_file
    return {
        "id": snap.id,
        "log_file_id": snap.log_file_id,
        "device_name": snap.device_name,
        "sysname": snap.sysname,
        "system_type": snap.system_type,
        "uptime": snap.uptime,
        "primary_version": snap.primary_version,
        "secondary_version": snap.secondary_version,
        "serial_number": snap.serial_number,
        "banner": snap.banner,
        "sntp": snap.sntp,
        "cpu": snap.cpu,
        "fan_operational": snap.fan_operational,
        "fan_total": snap.fan_total,
        "temp_value": snap.temp_value,
        "temp_status": snap.temp_status,
        "ssh_access": snap.ssh_access,
        "ssh_enabled": snap.ssh_enabled,
        "ssh_access_profile_status": snap.ssh_access_profile_status,
        "snmp_access": snap.snmp_access,
        "snmp_enabled": snap.snmp_enabled,
        "snmp_access_profile_status": snap.snmp_access_profile_status,
        "snmp_errors": snap.snmp_errors,
        "snmp_auth_errors": snap.snmp_auth_errors,
        "account_admin": snap.account_admin,
        "account_user": snap.account_user,
        "vlans": [{"vlan_name": v.vlan_name, "vlan_id": v.vlan_id} for v in snap.vlans],
        "port_vlans": [pv.vlan_name for pv in snap.port_vlans],
        "power_supplies": [{"supply_id": p.supply_id, "state": p.state} for p in snap.power_supplies],
        "parsed_at": snap.parsed_at.isoformat() if snap.parsed_at else None,
        "log_year": lf.log_year if lf else None,
        "log_month": lf.log_month if lf else None,
        "original_filename": lf.original_filename if lf else None,
    }


@router.get("")
def list_devices(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """모든 장비의 최신 스냅샷과 스냅샷 수를 반환합니다."""
    # 장비별 최신 log_file_id 서브쿼리
    subq = (
        db.query(
            DeviceSnapshot.device_name,
            func.max(LogFile.log_year * 100 + LogFile.log_month).label("latest_ym"),
        )
        .join(LogFile, DeviceSnapshot.log_file_id == LogFile.id)
        .group_by(DeviceSnapshot.device_name)
        .subquery()
    )

    # 장비별 최신 스냅샷
    latest_snaps = (
        db.query(DeviceSnapshot)
        .join(LogFile, DeviceSnapshot.log_file_id == LogFile.id)
        .join(
            subq,
            (DeviceSnapshot.device_name == subq.c.device_name)
            & ((LogFile.log_year * 100 + LogFile.log_month) == subq.c.latest_ym),
        )
        .all()
    )

    # 장비별 스냅샷 수
    counts = (
        db.query(DeviceSnapshot.device_name, func.count(DeviceSnapshot.id).label("cnt"))
        .group_by(DeviceSnapshot.device_name)
        .all()
    )
    count_map = {row.device_name: row.cnt for row in counts}

    result = []
    for snap in sorted(latest_snaps, key=lambda s: s.device_name):
        result.append(
            {
                "device_name": snap.device_name,
                "latest_snapshot": _snapshot_to_dict(snap),
                "snapshot_count": count_map.get(snap.device_name, 0),
            }
        )
    return result


@router.get("/{device_name}")
def get_device(
    device_name: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """특정 장비의 모든 스냅샷 이력을 반환합니다 (최신순)."""
    snaps = (
        db.query(DeviceSnapshot)
        .filter(DeviceSnapshot.device_name == device_name)
        .join(LogFile, DeviceSnapshot.log_file_id == LogFile.id)
        .order_by(LogFile.log_year.desc(), LogFile.log_month.desc())
        .all()
    )
    if not snaps:
        raise HTTPException(status_code=404, detail="장비를 찾을 수 없습니다")

    return {
        "device_name": device_name,
        "snapshots": [_snapshot_to_dict(s) for s in snaps],
    }
