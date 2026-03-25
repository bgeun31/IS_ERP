import os
import re
from typing import Dict, List, Optional, Tuple
from .utils import list_logs, read_lines
_COMMANDS = {
    'show banner',
    'show sntp',
    'top',
    'show port no',
    'show port transceiver info',
    'show port transceiver information',
    'show ports transceiver info',
    'show ports transceiver information',
    'show ports transceiver information detail',
    'show switch',
    'show management',
    'show version',
    'show version image',
    'show power',
    'show temp',
    'show fan',
    'show vlan',
    'show account',
}
_COMMAND_ALIASES = {
    'show sman': 'show management',
    'show man': 'show management',
    'show switch management': 'show management',
    'show snttp': 'show sntp',
    'show tem': 'show temp',
    'show temperature': 'show temp',
    'show port no-refresh': 'show port no',
    'show ports no-refresh': 'show port no',
    'show ports no': 'show port no',
    'show ver': 'show version',
    'show vers': 'show version',
    'show version im': 'show version image',
    'show version images': 'show version image',
    'show version img': 'show version image',
}
# 명령 섹션이 실제 유효 출력인지(빈값/에러 제외) 판정
def _section_has_content(command: str, lines: List[str]) -> bool:
    has_content = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith('%%') and 'invalid input' in stripped.lower():
            continue
        if set(stripped) <= {'^'}:
            continue
        has_content = True
        break
    if not has_content:
        return False
    if command == 'show fan':
        return any('fan' in line.lower() for line in lines)
    return True
# 프롬프트에서 추출한 명령을 표준 명령명으로 정규화
def _normalize_command(text: str) -> Optional[str]:
    normalized = ' '.join(text.strip().lower().split())
    if not normalized:
        return None
    if normalized in _COMMAND_ALIASES:
        return _COMMAND_ALIASES[normalized]
    if normalized in _COMMANDS:
        return normalized
    return None
# 장비 프롬프트 라인에서 show 명령을 추출하고 별칭/부분일치 보정
def _extract_prompt_command(line: str) -> Optional[str]:
    stripped = line.strip()
    if not stripped:
        return None
    if stripped.startswith('*'):
        stripped = stripped.lstrip('*').strip()
    if '# ' not in stripped:
        return None
    before, cmd = stripped.split('#', 1)
    if not before.strip():
        return None
    cmd_text = cmd.strip()
    normalized = _normalize_command(cmd_text)
    if normalized:
        return normalized
    cmd_lower = cmd_text.lower()
    best_cmd = None
    best_pos = -1
    for candidate in _COMMANDS:
        pos = cmd_lower.rfind(candidate)
        if pos >= 0 and pos > best_pos:
            best_pos = pos
            best_cmd = candidate
    return best_cmd or ''
# 로그 라인을 명령 단위 섹션 딕셔너리로 분할 수집
def _capture_sections(lines: List[str]) -> Dict[str, List[str]]:
    sections: Dict[str, List[str]] = {}
    current: Optional[str] = None
    for raw_line in lines:
        line = raw_line.rstrip('\n').rstrip('\r')
        normalized = _extract_prompt_command(line)
        if normalized == '':
            current = None
            continue
        if normalized:
            existing = sections.get(normalized)
            if existing is not None:
                if existing and _section_has_content(normalized, existing):
                    current = None
                    continue
                sections[normalized] = []
                current = normalized
                continue
            sections[normalized] = []
            current = normalized
            continue
        if current:
            sections[current].append(line)
    return sections
# key:value 형식 문자열에서 콜론 뒤 값을 반환
def _after_colon(line: str) -> str:
    if ':' not in line:
        return line.strip()
    return line.split(':', 1)[1].strip()
# show banner 섹션 존재 여부를 있음/없음으로 판정
def _parse_banner(lines: Optional[List[str]]) -> str:
    if lines is None:
        return '-'
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.endswith('#') and '# ' not in stripped:
            continue
        return '있음'
    return '없음'
# show sntp 출력에서 SNTP enable/disable 상태 추출
def _parse_sntp(lines: Optional[List[str]]) -> str:
    if not lines:
        return ''
    for line in lines:
        lower = line.lower()
        if 'sntp client is' in lower:
            return 'enable' if 'enable' in lower else 'disable'
    return ''
