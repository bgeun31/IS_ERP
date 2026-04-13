import re
from typing import Any, Dict, List, Optional, Tuple

_COMMANDS = {
    'show banner', 'show sntp', 'top', 'show port no',
    'show port transceiver info', 'show port transceiver information',
    'show ports transceiver info', 'show ports transceiver information',
    'show ports transceiver information detail',
    'show switch', 'show management', 'show version', 'show version image',
    'show power', 'show temp', 'show fan', 'show vlan', 'show account',
}

_COMMAND_ALIASES = {
    'show sman': 'show management', 'show man': 'show management',
    'show switch management': 'show management', 'show snttp': 'show sntp',
    'show tem': 'show temp', 'show temperature': 'show temp',
    'show port no-refresh': 'show port no', 'show ports no-refresh': 'show port no',
    'show ports no': 'show port no', 'show ver': 'show version',
    'show vers': 'show version', 'show version im': 'show version image',
    'show version images': 'show version image', 'show version img': 'show version image',
}


def _section_has_content(command: str, lines: List[str]) -> bool:
    has_content = False
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if s.startswith('%%') and 'invalid input' in s.lower():
            continue
        if set(s) <= {'^'}:
            continue
        has_content = True
        break
    if not has_content:
        return False
    if command == 'show fan':
        return any('fan' in l.lower() for l in lines)
    return True


def _normalize_command(text: str) -> Optional[str]:
    n = ' '.join(text.strip().lower().split())
    if not n:
        return None
    if n in _COMMAND_ALIASES:
        return _COMMAND_ALIASES[n]
    if n in _COMMANDS:
        return n
    return None


def _extract_prompt_command(line: str) -> Optional[str]:
    s = line.strip()
    if not s:
        return None
    if s.startswith('*'):
        s = s.lstrip('*').strip()
    if '# ' not in s:
        return None
    before, cmd = s.split('#', 1)
    if not before.strip():
        return None
    cmd_text = cmd.strip()
    normalized = _normalize_command(cmd_text)
    if normalized:
        return normalized
    cmd_lower = cmd_text.lower()
    best_cmd, best_pos = None, -1
    for candidate in _COMMANDS:
        pos = cmd_lower.rfind(candidate)
        if pos >= 0 and pos > best_pos:
            best_pos, best_cmd = pos, candidate
    return best_cmd or ''


def _capture_sections(lines: List[str]) -> Dict[str, List[str]]:
    sections: Dict[str, List[str]] = {}
    current: Optional[str] = None
    for raw in lines:
        line = raw.rstrip('\n').rstrip('\r')
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


def _after_colon(line: str) -> str:
    if ':' not in line:
        return line.strip()
    return line.split(':', 1)[1].strip()


def _parse_banner(lines: Optional[List[str]]) -> str:
    if lines is None:
        return '-'
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if s.endswith('#') and '# ' not in s:
            continue
        return '있음'
    return '없음'


def _parse_sntp(lines: Optional[List[str]]) -> str:
    if not lines:
        return ''
    for line in lines:
        lower = line.lower()
        if 'sntp client is' in lower:
            return 'enable' if 'enable' in lower else 'disable'
    return ''


def _parse_cpu(lines: Optional[List[str]]) -> Optional[float]:
    if not lines:
        return None
    for line in lines:
        lower = line.lower().strip()
        if lower.startswith('cpu:'):
            m = re.search(r'([0-9.]+)%\s+idle', lower)
            if m:
                return round(max(0.0, min(100.0, 100.0 - float(m.group(1)))), 1)
            percents = [float(x) for x in re.findall(r'([0-9.]+)%', lower)]
            if percents:
                return round(sum(percents), 1)
    return None


def _parse_port_vlans(lines: Optional[List[str]]) -> List[str]:
    result: List[str] = []
    seen: set = set()
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
        s = line.strip()
        if not s or not s[0].isdigit():
            continue
        vlan = ''
        if vlan_slice:
            start, end = vlan_slice
            vlan = line[start:end].strip()
        if not vlan:
            parts = re.split(r'\s{2,}', s)
            if len(parts) >= 3:
                vlan = parts[-3].strip()
        if vlan and vlan not in seen:
            seen.add(vlan)
            result.append(vlan)
    return result


