import { useCallback, useEffect, useRef, useState } from 'react';
import { getAssets, syncAssetsFromLogs, updateAsset, uploadAssetExcel } from '../api/client';
import Layout from '../components/Layout';
import type { AssetItem } from '../types';

interface ColumnDef {
  key: keyof AssetItem;
  label: string;
  auto: boolean;
  defaultWidth: number;
}

interface DuplicateResolutionState {
  serial: string;
  candidates: AssetItem[];
  selectedDevice: string;
  saving: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: 'asset_number', label: '자산번호', auto: false, defaultWidth: 110 },
  { key: 'resource_status', label: '자원상태', auto: false, defaultWidth: 90 },
  { key: 'manufacturer', label: '제조사', auto: true, defaultWidth: 110 },
  { key: 'model', label: '모델', auto: true, defaultWidth: 140 },
  { key: 'serial_number', label: '일련번호', auto: true, defaultWidth: 150 },
  { key: 'idc_name', label: 'IDC명', auto: false, defaultWidth: 100 },
  { key: 'floor_name', label: '상면명', auto: false, defaultWidth: 100 },
  { key: 'rack_row', label: '랙열명', auto: false, defaultWidth: 80 },
  { key: 'rack_name', label: '랙명', auto: false, defaultWidth: 80 },
  { key: 'hole_number', label: '홀번호', auto: false, defaultWidth: 80 },
  { key: 'status_change_date', label: '상태변경일', auto: false, defaultWidth: 110 },
  { key: 'hostname', label: '호스트명', auto: true, defaultWidth: 130 },
  { key: 'device_category', label: '장비분류', auto: false, defaultWidth: 100 },
  { key: 'os', label: 'OS', auto: true, defaultWidth: 180 },
  { key: 'ip', label: 'IP', auto: true, defaultWidth: 130 },
  { key: 'asset_inspection', label: '자산점검', auto: false, defaultWidth: 90 },
  { key: 'status_inspection', label: '상태점검', auto: false, defaultWidth: 90 },
  { key: 'config_inspection', label: '설정점검', auto: false, defaultWidth: 90 },
  { key: 'env_inspection', label: '환경점검', auto: false, defaultWidth: 90 },
  { key: 'telnet_accessible', label: '텔넷접속가능여부', auto: false, defaultWidth: 130 },
  { key: 'asset_sticker', label: '자산번호스티커', auto: false, defaultWidth: 120 },
  { key: 'rfid_attached', label: 'RFID부착', auto: false, defaultWidth: 100 },
  { key: 'cmdb_match', label: 'CMDB일치', auto: false, defaultWidth: 100 },
  { key: 'uplink_redundancy', label: '업링크이중화', auto: false, defaultWidth: 110 },
  { key: 'vim_module', label: 'VIM모듈장착', auto: false, defaultWidth: 110 },
  { key: 'note_before_after', label: '비고(수정전,후내용표기)', auto: false, defaultWidth: 180 },
  { key: 'note', label: '비고', auto: false, defaultWidth: 150 },
];

const STORAGE_KEY = 'asset_col_widths';

function normalizeSerial(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildDuplicateSerialMap(items: AssetItem[]): Record<string, AssetItem[]> {
  const grouped: Record<string, AssetItem[]> = {};

  items.forEach((item) => {
    const serial = normalizeSerial(item.serial_number);
    if (!serial) return;
    grouped[serial] = [...(grouped[serial] ?? []), item];
  });

  return Object.fromEntries(
    Object.entries(grouped).filter(([, entries]) => entries.length > 1)
  );
}

function loadWidths(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length === COLUMNS.length) return arr;
    }
  } catch { /* ignore */ }
  return COLUMNS.map((c) => c.defaultWidth);
}