# top 출력에서 CPU 사용률(100-idle)을 계산
def _parse_cpu(lines: Optional[List[str]]) -> Optional[float]:
    if not lines:
        return None
    for line in lines:
        lower = line.lower().strip()
        if lower.startswith('cpu:'):
            m = re.search(r'([0-9.]+)%\s+idle', lower)
            if m:
                idle = float(m.group(1))
                return round(max(0.0, min(100.0, 100.0 - idle)), 1)
            percents = [float(x) for x in re.findall(r'([0-9.]+)%', lower)]
            if percents:
                return round(sum(percents), 1)
    return None
# show port no 표에서 포트 VLAN 값을 중복 제거해 추출
def _parse_port_vlans(lines: Optional[List[str]]) -> List[str]:
    result: List[str] = []
    seen = set()
    if not lines:
        return result
    vlan_slice: Optional[Tuple[int, int]] = None
    for line in lines:
        if 'VLAN Name' in line and 'Port  Link' in line:
            vlan_idx = line.index('VLAN Name')
            try:
                port_idx = line.index('Port', vlan_idx + len('VLAN Name'))
            except ValueError:
                port_idx = len(line)
            vlan_slice = (vlan_idx, port_idx)
            continue
        stripped = line.strip()
        if not stripped or not stripped[0].isdigit():
            continue
        vlan = ''
        if vlan_slice:
            start, end = vlan_slice
            vlan = line[start:end].strip()
        if not vlan:
            parts = re.split(r'\s{2,}', stripped)
            if len(parts) >= 3:
                vlan = parts[-3].strip()
        if not vlan:
            continue
        if vlan not in seen:
            seen.add(vlan)
            result.append(vlan)
    return result
# show switch에서 시스템명/타입/업타임/버전 정보 추출
def _parse_switch(lines: Optional[List[str]]) -> Dict[str, str]:
    info = {
        'sysname': '',
        'system_type': '',
        'uptime': '',
        'primary_version': '',
        'secondary_version': '',
    }
    if not lines:
        return info
    for idx, line in enumerate(lines):
        lower = line.lower()
        text = _after_colon(line)
        if lower.startswith('sysname'):
            info['sysname'] = text
        elif lower.startswith('system type'):
            info['system_type'] = text
        elif lower.startswith('system uptime'):
            info['uptime'] = text
        elif lower.startswith('primary ver'):
            val = text
            if idx + 1 < len(lines):
                extra = lines[idx + 1].strip()
                if extra and ':' not in extra:
                    val = f'{val} {extra.strip()}'.strip()
            info['primary_version'] = val
        elif lower.startswith('secondary ver'):
            val = text
            if idx + 1 < len(lines):
                extra = lines[idx + 1].strip()
                if extra and ':' not in extra:
                    val = f'{val} {extra.strip()}'.strip()
            info['secondary_version'] = val
    return info