def _parse_switch(lines: Optional[List[str]]) -> Dict[str, str]:
    info = {'sysname': '', 'system_type': '', 'uptime': '', 'primary_version': '', 'secondary_version': ''}
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
                    val = f'{val} {extra}'.strip()
            info['primary_version'] = val
        elif lower.startswith('secondary ver'):
            val = text
            if idx + 1 < len(lines):
                extra = lines[idx + 1].strip()
                if extra and ':' not in extra:
                    val = f'{val} {extra}'.strip()
            info['secondary_version'] = val
    return info


def _parse_management(lines: Optional[List[str]]) -> Dict[str, Optional[str]]:
    info: Dict[str, Optional[str]] = {
        'ssh_access': None, 'ssh_enabled': None, 'ssh_access_profile_status': None,
        'snmp_access': None, 'snmp_enabled': None, 'snmp_access_profile_status': None,
        'snmp_errors': None, 'snmp_auth_errors': None,
    }
    if not lines:
        return info
    current_block: Optional[str] = None

    def _enabled(text: str) -> Optional[str]:
        lower = text.lower()
        if 'enable' in lower:
            return 'enable'
        if 'disable' in lower:
            return 'disable'
        return None

    def _profile_status(text: str) -> Optional[str]:
        n = ' '.join(text.strip().lower().split())
        if not n:
            return None
        return 'not_applied' if n in {'not set', 'none', 'n/a', '-', 'not configured'} else 'applied'

    for line in lines:
        s = line.strip()
        lower = s.lower()
        if lower.startswith('ssh access') and ':' in line:
            raw = _after_colon(line)
            info['ssh_access'] = raw.split('(', 1)[0].strip()
            info['ssh_enabled'] = _enabled(raw)
            current_block = 'ssh'
            continue
        if lower.startswith('snmp access') and ':' in line:
            raw = _after_colon(line)
            info['snmp_access'] = raw
            info['snmp_enabled'] = _enabled(raw)
            current_block = 'snmp'
            continue
        if lower.startswith((
            'telnet access', 'web access', 'snmp notifications',
            'snmp notification receivers', 'ssh2 idle time', 'ssh2 rekey interval',
            'total read only communities', 'total read write communities', 'rmon',
        )):
            current_block = None
        if current_block and 'access profile' in lower:
            m = re.search(r'access profile\s*:\s*(.+)$', line, re.IGNORECASE)
            if m:
                status = _profile_status(m.group(1))
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


def _parse_fan(lines: Optional[List[str]]) -> Dict[str, Optional[int]]:
    info: Dict[str, Optional[int]] = {'operational': None, 'total': None}
    if not lines:
        return info
    total = 0
    operational = 0
    fan_context = False
    pending_count: Optional[int] = None
    pending = None

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


def _parse_temp(lines: Optional[List[str]]) -> Dict[str, Any]:
    info: Dict[str, Any] = {'status': None, 'value': None}
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
        ok = None
        if '-' in normal_range:
            low_str, high_str = normal_range.split('-', 1)
            try:
                ok = float(low_str) <= temp <= float(high_str)
            except ValueError:
                ok = None
        info['status'] = '정상' if ok else '비정상' if ok is not None else None
        info['value'] = temp
        return info
    return info


def _parse_vlans(lines: Optional[List[str]]) -> List[Tuple[str, str]]:
    vlans: List[Tuple[str, str]] = []
    if not lines:
        return vlans
    header_seen = False
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if s.startswith('-') or s.lower().startswith('flags'):
            continue
        if s.lower().startswith('name '):
            header_seen = True
            continue
        if not header_seen:
            continue
        parts = re.split(r'\s{2,}', s)
        if len(parts) < 2:
            continue
        name = parts[0].strip()
        vid = parts[1].strip().split()[0]
        if name and vid.isdigit():
            vlans.append((name, vid))
    return vlans


