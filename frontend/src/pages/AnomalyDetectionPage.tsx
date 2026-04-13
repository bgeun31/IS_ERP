import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDeviceAnomalies } from '../api/client';
import Layout from '../components/Layout';
import type { DeviceAnomalyItem } from '../types';

export default function AnomalyDetectionPage() {
  const now = new Date();
  const [items, setItems] = useState<DeviceAnomalyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [scannedDeviceCount, setScannedDeviceCount] = useState(0);
  const [affectedDeviceCount, setAffectedDeviceCount] = useState(0);
  const [totalAnomalyCount, setTotalAnomalyCount] = useState(0);
  const [openDevices, setOpenDevices] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    setError('');
    getDeviceAnomalies(filterYear, filterMonth)
      .then((res) => {
        setItems(res.data.items);
        setScannedDeviceCount(res.data.scanned_device_count);
        setAffectedDeviceCount(res.data.affected_device_count);
        setTotalAnomalyCount(res.data.total_anomaly_count);
      })
      .catch(() => setError('이상 감지 결과를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [filterYear, filterMonth]);

  const years = Array.from({ length: 10 }, (_, i) => now.getFullYear() - 2 + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => (
      item.device_name.toLowerCase().includes(query) ||
      item.anomalies.some((entry) => entry.raw_line.toLowerCase().includes(query))
    ));
  }, [items, search]);

  const toggleDevice = (deviceName: string) => {
    setOpenDevices((prev) => {
      const next = new Set(prev);
      if (next.has(deviceName)) next.delete(deviceName);
      else next.add(deviceName);
      return next;
    });
  };

  return (
    <Layout title="이상 감지">
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">스캔 장비</div>
          <div className="stat-value">{scannedDeviceCount}</div>
          <div className="stat-sub">선택한 월 기준</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">이상 장비</div>
          <div className="stat-value" style={{ color: affectedDeviceCount > 0 ? '#e53e3e' : '#38a169' }}>{affectedDeviceCount}</div>
          <div className="stat-sub">Warn/Erro 포함</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">이상 로그</div>
          <div className="stat-value" style={{ color: totalAnomalyCount > 0 ? '#e53e3e' : '#38a169' }}>{totalAnomalyCount}</div>
          <div className="stat-sub">show log 기준</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>장비별 이상 감지</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="form-select" value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))}>
              {years.map((year) => <option key={year} value={year}>{year}년</option>)}
            </select>
            <select className="form-select" value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))}>
              {months.map((month) => <option key={month} value={month}>{month}월</option>)}
            </select>
            <input
              className="search-input"
              placeholder="장비명 또는 로그 내용 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading && <div className="loading-box">불러오는 중...</div>}
        {error && <p className="form-error">{error}</p>}

        {!loading && !error && filteredItems.length === 0 && (
          <div className="empty-box">
            {items.length === 0 ? '선택한 월에는 Warn/Erro 이상 로그가 없습니다.' : '검색 결과가 없습니다.'}
          </div>
        )}

        {!loading && !error && filteredItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredItems.map((item) => {
              const isOpen = openDevices.has(item.device_name);
              return (
                <div key={item.device_name} style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => toggleDevice(item.device_name)}
                    style={{
                      width: '100%',
                      border: 'none',
                      background: '#fff',
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 14 }}>{item.device_name}</strong>
                        <span className="badge badge-red">{item.anomaly_count}건</span>
                        <span className="text-muted text-sm">{item.log_year}-{String(item.log_month).padStart(2, '0')}</span>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: '#718096' }}>
                        파일: {item.original_filename}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: '#4a5568' }}>{isOpen ? '접기 ▲' : '펼치기 ▼'}</span>
                  </button>

                  {isOpen && (
                    <div style={{ borderTop: '1px solid #edf2f7', background: '#f7fafc', padding: 16 }}>
                      <div style={{ marginBottom: 12 }}>
                        <Link to={`/devices/${encodeURIComponent(item.device_name)}`} style={{ fontSize: 13 }}>
                          장비 상세로 이동
                        </Link>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {item.anomalies.map((entry, index) => (
                          <div key={`${item.device_name}-${index}`} style={{ border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', padding: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                              <span className={`badge ${entry.level === 'Erro' ? 'badge-red' : 'badge-orange'}`}>{entry.level}</span>
                              <span style={{ fontSize: 12, color: '#4a5568', fontFamily: 'monospace' }}>{entry.timestamp}</span>
                              <span style={{ fontSize: 12, color: '#718096' }}>{entry.category || '-'}</span>
                            </div>
                            <div style={{ fontSize: 13, color: '#2d3748', marginBottom: 6 }}>{entry.message || '-'}</div>
                            <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: '#4a5568' }}>
                              {entry.raw_line}
                            </pre>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