# show management에서 SSH/SNMP 상태, AP 적용, SNMP 오류 카운터 추출
def _parse_management(lines: Optional[List[str]]) -> Dict[str, Optional[str]]:
    info: Dict[str, Optional[str]] = {
        'ssh_access': None,
        'ssh_enabled': None,
        'ssh_access_profile_status': None,
        'snmp_access': None,
        'snmp_enabled': None,
        'snmp_access_profile_status': None,
        'snmp_errors': None,
        'snmp_auth_errors': None,
    }
    if not lines:
        return info
    current_block: Optional[str] = None
    # 접근 상태 문자열에서 enable/disable 키워드 판정
    def _enabled_status(text: str) -> Optional[str]:
        lower = text.lower()
        if 'enable' in lower:
            return 'enable'
        if 'disable' in lower:
            return 'disable'
        return None
    # access profile 값이 적용/미적용인지 판정
    def _access_profile_status(text: str) -> Optional[str]:
        normalized = ' '.join(text.strip().lower().split())
        if not normalized:
            return None
        if normalized in {'not set', 'none', 'n/a', '-', 'not configured'}:
            return 'not_applied'
        return 'applied'
    for line in lines:
        stripped = line.strip()
        lower = stripped.lower()
        if lower.startswith('ssh access') and ':' in line:
            raw = _after_colon(line)
            info['ssh_access'] = raw.split('(', 1)[0].strip()
            info['ssh_enabled'] = _enabled_status(raw)
            current_block = 'ssh'
            continue
        if lower.startswith('snmp access') and ':' in line:
            raw = _after_colon(line)
            info['snmp_access'] = raw
            info['snmp_enabled'] = _enabled_status(raw)
            current_block = 'snmp'
            continue
        if lower.startswith(
            (
                'telnet access',
                'web access',
                'snmp notifications',
                'snmp notification receivers',
                'ssh2 idle time',
                'ssh2 rekey interval',
                'total read only communities',
                'total read write communities',
                'rmon',
            )
        ):
            current_block = None
        if current_block and 'access profile' in lower:
            m_profile = re.search(r'access profile\s*:\s*(.+)$', line, re.IGNORECASE)
            if m_profile:
                status = _access_profile_status(m_profile.group(1))
                if current_block == 'ssh':
                    info['ssh_access_profile_status'] = status
                elif current_block == 'snmp':
                    info['snmp_access_profile_status'] = status
                continue
        if 'snmp stats' in lower:
            m_err = re.search(r'errors\s+(\d+)', line, re.IGNORECASE)
            m_auth = re.search(r'autherrors\s+(\d+)', line, re.IGNORECASE)
            if m_err:
                info['snmp_errors'] = m_err.group(1)
            if m_auth:
                info['snmp_auth_errors'] = m_auth.group(1)
    return info
# show version에서 switch 시리얼 번호 추출
def _parse_serial(lines: Optional[List[str]]) -> str:
    if not lines:
        return ''
    for line in lines:
        lower = line.lower()
        if 'switch' not in lower:
            continue
        idx = lower.find('switch')
        segment = line[idx:]
        if not segment.lower().startswith('switch'):
            continue
        text = _after_colon(segment)
        parts = text.split()
        if len(parts) >= 2:
            return parts[1]
        return text
    return ''
# show power에서 전원 모듈별 on/off 상태 추출
def _parse_power(lines: Optional[List[str]]) -> Dict[str, str]:
    states: Dict[str, str] = {}
    if not lines:
        return states
    current: Optional[str] = None
    for line in lines:
        m = re.match(r'PowerSupply\s+(\d+)', line)
        if m:
            current = m.group(1)
            continue
        if current and 'State' in line and ':' in line:
            text = _after_colon(line).lower()
            states[current] = 'on' if 'on' in text else 'off'
            current = None
    return states
# show fan에서 총 팬 수와 동작 팬 수를 계산
def _parse_fan(lines: Optional[List[str]]) -> Dict[str, Optional[int]]:
    info: Dict[str, Optional[int]] = {'operational': None, 'total': None}
    if not lines:
        return info
    total = 0
    operational = 0
    fan_context = False
    pending_count: Optional[int] = None
    pending = None
    # 팬 블록 누적 상태를 operational/total 카운트에 반영
    def finalize_pending():
        nonlocal pending, total, operational, pending_count
        if not pending:
            return
        count = pending.get('count') or 1
        total += count
        detail_total = pending.get('detail_total', 0)
        detail_oper = pending.get('detail_oper', 0)
        if detail_total > 0:
            detail_total = min(detail_total, count)
            detail_oper = min(detail_oper, detail_total)
            operational += detail_oper
        elif pending.get('state_operational'):
            operational += count
        pending = None
        pending_count = None
    for line in lines:
        lower = line.lower()
        if 'fan' in lower:
            fan_context = True
        if not fan_context:
            continue
        if 'state' in lower and ':' in line:
            finalize_pending()
            text = _after_colon(line).lower()
            pending = {
                'state_operational': 'operational' in text,
                'count': pending_count if pending_count is not None else 1,
                'detail_total': 0,
                'detail_oper': 0,
            }
            pending_count = None
            continue
        if 'numfan' in lower:
            try:
                value = int(_after_colon(line).strip())
            except ValueError:
                value = None
            if pending is not None and value is not None:
                pending['count'] = value
            else:
                pending_count = value
            continue
        if 'fan-' in lower:
            if pending is None:
                continue
            pending['detail_total'] = pending.get('detail_total', 0) + 1
            if 'empty' not in lower and 'operational' in lower:
                pending['detail_oper'] = pending.get('detail_oper', 0) + 1
            continue
    finalize_pending()
    if total == 0:
        return info
    info['operational'] = operational
    info['total'] = total
    return info
