import os
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

import minio_client
from auth import get_current_user
from database import get_db
from log_parser import parse_log_file
from models import DevicePower, DevicePortVlan, DeviceSnapshot, DeviceVlan, LogFile, User
from schemas import LogFileSchema, UploadResponse, UploadResult

router = APIRouter(prefix="/api/logs", tags=["logs"])


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


def _process_single_file(
    file_data: bytes,
    filename: str,
    log_year: int,
    log_month: int,
    user_id: int,
    db: Session,
) -> UploadResult:
    device_name = os.path.splitext(filename)[0]

    # 중복 처리: 같은 장비+연월 로그 교체
    existing = (
        db.query(LogFile)
        .filter(
            LogFile.device_name == device_name,
            LogFile.log_year == log_year,
            LogFile.log_month == log_month,
        )
        .first()
    )
    if existing:
        if existing.snapshot:
            db.delete(existing.snapshot)
            db.flush()
        minio_client.delete_file(existing.minio_object_key)
        db.delete(existing)
        db.flush()

    # MinIO 업로드
    object_key = f"{log_year}/{log_month:02d}/{device_name}/{filename}"
    if not minio_client.upload_file(object_key, file_data):
        return UploadResult(filename=filename, device_name=device_name, success=False, error="MinIO 업로드 실패")

    # DB에 로그 파일 레코드 저장
    log_file = LogFile(
        device_name=device_name,
        original_filename=filename,
        minio_object_key=object_key,
        file_size=len(file_data),
        log_year=log_year,
        log_month=log_month,
        uploaded_by=user_id,
    )
    db.add(log_file)
    db.flush()

    # 파싱
    try:
        content = file_data.decode("utf-8", errors="replace")
        parsed = parse_log_file(content)
    except Exception as e:
        db.rollback()
        return UploadResult(filename=filename, device_name=device_name, success=False, error=f"파싱 오류: {e}")

    sw = parsed.get("switch", {})
    mgmt = parsed.get("management", {})
    fan = parsed.get("fan", {})
    temp = parsed.get("temp", {})
    accounts = parsed.get("accounts", {})

    snapshot = DeviceSnapshot(
        log_file_id=log_file.id,
        device_name=device_name,
        sysname=sw.get("sysname") or None,
        system_type=sw.get("system_type") or None,
        uptime=sw.get("uptime") or None,
        primary_version=sw.get("primary_version") or None,
        secondary_version=sw.get("secondary_version") or None,
        serial_number=parsed.get("serial") or None,
        banner=parsed.get("banner"),
        sntp=parsed.get("sntp") or None,
        cpu=parsed.get("cpu"),
        fan_operational=fan.get("operational"),
        fan_total=fan.get("total"),
        temp_value=temp.get("value"),
        temp_status=temp.get("status"),
        ssh_access=mgmt.get("ssh_access"),
        ssh_enabled=mgmt.get("ssh_enabled"),
        ssh_access_profile_status=mgmt.get("ssh_access_profile_status"),
        snmp_access=mgmt.get("snmp_access"),
        snmp_enabled=mgmt.get("snmp_enabled"),
        snmp_access_profile_status=mgmt.get("snmp_access_profile_status"),
        snmp_errors=mgmt.get("snmp_errors"),
        snmp_auth_errors=mgmt.get("snmp_auth_errors"),
        account_admin=accounts.get("admin"),
        account_user=accounts.get("user"),
    )
    db.add(snapshot)
    db.flush()

    for name, vid in parsed.get("vlans", []):
        db.add(DeviceVlan(snapshot_id=snapshot.id, vlan_name=name, vlan_id=vid))

    for vname in parsed.get("port_vlans", []):
        db.add(DevicePortVlan(snapshot_id=snapshot.id, vlan_name=vname))

    for supply_id, state in parsed.get("power", {}).items():
        db.add(DevicePower(snapshot_id=snapshot.id, supply_id=supply_id, state=state))

    db.commit()
    return UploadResult(filename=filename, device_name=device_name, success=True)


@router.post("/upload", response_model=UploadResponse)
async def upload_logs(
    files: List[UploadFile] = File(...),
    log_year: int = Form(...),
    log_month: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not 2000 <= log_year <= 2100:
        raise HTTPException(status_code=400, detail="연도 값이 올바르지 않습니다")
    if not 1 <= log_month <= 12:
        raise HTTPException(status_code=400, detail="월 값이 올바르지 않습니다")

    results: List[UploadResult] = []
    for upload_file in files:
        if not upload_file.filename:
            continue
        data = await upload_file.read()
        result = _process_single_file(data, upload_file.filename, log_year, log_month, current_user.id, db)
        results.append(result)

    return UploadResponse(
        results=results,
        success_count=sum(1 for r in results if r.success),
        error_count=sum(1 for r in results if not r.success),
    )


@router.get("", response_model=list[LogFileSchema])
def list_logs(
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(LogFile)
    if year:
        q = q.filter(LogFile.log_year == year)
    if month:
        q = q.filter(LogFile.log_month == month)
    files = q.order_by(LogFile.uploaded_at.desc()).all()

    result = []
    for f in files:
        result.append(
            LogFileSchema(
                id=f.id,
                device_name=f.device_name,
                original_filename=f.original_filename,
                log_year=f.log_year,
                log_month=f.log_month,
                file_size=f.file_size,
                uploaded_at=f.uploaded_at,
                uploaded_by_username=f.uploader.username if f.uploader else None,
            )
        )
    return result


@router.get("/{log_id}/raw")
def get_raw_log(
    log_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    log_file = db.query(LogFile).filter(LogFile.id == log_id).first()
    if not log_file:
        raise HTTPException(status_code=404, detail="로그 파일을 찾을 수 없습니다")
    data = minio_client.download_file(log_file.minio_object_key)
    if data is None:
        raise HTTPException(status_code=404, detail="MinIO에서 파일을 찾을 수 없습니다")
    return {"content": data.decode("utf-8", errors="replace"), "filename": log_file.original_filename}


@router.delete("/{log_id}", status_code=204)
def delete_log(
    log_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    log_file = db.query(LogFile).filter(LogFile.id == log_id).first()
    if not log_file:
        raise HTTPException(status_code=404, detail="로그 파일을 찾을 수 없습니다")
    if log_file.snapshot:
        db.delete(log_file.snapshot)
        db.flush()
    minio_client.delete_file(log_file.minio_object_key)
    db.delete(log_file)
    db.commit()
