import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDevices } from '../api/client';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import type { DeviceListItem } from '../types';

function cpuBadge(cpu: number | null) {
  if (cpu === null) return <span className="badge badge-gray">-</span>;
  const cls = cpu >= 90 ? 'badge-red' : cpu >= 70 ? 'badge-orange' : 'badge-green';
  return <span className={`badge ${cls}`}>{cpu}%</span>;
}

function fanBadge(op: number | null, total: number | null) {
  if (op === null || total === null) return <span className="badge badge-gray">-</span>;
  const cls = op < total ? 'badge-red' : 'badge-green';
  return <span className={`badge ${cls}`}>{op}/{total}</span>;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const now = new Date();
  const [devices, setDevices] = useState<DeviceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [filterSystemTypes, setFilterSystemTypes] = useState<Set<string>>(new Set());
  const [filterVersions, setFilterVersions] = useState<Set<string>>(new Set());
  const [openFilter, setOpenFilter] = useState<'systemType' | 'version' | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const systemTypeBtnRef = useRef<HTMLButtonElement>(null);
  const versionBtnRef = useRef<HTMLButtonElement>(null);

  const openDropdown = (type: 'systemType' | 'version') => {
    setOpenFilter(openFilter === type ? null : type);
  };

  useLayoutEffect(() => {
    if (!openFilter) return;
    const ref = openFilter === 'systemType' ? systemTypeBtnRef : versionBtnRef;
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      const top = rect.bottom + window.scrollY + 4;
      const left = rect.left + window.scrollX;
      setDropdownPos((prev) => (prev.top === top && prev.left === left ? prev : { top, left }));
    }
  });

  useEffect(() => {
    setLoading(true);
    setError('');
    getDevices(filterYear, filterMonth)
      .then((res) => setDevices(res.data))
      .catch(() => setError('장비 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [filterYear, filterMonth]);

  const years = Array.from({ length: 10 }, (_, i) => now.getFullYear() - 2 + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const systemTypes = Array.from(new Set(devices.map((d) => d.latest_snapshot?.system_type ?? '').filter(Boolean))).sort();
  const versions = Array.from(new Set(devices.map((d) => d.latest_snapshot?.primary_version ?? '').filter(Boolean))).sort();

  const toggleFilter = (set: Set<string>, setFn: (s: Set<string>) => void, value: string) => {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    setFn(next);
  };

  const filtered = devices.filter((d) => {
    const s = d.latest_snapshot;
    if (filterSystemTypes.size > 0 && !filterSystemTypes.has(s?.system_type ?? '')) return false;
    if (filterVersions.size > 0 && !filterVersions.has(s?.primary_version ?? '')) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !d.device_name.toLowerCase().includes(q) &&
        !(s?.system_type ?? '').toLowerCase().includes(q) &&
        !(s?.serial_number ?? '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const issueCount = devices.filter((d) => {
    const s = d.latest_snapshot;
    if (!s) return false;
    return (
      s.temp_status === '비정상' ||
      (s.fan_operational !== null && s.fan_total !== null && s.fan_operational < s.fan_total) ||
      (s.cpu !== null && s.cpu >= 90)
    );
  }).length;

  return (
    <Layout title="대시보드">
      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">전체 장비</div>
          <div className="stat-value">{devices.length}</div>
          <div className="stat-sub">등록된 스위치</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">이상 감지</div>
          <div className="stat-value" style={{ color: issueCount > 0 ? '#e53e3e' : '#38a169' }}>{issueCount}</div>
          <div className="stat-sub">점검 필요 장비</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">정상 장비</div>
          <div className="stat-value" style={{ color: '#38a169' }}>{devices.length - issueCount}</div>
          <div className="stat-sub">정상 동작 중</div>
        </div>
      </div>

      <div className="card">
        <div className="page-header" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>장비 목록</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="form-select" value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select className="form-select" value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))}>
              {months.map((m) => <option key={m} value={m}>{m}월</option>)}
            </select>
            <input
              className="search-input"
              placeholder="장비명, 타입, 시리얼 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading && <div className="loading-box">불러오는 중...</div>}
        {error && <p className="form-error">{error}</p>}

        {!loading && !error && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>장비명</th>
                  <th>
                    <span>시스템 타입</span>
                    <button
                      ref={systemTypeBtnRef}
                      onClick={(e) => { e.stopPropagation(); openDropdown('systemType'); }}
                      style={{ marginLeft: 4, padding: '1px 5px', fontSize: 11, cursor: 'pointer', background: filterSystemTypes.size > 0 ? '#3182ce' : '#e2e8f0', color: filterSystemTypes.size > 0 ? '#fff' : '#4a5568', border: 'none', borderRadius: 3 }}
                    >▼</button>
                    {openFilter === 'systemType' && (
                      <div style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 1000, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 180, maxHeight: 300, overflowY: 'auto', padding: 8 }} onClick={(e) => e.stopPropagation()}>
                        {filterSystemTypes.size > 0 && (
                          <div onClick={() => setFilterSystemTypes(new Set())} style={{ padding: '4px 10px 8px', fontSize: 12, color: '#3182ce', cursor: 'pointer' }}>전체 해제</div>
                        )}
                        {systemTypes.map((t) => (
                          <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', cursor: 'pointer', borderRadius: 4, fontSize: 13 }}>
                            <input type="checkbox" checked={filterSystemTypes.has(t)} onChange={() => toggleFilter(filterSystemTypes, setFilterSystemTypes, t)} />
                            {t}
                          </label>
                        ))}
                      </div>
                    )}
                  </th>
                  <th>
                    <span>펌웨어 버전</span>
                    <button
                      ref={versionBtnRef}
                      onClick={(e) => { e.stopPropagation(); openDropdown('version'); }}
                      style={{ marginLeft: 4, padding: '1px 5px', fontSize: 11, cursor: 'pointer', background: filterVersions.size > 0 ? '#3182ce' : '#e2e8f0', color: filterVersions.size > 0 ? '#fff' : '#4a5568', border: 'none', borderRadius: 3 }}
                    >▼</button>
                    {openFilter === 'version' && (
                      <div style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 1000, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 220, maxHeight: 300, overflowY: 'auto', padding: 8 }} onClick={(e) => e.stopPropagation()}>
                        {filterVersions.size > 0 && (
                          <div onClick={() => setFilterVersions(new Set())} style={{ padding: '4px 10px 8px', fontSize: 12, color: '#3182ce', cursor: 'pointer' }}>전체 해제</div>
                        )}
                        {versions.map((v) => (
                          <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', cursor: 'pointer', borderRadius: 4, fontSize: 13 }}>
                            <input type="checkbox" checked={filterVersions.has(v)} onChange={() => toggleFilter(filterVersions, setFilterVersions, v)} />
                            {v}
                          </label>
                        ))}
                      </div>
                    )}
                  </th>
                  <th>시리얼</th>
                  <th>CPU</th>
                  <th>팬</th>
                  <th>온도</th>
                  <th>배너</th>
                  <th>SNTP</th>
                  <th>SSH</th>
                  <th>SNMP</th>
                  <th>로그 기준월</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={12} className="empty-box">
                      {devices.length === 0 ? '등록된 장비가 없습니다. 로그를 업로드해주세요.' : '검색 결과가 없습니다.'}
                    </td>
                  </tr>
                )}
                {filtered.map((d) => {
                  const s = d.latest_snapshot;
                  return (
                    <tr
                      key={d.device_name}
                      className="clickable"
                      onClick={() => navigate(`/devices/${encodeURIComponent(d.device_name)}`)}
                    >
                      <td><strong>{d.device_name}</strong></td>
                      <td>{s?.system_type || '-'}</td>
                      <td style={{ fontSize: 12 }}>{s?.primary_version || '-'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s?.serial_number || '-'}</td>
                      <td>{cpuBadge(s?.cpu ?? null)}</td>
                      <td>{fanBadge(s?.fan_operational ?? null, s?.fan_total ?? null)}</td>
                      <td><StatusBadge value={s?.temp_status} type="temp" /></td>
                      <td><StatusBadge value={s?.banner} type="banner" /></td>
                      <td><StatusBadge value={s?.sntp} type="enable" /></td>
                      <td><StatusBadge value={s?.ssh_enabled} type="enable" /></td>
                      <td><StatusBadge value={s?.snmp_enabled} type="enable" /></td>
                      <td className="text-muted text-sm">
                        {s?.log_year && s?.log_month ? `${s.log_year}-${String(s.log_month).padStart(2, '0')}` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