# show temp에서 온도값과 정상 범위 비교 결과 추출
def _parse_temp(lines: Optional[List[str]]) -> Dict[str, Optional[str]]:
    info: Dict[str, Optional[str]] = {'status': None}
    if not lines:
        return info
    for line in lines:
        if ':' not in line:
            continue
        parts = _after_colon(line).split()
        if len(parts) < 5:
            continue
        try:
            temp = float(parts[1])
        except ValueError:
            continue
        normal_range = parts[4]
        if '-' in normal_range:
            low_str, high_str = normal_range.split('-', 1)
            try:
                low = float(low_str)
                high = float(high_str)
                ok = low <= temp <= high
            except ValueError:
                ok = None
        else:
            ok = None
        info['status'] = '정상' if ok else '비정상' if ok is not None else None
        info['value'] = temp
        return info
    return info
# show vlan 표에서 VLAN 이름/ID 목록 추출
def _parse_vlans(lines: Optional[List[str]]) -> List[Tuple[str, str]]:
    vlans: List[Tuple[str, str]] = []
    if not lines:
        return vlans
    header_seen = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith('-') or stripped.lower().startswith('flags'):
            continue
        if stripped.lower().startswith('name '):
            header_seen = True
            continue
        if not header_seen:
            continue
        parts = re.split(r'\s{2,}', stripped)
        if len(parts) < 2:
            continue
        name = parts[0].strip()
        vid = parts[1].strip().split()[0]
        if name and vid.isdigit():
            vlans.append((name, vid))
    return vlans
# show account에서 admin/user 계정 존재 여부 확인
def _parse_accounts(lines: Optional[List[str]]) -> Dict[str, bool]:
    names = set()
    if lines:
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith('-') or stripped.lower().startswith('user name'):
                continue
            parts = stripped.split()
            if parts:
                names.add(parts[0].lower())
    return {
        'admin': 'admin' in names,
        'user': 'user' in names,
    }
# 로그 1개의 필수 점검 항목을 통합 파싱해 딕셔너리로 반환
def parse_required_check(lines: List[str]) -> Dict[str, object]:
    sections = _capture_sections(lines)
    switch_info = _parse_switch(sections.get('show switch'))
    management_info = _parse_management(sections.get('show management'))
    return {
        'banner': _parse_banner(sections.get('show banner')),
        'sntp': _parse_sntp(sections.get('show sntp')),
        'cpu': _parse_cpu(sections.get('top')),
        'port_vlans': _parse_port_vlans(sections.get('show port no')),
        'switch': switch_info,
        'management': management_info,
        'serial': _parse_serial(sections.get('show version')),
        'power': _parse_power(sections.get('show power')),
        'fan': _parse_fan(sections.get('show fan')),
        'temp': _parse_temp(sections.get('show temp')),
        'vlans': _parse_vlans(sections.get('show vlan')),
        'accounts': _parse_accounts(sections.get('show account')),
    }
# 로그 디렉터리 전\ccb4를 순회하며 장비별 필수 점검 결과 목록 수집
def essential_checks_collect(log_dir: str, name_filter: Optional[str] = None) -> List[Dict[str, object]]:
    rows: List[Dict[str, object]] = []
    for path in list_logs(log_dir):
        base = os.path.basename(path)
        if name_filter and name_filter not in base:
            continue
        lines = read_lines(path)
        parsed = parse_required_check(lines)
        parsed['log_path'] = path
        parsed['log_name'] = base
        device = parsed.get('switch', {}).get('sysname')  # type: ignore[dict-item]
        parsed['device_name'] = device if device else os.path.splitext(base)[0]
        rows.append(parsed)
    return rows
__all__ = ['parse_required_check', 'essential_checks_collect']
