import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getDevice } from '../api/client';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import type { DeviceSnapshot } from '../types';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="info-row">
      <div className="info-key">{label}</div>
      <div className="info-val">{value ?? <span className="text-muted">-</span>}</div>
    </div>
  );
}

export default function DeviceDetailPage() {
  const { name } = useParams<{ name: string }>();
  const [snapshots, setSnapshots] = useState<DeviceSnapshot[]>([]);
  const [selected, setSelected] = useState<DeviceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!name) return;
    getDevice(name)
      .then((res) => {
        setSnapshots(res.data.snapshots);
        if (res.data.snapshots.length > 0) setSelected(res.data.snapshots[0]);
      })
      .catch(() => setError('장비 정보를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, [name]);

  const s = selected;

  return (
    <Layout title={`장비 상세: ${name}`}>
      <div className="breadcrumb">
        <Link to="/dashboard">대시보드</Link>
        <span>›</span>
        <span>{name}</span>
      </div>

      {loading && <div className="loading-box">불러오는 중...</div>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && snapshots.length > 0 && (
        <>
          {/* 스냅샷 선택 */}
          {snapshots.length > 1 && (
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className="text-muted text-sm" style={{ fontWeight: 600 }}>기준월 선택:</span>
                {snapshots.map((snap) => (
                  <button
                    key={snap.id}
                    className={`btn btn-sm ${selected?.id === snap.id ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setSelected(snap)}
                  >
                    {snap.log_year}-{String(snap.log_month ?? 0).padStart(2, '0')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {s && (
            <>
              {/* 상태 요약 */}
              <div className="status-grid">
                <div className="status-item">
                  <div className="status-item-label">CPU 사용률</div>
                  <div className="status-item-value" style={{ color: (s.cpu ?? 0) >= 90 ? '#e53e3e' : '#38a169' }}>
                    {s.cpu !== null ? `${s.cpu}%` : '-'}
                  </div>
                </div>
                <div className="status-item">
                  <div className="status-item-label">팬 상태</div>
                  <div className="status-item-value" style={{ color: (s.fan_operational ?? 0) < (s.fan_total ?? 1) ? '#e53e3e' : '#38a169' }}>
                    {s.fan_operational !== null ? `${s.fan_operational}/${s.fan_total}` : '-'}
                  </div>
                  <div className="status-item-sub">동작/전체</div>
                </div>
                <div className="status-item">
                  <div className="status-item-label">온도</div>
                  <div className="status-item-value" style={{ color: s.temp_status === '비정상' ? '#e53e3e' : '#38a169' }}>
                    {s.temp_value !== null ? `${s.temp_value}°C` : '-'}
                  </div>
                  <div className="status-item-sub">{s.temp_status ?? '-'}</div>
                </div>
                <div className="status-item">
                  <div className="status-item-label">배너</div>
                  <div className="status-item-value">{s.banner ?? '-'}</div>
                </div>
                <div className="status-item">
                  <div className="status-item-label">SNTP</div>
                  <div className="status-item-value">{s.sntp ?? '-'}</div>
                </div>
                <div className="status-item">
                  <div className="status-item-label">SSH</div>
                  <div className="status-item-value">{s.ssh_enabled ?? '-'}</div>
                </div>
                <div className="status-item">
                  <div className="status-item-label">SNMP</div>
                  <div className="status-item-value">{s.snmp_enabled ?? '-'}</div>
                </div>
              </div>

              {/* 장비 기본 정보 */}
              <Section title="장비 정보">
                <div className="info-grid">
                  <InfoRow label="장비명 (파일)" value={s.device_name} />
                  <InfoRow label="Sysname" value={s.sysname} />
                  <InfoRow label="시스템 타입" value={s.system_type} />
                  <InfoRow label="시리얼 번호" value={<span style={{ fontFamily: 'monospace' }}>{s.serial_number}</span>} />
                  <InfoRow label="Primary 버전" value={s.primary_version} />
                  <InfoRow label="Secondary 버전" value={s.secondary_version} />
                  <InfoRow label="업타임" value={s.uptime} />
                  <InfoRow label="로그 파일" value={s.original_filename} />
                  <InfoRow label="로그 기준월" value={s.log_year && s.log_month ? `${s.log_year}-${String(s.log_month).padStart(2, '0')}` : null} />
                </div>
              </Section>

              {/* 관리 설정 */}
              <Section title="관리 설정 (Management)">
                <div className="info-grid">
                  <InfoRow label="SSH Access" value={s.ssh_access} />
                  <InfoRow label="SSH 활성화" value={<StatusBadge value={s.ssh_enabled} type="enable" />} />
                  <InfoRow label="SSH Access Profile" value={<StatusBadge value={s.ssh_access_profile_status} type="profile" />} />
                  <InfoRow label="SNMP Access" value={s.snmp_access} />
                  <InfoRow label="SNMP 활성화" value={<StatusBadge value={s.snmp_enabled} type="enable" />} />
                  <InfoRow label="SNMP Access Profile" value={<StatusBadge value={s.snmp_access_profile_status} type="profile" />} />
                  <InfoRow label="SNMP 오류" value={s.snmp_errors} />
                  <InfoRow label="SNMP Auth 오류" value={s.snmp_auth_errors} />
                </div>
              </Section>

              {/* 전원 공급 */}
              {s.power_supplies.length > 0 && (
                <Section title="전원 공급 (Power Supply)">
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {s.power_supplies.map((p) => (
                      <div key={p.supply_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#f7fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <span style={{ fontWeight: 600 }}>PSU {p.supply_id}</span>
                        <StatusBadge value={p.state} type="power" />
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* 계정 */}
              <Section title="계정 정보 (Account)">
                <div className="info-grid">
                  <InfoRow label="Admin 계정" value={<StatusBadge value={String(s.account_admin)} type="account" />} />
                  <InfoRow label="User 계정" value={<StatusBadge value={String(s.account_user)} type="account" />} />
                </div>
              </Section>

              {/* VLAN 목록 */}
              {s.vlans.length > 0 && (
                <Section title={`VLAN 목록 (${s.vlans.length}개)`}>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>VLAN ID</th>
                          <th>VLAN 이름</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.vlans.map((v) => (
                          <tr key={v.vlan_id}>
                            <td><span style={{ fontFamily: 'monospace' }}>{v.vlan_id}</span></td>
                            <td>{v.vlan_name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}

              {/* 포트 VLAN */}
              {s.port_vlans.length > 0 && (
                <Section title="포트 VLAN 목록">
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {s.port_vlans.map((v, i) => <span key={i} className="tag">{v}</span>)}
                  </div>
                </Section>
              )}
            </>
          )}

          {/* 스냅샷 이력 */}
          {snapshots.length > 1 && (
            <Section title="스냅샷 이력">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>기준월</th>
                      <th>CPU</th>
                      <th>온도</th>
                      <th>팬</th>
                      <th>SSH</th>
                      <th>SNMP</th>
                      <th>파일명</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshots.map((snap) => (
                      <tr
                        key={snap.id}
                        className={`clickable${selected?.id === snap.id ? ' selected' : ''}`}
                        onClick={() => setSelected(snap)}
                      >
                        <td><strong>{snap.log_year}-{String(snap.log_month ?? 0).padStart(2, '0')}</strong></td>
                        <td>{snap.cpu !== null ? `${snap.cpu}%` : '-'}</td>
                        <td><StatusBadge value={snap.temp_status} type="temp" /></td>
                        <td>{snap.fan_operational !== null ? `${snap.fan_operational}/${snap.fan_total}` : '-'}</td>
                        <td><StatusBadge value={snap.ssh_enabled} type="enable" /></td>
                        <td><StatusBadge value={snap.snmp_enabled} type="enable" /></td>
                        <td className="text-sm text-muted">{snap.original_filename}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </>
      )}

      {!loading && !error && snapshots.length === 0 && (
        <div className="empty-box">장비 데이터를 찾을 수 없습니다.</div>
      )}
    </Layout>
  );
}
