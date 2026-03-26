import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getDevice, getDevices, getRawLog } from '../api/client';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import type { DeviceSnapshot } from '../types';

function extractLogSections(content: string, commands: string[]): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let capturing = false;

  for (const line of lines) {
    if (line.includes('# ')) {
      const cmdPart = line.split('#').slice(1).join('#').trim().toLowerCase();
      const isTarget = commands.some((cmd) => cmdPart.includes(cmd));
      if (isTarget) {
        capturing = true;
        result.push(line);
        continue;
      } else if (capturing && cmdPart.length > 0) {
        capturing = false;
      }
    }
    if (capturing) result.push(line);
  }

  return result.join('\n').trim() || '관련 로그 섹션을 찾을 수 없습니다.';
}

function LogModal({ title, content, onClose }: { title: string; content: string; onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 10, width: '80vw', maxWidth: 900, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>관련 로그 — {title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#718096' }}>✕</button>
        </div>
        <pre style={{ margin: 0, padding: '16px 20px', overflow: 'auto', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#f7fafc', borderRadius: '0 0 10px 10px' }}>
          {content}
        </pre>
      </div>
    </div>
  );
}

function Section({ title, children, onShowLog, headerRight }: { title: string; children: React.ReactNode; onShowLog?: () => void; headerRight?: React.ReactNode }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>{title}</div>
        {onShowLog && (
          <button
            onClick={onShowLog}
            style={{ fontSize: 12, padding: '3px 10px', background: '#edf2f7', border: '1px solid #e2e8f0', borderRadius: 5, cursor: 'pointer', color: '#4a5568', whiteSpace: 'nowrap' }}
          >관련 로그</button>
        )}
        {headerRight}
      </div>
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
  const navigate = useNavigate();
  const [snapshots, setSnapshots] = useState<DeviceSnapshot[]>([]);
  const [selected, setSelected] = useState<DeviceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rawLog, setRawLog] = useState<string | null>(null);
  const [modal, setModal] = useState<{ title: string; content: string } | null>(null);
  const [sysLog, setSysLog] = useState<string | null>(null);
  const [sysLogLoading, setSysLogLoading] = useState(false);
  const [sysLogDateFrom, setSysLogDateFrom] = useState('');
  const [sysLogDateTo, setSysLogDateTo] = useState('');
  const [deviceNames, setDeviceNames] = useState<string[]>([]);

  useEffect(() => {
    getDevices().then((res) => setDeviceNames(res.data.map((d) => d.device_name)));
  }, []);

  const currentIndex = deviceNames.indexOf(name ?? '');
  const prevName = currentIndex > 0 ? deviceNames[currentIndex - 1] : null;
  const nextName = currentIndex >= 0 && currentIndex < deviceNames.length - 1 ? deviceNames[currentIndex + 1] : null;

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

  const showLog = async (title: string, commands: string[]) => {
    let content = rawLog;
    if (!content && selected?.log_file_id) {
      const res = await getRawLog(selected.log_file_id);
      content = res.data.content;
      setRawLog(content);
    }
    if (content) setModal({ title, content: extractLogSections(content, commands) });
  };

  // 스냅샷 변경 시 캐시 초기화
  useEffect(() => { setRawLog(null); setSysLog(null); setSysLogDateFrom(''); setSysLogDateTo(''); }, [selected?.id]);

  useEffect(() => {
    if (!selected?.log_file_id) return;
    setSysLogLoading(true);
    const fetch = async () => {
      let content = rawLog;
      if (!content) {
        const res = await getRawLog(selected.log_file_id!);
        content = res.data.content;
        setRawLog(content);
      }
      setSysLog(extractLogSections(content, ['show log']));
      setSysLogLoading(false);
    };
    fetch().catch(() => setSysLogLoading(false));
  }, [selected?.id]);

  const s = selected;

  return (
    <Layout title={`장비 상세: ${name}`}>
      <div className="breadcrumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Link to="/dashboard">대시보드</Link>
          <span>›</span>
          <span>{name}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => prevName && navigate(`/devices/${encodeURIComponent(prevName)}`)}
            disabled={!prevName}
            style={{ padding: '6px 18px', fontSize: 13, fontWeight: 600, border: '1px solid #e2e8f0', borderRadius: 6, background: prevName ? '#fff' : '#f7fafc', color: prevName ? '#2d3748' : '#cbd5e0', cursor: prevName ? 'pointer' : 'default' }}
          >이전</button>
          <button
            onClick={() => nextName && navigate(`/devices/${encodeURIComponent(nextName)}`)}
            disabled={!nextName}
            style={{ padding: '6px 18px', fontSize: 13, fontWeight: 600, border: '1px solid #e2e8f0', borderRadius: 6, background: nextName ? '#fff' : '#f7fafc', color: nextName ? '#2d3748' : '#cbd5e0', cursor: nextName ? 'pointer' : 'default' }}
          >다음</button>
        </div>
      </div>

      {loading && <div className="loading-box">불러오는 중...</div>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && snapshots.length > 0 && (
        <>
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

              <Section title="장비 정보" onShowLog={() => showLog('장비 정보', ['show switch', 'show version', 'show banner', 'show sntp'])}>
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

              <Section title="관리 설정 (Management)" onShowLog={() => showLog('관리 설정', ['show management', 'show man', 'show sman'])}>
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

              {s.power_supplies.length > 0 && (
                <Section title="전원 공급 (Power Supply)" onShowLog={() => showLog('전원 공급', ['show power'])}>
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

              <Section title="계정 정보 (Account)" onShowLog={() => showLog('계정 정보', ['show account'])}>
                <div className="info-grid">
                  <InfoRow label="Admin 계정" value={<StatusBadge value={String(s.account_admin)} type="account" />} />
                  <InfoRow label="User 계정" value={<StatusBadge value={String(s.account_user)} type="account" />} />
                </div>
              </Section>

              {s.vlans.length > 0 && (
                <Section title={`VLAN 목록 (${s.vlans.length}개)`} onShowLog={() => showLog('VLAN 목록', ['show vlan'])}>
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

              {s.port_vlans.length > 0 && (
                <Section title="포트 VLAN 목록" onShowLog={() => showLog('포트 VLAN', ['show port no', 'show ports no'])}>
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {s.port_vlans.map((v, i) => <span key={i} className="tag">{v}</span>)}
                  </div>
                </Section>
              )}
            </>
          )}

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

          {(() => {
            const filteredSysLog = sysLog
              ? (sysLogDateFrom || sysLogDateTo
                ? sysLog.split('\n').filter((l) => {
                    const m = l.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
                    if (!m) return false;
                    const d = new Date(`${m[3]}-${m[1]}-${m[2]}`);
                    if (sysLogDateFrom && d < new Date(sysLogDateFrom)) return false;
                    if (sysLogDateTo && d > new Date(sysLogDateTo)) return false;
                    return true;
                  }).join('\n')
                : sysLog)
              : null;
            return (
              <Section
                title="시스템 로그 (show logs)"
                headerRight={sysLog ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {[{ label: '1개월', days: 30 }, { label: '2개월', days: 60 }, { label: '3개월', days: 90 }].map(({ label, days }) => (
                      <button
                        key={label}
                        onClick={() => {
                          const to = new Date();
                          const from = new Date();
                          from.setDate(from.getDate() - days);
                          setSysLogDateFrom(from.toISOString().slice(0, 10));
                          setSysLogDateTo(to.toISOString().slice(0, 10));
                        }}
                        style={{ padding: '3px 10px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 5, background: '#edf2f7', color: '#4a5568', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >{label}</button>
                    ))}
                    <input type="date" className="form-input" style={{ width: 150, padding: '3px 8px' }} value={sysLogDateFrom} onChange={(e) => setSysLogDateFrom(e.target.value)} />
                    <span className="text-muted">~</span>
                    <input type="date" className="form-input" style={{ width: 150, padding: '3px 8px' }} value={sysLogDateTo} onChange={(e) => setSysLogDateTo(e.target.value)} />
                    {(sysLogDateFrom || sysLogDateTo) && (
                      <button onClick={() => { setSysLogDateFrom(''); setSysLogDateTo(''); }} style={{ padding: '3px 10px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 5, background: '#edf2f7', color: '#4a5568', cursor: 'pointer', whiteSpace: 'nowrap' }}>초기화</button>
                    )}
                  </div>
                ) : undefined}
              >
                {sysLogLoading && <div className="text-muted text-sm">불러오는 중...</div>}
                {!sysLogLoading && sysLog && (
                  <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#f7fafc', borderRadius: 6, padding: '12px 16px' }}>
                    {filteredSysLog
                      ? filteredSysLog.split('\n').map((line, i) => {
                          const excluded = /AAA\.LogSsh|AAA\.authPass|AAA\.logout|cli\.logRemoteCmd/.test(line) || /# show/.test(line);
                          return (
                            <span key={i} style={{ display: 'block', background: excluded ? 'transparent' : 'rgba(49,130,206,0.12)', borderRadius: 3 }}>{line}</span>
                          );
                        })
                      : '해당 기간의 로그가 없습니다.'}
                  </pre>
                )}
                {!sysLogLoading && !sysLog && <div className="text-muted text-sm">로그 데이터를 찾을 수 없습니다.</div>}
              </Section>
            );
          })()}
        </>
      )}

      {!loading && !error && snapshots.length === 0 && (
        <div className="empty-box">장비 데이터를 찾을 수 없습니다.</div>
      )}

      {modal && <LogModal title={modal.title} content={modal.content} onClose={() => setModal(null)} />}
    </Layout>
  );
}