export default function AssetManagementPage() {
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editCell, setEditCell] = useState<{ device: string; key: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [duplicateResolution, setDuplicateResolution] = useState<DuplicateResolutionState | null>(null);
  const [uploadResult, setUploadResult] = useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null);
  const [syncResult, setSyncResult] = useState<{ synced: number; created: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 열 너비 상태
  const [colWidths, setColWidths] = useState<number[]>(loadWidths);
  const resizeRef = useRef<{ colIdx: number; startX: number; startW: number } | null>(null);

  useEffect(() => {
    getAssets()
      .then((res) => setAssets(res.data))
      .catch(() => setError('자산 정보를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (editCell && inputRef.current) inputRef.current.focus();
  }, [editCell]);

  // 열 너비 localStorage 동기화
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colWidths));
  }, [colWidths]);

  // 드래그 리사이즈 핸들러
  const onResizeMouseDown = useCallback((e: React.MouseEvent, colIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { colIdx, startX: e.clientX, startW: colWidths[colIdx] };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const diff = ev.clientX - resizeRef.current.startX;
      const newW = Math.max(40, resizeRef.current.startW + diff);
      setColWidths((prev) => {
        const next = [...prev];
        next[resizeRef.current!.colIdx] = newW;
        return next;
      });
    };

    const onMouseUp = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [colWidths]);

  const resetWidths = () => {
    setColWidths(COLUMNS.map((c) => c.defaultWidth));
  };

  const filtered = assets.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.device_name.toLowerCase().includes(q) ||
      (a.hostname ?? '').toLowerCase().includes(q) ||
      (a.ip ?? '').toLowerCase().includes(q) ||
      (a.model ?? '').toLowerCase().includes(q) ||
      (a.serial_number ?? '').toLowerCase().includes(q) ||
      (a.asset_number ?? '').toLowerCase().includes(q)
    );
  });
  const duplicateSerialMap = buildDuplicateSerialMap(assets);
  const duplicateSerialCount = Object.keys(duplicateSerialMap).length;

  const startEdit = (device: string, key: string, currentValue: string | null) => {
    setEditCell({ device, key });
    setEditValue(currentValue ?? '');
  };

  const openDuplicateResolution = (serial: string) => {
    const candidates = duplicateSerialMap[serial];
    if (!candidates?.length) return;
    setEditCell(null);
    setDuplicateResolution({
      serial,
      candidates,
      selectedDevice: candidates[0].device_name,
      saving: false,
    });
  };

  const closeDuplicateResolution = () => {
    if (duplicateResolution?.saving) return;
    setDuplicateResolution(null);
  };

  const saveEdit = async () => {
    if (!editCell) return;
    setSaving(true);
    try {
      await updateAsset(editCell.device, { [editCell.key]: editValue || null } as Partial<AssetItem>);
      setAssets((prev) =>
        prev.map((a) =>
          a.device_name === editCell.device
            ? { ...a, [editCell.key]: editValue || null }
            : a
        )
      );
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
      setEditCell(null);
    }
  };

  const cancelEdit = () => setEditCell(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveEdit();
    else if (e.key === 'Escape') cancelEdit();
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    setSyncResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadAssetExcel(formData);
      setUploadResult(res.data);
      const refreshed = await getAssets();
      setAssets(refreshed.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '업로드에 실패했습니다.';
      alert(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSync = async () => {
    if (!confirm('업로드된 로그 데이터로 자동 필드(제조사, 모델, 일련번호, 호스트명, OS, IP)를 덮어씁니다. 계속하시겠습니까?')) return;
    setSyncing(true);
    setSyncResult(null);
    setUploadResult(null);
    try {
      const res = await syncAssetsFromLogs();
      setSyncResult(res.data);
      const refreshed = await getAssets();
      setAssets(refreshed.data);
    } catch {
      alert('동기화에 실패했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  const handleResolveDuplicate = async () => {
    if (!duplicateResolution) return;

    const devicesToClear = duplicateResolution.candidates.filter(
      (candidate) => candidate.device_name !== duplicateResolution.selectedDevice
    );

    if (devicesToClear.length === 0) {
      setDuplicateResolution(null);
      return;
    }

    setDuplicateResolution((prev) => (prev ? { ...prev, saving: true } : prev));
    try {
      await Promise.all(
        devicesToClear.map((candidate) =>
          updateAsset(candidate.device_name, { serial_number: null })
        )
      );

      const clearTargets = new Set(devicesToClear.map((candidate) => candidate.device_name));
      setAssets((prev) =>
        prev.map((asset) =>
          clearTargets.has(asset.device_name) ? { ...asset, serial_number: null } : asset
        )
      );
      setDuplicateResolution(null);
    } catch {
      alert('중복 시리얼 정리에 실패했습니다.');
      setDuplicateResolution((prev) => (prev ? { ...prev, saving: false } : prev));
    }
  };

  return (
    <Layout title="자산관리">
      <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <input
            type="text"
            className="form-input"
            placeholder="장비명, 호스트명, IP, 모델, 일련번호, 자산번호 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 360 }}
          />
          <span className="text-muted text-sm">총 {filtered.length}대</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn btn-primary btn-sm"
              style={{ fontSize: 12, whiteSpace: 'nowrap' }}
            >
              {uploading ? '업로드 중...' : '엑셀 업로드'}
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                fontSize: 12, padding: '5px 14px', whiteSpace: 'nowrap',
                background: '#48bb78', color: '#fff', border: 'none', borderRadius: 5,
                cursor: syncing ? 'default' : 'pointer', opacity: syncing ? 0.6 : 1,
              }}
            >
              {syncing ? '동기화 중...' : '로그 동기화'}
            </button>
            <button
              onClick={resetWidths}
              style={{ fontSize: 12, padding: '3px 10px', background: '#edf2f7', border: '1px solid #e2e8f0', borderRadius: 5, cursor: 'pointer', color: '#4a5568', whiteSpace: 'nowrap' }}
            >
              열 너비 초기화
            </button>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#718096' }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: 2 }} />
              자동 (로그 기반)
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#718096' }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 2 }} />
              수동 입력
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#9b2c2c' }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: '#fed7d7', border: '1px solid #fc8181', borderRadius: 2 }} />
              중복 시리얼 {duplicateSerialCount}건
            </span>
          </div>
        </div>
      </div>

      {syncResult && (
        <div className="card" style={{ padding: '12px 20px', marginBottom: 16, background: '#ebf8ff', border: '1px solid #bee3f8' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13 }}>
              로그 동기화 완료 — 갱신 <strong>{syncResult.synced}</strong>건
              {syncResult.created > 0 && <>, 신규 생성 <strong>{syncResult.created}</strong>건</>}
            </span>
            <button onClick={() => setSyncResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#718096', fontSize: 16 }}>✕</button>
          </div>
        </div>
      )}

      {uploadResult && (
        <div className="card" style={{ padding: '12px 20px', marginBottom: 16, background: '#f0fff4', border: '1px solid #c6f6d5' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13 }}>
              엑셀 업로드 완료 — 신규 <strong>{uploadResult.created}</strong>건, 갱신 <strong>{uploadResult.updated}</strong>건
              {uploadResult.skipped > 0 && <>, 건너뜀 {uploadResult.skipped}건</>}
              {uploadResult.errors.length > 0 && <span style={{ color: '#e53e3e' }}>, 오류 {uploadResult.errors.length}건</span>}
            </span>
            <button onClick={() => setUploadResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#718096', fontSize: 16 }}>✕</button>
          </div>
          {uploadResult.errors.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#e53e3e' }}>
              {uploadResult.errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </div>
      )}

      {loading && <div className="loading-box">불러오는 중...</div>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
            <table style={{ minWidth: colWidths.reduce((s, w) => s + w, 60), borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 60 }} />
                {colWidths.map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th style={{
                    position: 'sticky', top: 0, left: 0, zIndex: 3,
                    background: '#f7fafc', padding: '10px 12px', borderBottom: '2px solid #e2e8f0',
                    borderRight: '2px solid #e2e8f0', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap',
                  }}>
                    #
                  </th>
                  {COLUMNS.map((col, colIdx) => (
                    <th
                      key={col.key}
                      style={{
                        position: 'sticky', top: 0, zIndex: 2,
                        background: col.auto ? '#ebf8ff' : '#f7fafc',
                        padding: '10px 12px', borderBottom: '2px solid #e2e8f0',
                        fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap',
                        textAlign: 'left', overflow: 'hidden',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.label}</span>
                        <div
                          onMouseDown={(e) => onResizeMouseDown(e, colIdx)}
                          style={{
                            position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
                            cursor: 'col-resize', background: 'transparent',
                          }}
                          onMouseOver={(e) => (e.currentTarget.style.background = '#bee3f8')}
                          onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                        />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((asset, idx) => {
                  const rowSerial = normalizeSerial(asset.serial_number);
                  const isDuplicateRow = !!rowSerial && !!duplicateSerialMap[rowSerial];

                  return (
                    <tr key={asset.device_name} style={{ borderBottom: '1px solid #edf2f7' }}>
                      <td style={{
                        position: 'sticky', left: 0, zIndex: 1,
                        background: isDuplicateRow ? '#fff5f5' : '#fff', padding: '8px 12px',
                        borderRight: '2px solid #e2e8f0',
                        fontWeight: 600, fontSize: 12, color: '#718096',
                        boxShadow: isDuplicateRow ? 'inset 0 0 0 1px #fc8181' : undefined,
                      }}>
                        {idx + 1}
                      </td>
                      {COLUMNS.map((col) => {
                        const value = asset[col.key] as string | null;
                        const isEditing = editCell?.device === asset.device_name && editCell?.key === col.key;
                        const serial = col.key === 'serial_number' ? normalizeSerial(value) : null;
                        const isDuplicateSerial = !!serial && !!duplicateSerialMap[serial];

                        if (isEditing) {
                          return (
                            <td key={col.key} style={{ padding: '4px 6px', background: '#fffff0', overflow: 'hidden' }}>
                              <input
                                ref={inputRef}
                                className="form-input"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onBlur={saveEdit}
                                disabled={saving}
                                style={{ width: '100%', padding: '4px 8px', fontSize: 13, boxSizing: 'border-box' }}
                              />
                            </td>
                          );
                        }

                        return (
                          <td
                            key={col.key}
                            onClick={() => {
                              if (isDuplicateSerial && serial) {
                                openDuplicateResolution(serial);
                                return;
                              }
                              startEdit(asset.device_name, col.key, value);
                            }}
                            style={{
                              padding: '8px 12px', cursor: 'pointer',
                              whiteSpace: 'nowrap', overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              background: isDuplicateRow ? '#fff5f5' : col.auto ? '#f7fbff' : undefined,
                              boxShadow: isDuplicateRow ? 'inset 0 0 0 1px #fc8181' : undefined,
                              fontFamily: col.key === 'ip' || col.key === 'serial_number' ? 'monospace' : 'inherit',
                              fontSize: col.key === 'os' ? 12 : 13,
                              color: isDuplicateRow ? '#9b2c2c' : undefined,
                              fontWeight: isDuplicateSerial ? 700 : undefined,
                            }}
                            title={
                              isDuplicateSerial && serial
                                ? `${serial} (중복 시리얼: 클릭하여 정리)`
                                : value
                                  ? `${value} (클릭하여 편집)`
                                  : '클릭하여 편집'
                            }
                          >
                            {value ?? <span style={{ color: '#cbd5e0' }}>-</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length + 1} style={{ padding: 40, textAlign: 'center', color: '#a0aec0' }}>
                      {search ? '검색 결과가 없습니다.' : '등록된 장비가 없습니다. 로그를 업로드하면 자동으로 추가됩니다.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {duplicateResolution && (
        <div className="modal-overlay" onClick={closeDuplicateResolution}>
          <div className="modal" style={{ width: 560, maxWidth: 'calc(100vw - 32px)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">중복 시리얼 정리</div>
            <p style={{ fontSize: 13, color: '#4a5568', marginBottom: 16 }}>
              시리얼 <strong style={{ fontFamily: 'monospace' }}>{duplicateResolution.serial}</strong> 이(가) 여러 장비에 등록되어 있습니다.
              유지할 장비를 선택하면 나머지 장비의 시리얼 값은 비워집니다.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
              {duplicateResolution.candidates.map((candidate) => (
                <label
                  key={candidate.device_name}
                  style={{
                    display: 'block',
                    border: candidate.device_name === duplicateResolution.selectedDevice ? '1px solid #3182ce' : '1px solid #e2e8f0',
                    borderRadius: 10,
                    padding: 14,
                    background: candidate.device_name === duplicateResolution.selectedDevice ? '#ebf8ff' : '#fff',
                    cursor: duplicateResolution.saving ? 'default' : 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <input
                      type="radio"
                      name="duplicate-serial-resolution"
                      checked={candidate.device_name === duplicateResolution.selectedDevice}
                      onChange={() => setDuplicateResolution((prev) => (prev ? { ...prev, selectedDevice: candidate.device_name } : prev))}
                      disabled={duplicateResolution.saving}
                      style={{ marginTop: 3 }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1a202c', wordBreak: 'break-all' }}>
                        {candidate.device_name}
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: '#718096' }}>
                        <span>호스트명: {candidate.hostname || '-'}</span>
                        <span>IP: {candidate.ip || '-'}</span>
                        <span>모델: {candidate.model || '-'}</span>
                        <span>자산번호: {candidate.asset_number || '-'}</span>
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closeDuplicateResolution} disabled={duplicateResolution.saving}>
                취소
              </button>
              <button type="button" className="btn btn-danger" onClick={handleResolveDuplicate} disabled={duplicateResolution.saving}>
                {duplicateResolution.saving ? '정리 중...' : '선택 항목만 유지'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
