import { useEffect, useState } from 'react';
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

  const filtered = devices.filter(
    (d) =>
      d.device_name.toLowerCase().includes(search.toLowerCase()) ||
      (d.latest_snapshot?.system_type ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (d.latest_snapshot?.serial_number ?? '').toLowerCase().includes(search.toLowerCase())
  );

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
                  <th>시스템 타입</th>
                  <th>펌웨어 버전</th>
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