_MANUFACTURER_MAP = {
    'ecs': 'Edge-Core', 'ecgs': 'Edge-Core', 'es3': 'Edge-Core',
    'dgs': 'D-Link', 'des': 'D-Link', 'dxs': 'D-Link',
    'ws-c': 'Cisco', 'c9': 'Cisco', 'sg': 'Cisco',
    'ex': 'Juniper', 'qfx': 'Juniper', 'srx': 'Juniper',
    's57': 'Huawei', 's67': 'Huawei', 'ce': 'Huawei',
    'at-': 'Allied Telesis', 'x9': 'Allied Telesis',
    'icx': 'Brocade', 'fas': 'Brocade',
    'os6': 'Alcatel-Lucent', 'os9': 'Alcatel-Lucent',
    'tl-': 'TP-Link',
    'gs': 'Netgear',
}


def _infer_manufacturer(system_type: Optional[str], version_lines: Optional[List[str]]) -> Optional[str]:
    if version_lines:
        for line in version_lines:
            lower = line.lower()
            if 'edge-core' in lower or 'edgecore' in lower:
                return 'Edge-Core'
            if 'd-link' in lower or 'dlink' in lower:
                return 'D-Link'
            if 'cisco' in lower:
                return 'Cisco'
            if 'juniper' in lower:
                return 'Juniper'
            if 'huawei' in lower:
                return 'Huawei'
            if 'allied telesis' in lower:
                return 'Allied Telesis'
            if 'brocade' in lower:
                return 'Brocade'
            if 'alcatel' in lower:
                return 'Alcatel-Lucent'
    if system_type:
        model_lower = system_type.lower()
        for prefix, vendor in _MANUFACTURER_MAP.items():
            if model_lower.startswith(prefix):
                return vendor
    return None


def _parse_management_ip(lines: Optional[List[str]]) -> Optional[str]:
    if not lines:
        return None
    for line in lines:
        lower = line.lower().strip()
        if 'ip address' in lower and ':' in line:
            val = _after_colon(line).strip()
            parts = val.split()
            ip_candidate = parts[0] if parts else val
            if re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', ip_candidate):
                return ip_candidate
    return None


def _parse_accounts(lines: Optional[List[str]]) -> Dict[str, bool]:
    names: set = set()
    if lines:
        for line in lines:
            s = line.strip()
            if not s or s.startswith('-') or s.lower().startswith('user name'):
                continue
            parts = s.split()
            if parts:
                names.add(parts[0].lower())
    return {'admin': 'admin' in names, 'user': 'user' in names}


def parse_log_file(content: str) -> Dict[str, Any]:
    """로그 파일 내용을 파싱하여 구조화된 데이터를 반환합니다."""
    lines = content.splitlines()
    sections = _capture_sections(lines)
    switch_info = _parse_switch(sections.get('show switch'))
    management_info = _parse_management(sections.get('show management'))
    temp_info = _parse_temp(sections.get('show temp'))
    fan_info = _parse_fan(sections.get('show fan'))

    version_lines = sections.get('show version')
    management_lines = sections.get('show management')

    return {
        'banner': _parse_banner(sections.get('show banner')),
        'sntp': _parse_sntp(sections.get('show sntp')),
        'cpu': _parse_cpu(sections.get('top')),
        'port_vlans': _parse_port_vlans(sections.get('show port no')),
        'switch': switch_info,
        'management': management_info,
        'serial': _parse_serial(version_lines),
        'manufacturer': _infer_manufacturer(switch_info.get('system_type'), version_lines),
        'management_ip': _parse_management_ip(management_lines),
        'power': _parse_power(sections.get('show power')),
        'fan': fan_info,
        'temp': temp_info,
        'vlans': _parse_vlans(sections.get('show vlan')),
        'accounts': _parse_accounts(sections.get('show account')),
    }
