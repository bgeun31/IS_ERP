import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createSpareAsset,
  deleteAsset,
  deleteSpareAsset,
  getAssets,
  getSpareAssets,
  syncAssetsFromLogs,
  updateAsset,
  updateSpareAsset,
  uploadAssetExcel,
  uploadSpareAssetExcel,
} from '../api/client';
import Layout from '../components/Layout';
import type { AssetItem, SpareAssetItem } from '../types';

type AssetTab = 'assets' | 'spare';

interface ColumnDef<TKey extends string> {
  key: TKey;
  label: string;
  auto?: boolean;
  defaultWidth: number;
}

type AssetColumnKey = keyof AssetItem;
type SpareColumnKey = keyof SpareAssetItem;

type EditCell =
  | { table: 'assets'; rowId: string; key: AssetColumnKey }
  | { table: 'spare'; rowId: number; key: SpareColumnKey };

interface DuplicateResolutionState {
  serial: string;
  candidates: AssetItem[];
  selectedDevice: string;
  saving: boolean;
}

const ASSET_COLUMNS: ColumnDef<AssetColumnKey>[] = [
  { key: 'asset_number', label: '자산번호', defaultWidth: 110 },
  { key: 'resource_status', label: '자원상태', defaultWidth: 90 },
  { key: 'manufacturer', label: '제조사', auto: true, defaultWidth: 110 },
  { key: 'model', label: '모델', auto: true, defaultWidth: 140 },
  { key: 'serial_number', label: '일련번호', auto: true, defaultWidth: 150 },
  { key: 'idc_name', label: 'IDC명', defaultWidth: 100 },
  { key: 'floor_name', label: '상면명', defaultWidth: 100 },
  { key: 'rack_row', label: '랙열명', defaultWidth: 80 },
  { key: 'rack_name', label: '랙명', defaultWidth: 80 },
  { key: 'hole_number', label: '홀번호', defaultWidth: 80 },
  { key: 'status_change_date', label: '상태변경일', defaultWidth: 110 },
  { key: 'hostname', label: '호스트명', auto: true, defaultWidth: 130 },
  { key: 'device_category', label: '장비분류', defaultWidth: 100 },
  { key: 'os', label: 'OS', auto: true, defaultWidth: 180 },
  { key: 'ip', label: 'IP', auto: true, defaultWidth: 130 },
  { key: 'asset_inspection', label: '자산점검', defaultWidth: 90 },
  { key: 'status_inspection', label: '상태점검', defaultWidth: 90 },
  { key: 'config_inspection', label: '설정점검', defaultWidth: 90 },
  { key: 'env_inspection', label: '환경점검', defaultWidth: 90 },
  { key: 'telnet_accessible', label: '텔넷접속가능여부', defaultWidth: 130 },
  { key: 'asset_sticker', label: '자산번호스티커', defaultWidth: 120 },
  { key: 'rfid_attached', label: 'RFID부착', defaultWidth: 100 },
  { key: 'cmdb_match', label: 'CMDB일치', defaultWidth: 100 },
  { key: 'uplink_redundancy', label: '업링크이중화', defaultWidth: 110 },
  { key: 'vim_module', label: 'VIM모듈장착', defaultWidth: 110 },
  { key: 'note_before_after', label: '비고(수정전,후내용표기)', defaultWidth: 180 },
  { key: 'note', label: '비고', defaultWidth: 150 },
];

const SPARE_COLUMNS: ColumnDef<SpareColumnKey>[] = [
  { key: 'idc_primary', label: 'IDC', defaultWidth: 110 },
  { key: 'category', label: '구분', defaultWidth: 100 },
  { key: 'model_name', label: '모델명', defaultWidth: 150 },
  { key: 'hostname', label: 'HostName', defaultWidth: 170 },
  { key: 'asset_number', label: '자산번호', defaultWidth: 120 },
  { key: 'serial_number', label: 'Serialnum', defaultWidth: 150 },
  { key: 'contract_period', label: '계약기간', defaultWidth: 120 },
  { key: 'note', label: '비고', defaultWidth: 150 },
  { key: 'idc_secondary', label: 'IDC', defaultWidth: 110 },
  { key: 'asset_sticker', label: '자산스티커', defaultWidth: 120 },
  { key: 'rfid_attached', label: 'RFID부착', defaultWidth: 100 },
  { key: 'asset_status', label: '자산', defaultWidth: 100 },
  { key: 'note_before_after', label: '비고(수정전,후내용표기)', defaultWidth: 190 },
];

const ASSET_STORAGE_KEY = 'asset_col_widths';
const SPARE_STORAGE_KEY = 'spare_asset_col_widths';

function loadWidths(key: string, defaults: number[]): number[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length === defaults.length) return arr;
    }
  } catch {
    // ignore malformed localStorage values
  }
  return defaults;
}

function normalizeSerial(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formatStatusChangeDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const dashMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dashMatch) return dashMatch[1];

  const slashMatch = trimmed.match(/^(\d{4}\/\d{2}\/\d{2})/);
  if (slashMatch) return slashMatch[1];

  return trimmed.split(' ')[0] || trimmed;
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

export default function AssetManagementPage() {
  const [activeTab, setActiveTab] = useState<AssetTab>('assets');
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [spareAssets, setSpareAssets] = useState<SpareAssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editCell, setEditCell] = useState<EditCell | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [selectedSpareIds, setSelectedSpareIds] = useState<number[]>([]);
  const [duplicateResolution, setDuplicateResolution] = useState<DuplicateResolutionState | null>(null);
  const [uploadResult, setUploadResult] = useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null);
  const [syncResult, setSyncResult] = useState<{ synced: number; created: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assetColWidths, setAssetColWidths] = useState<number[]>(
    () => loadWidths(ASSET_STORAGE_KEY, ASSET_COLUMNS.map((column) => column.defaultWidth))
  );
  const [spareColWidths, setSpareColWidths] = useState<number[]>(
    () => loadWidths(SPARE_STORAGE_KEY, SPARE_COLUMNS.map((column) => column.defaultWidth))
  );
  const resizeRef = useRef<{ colIdx: number; startX: number; startW: number } | null>(null);

  useEffect(() => {
    Promise.all([getAssets(), getSpareAssets()])
      .then(([assetRes, spareRes]) => {
        setAssets(assetRes.data);
        setSpareAssets(spareRes.data);
      })
      .catch(() => setError('자산 정보를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (editCell && inputRef.current) inputRef.current.focus();
  }, [editCell]);

  useEffect(() => {
    localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(assetColWidths));
  }, [assetColWidths]);

  useEffect(() => {
    localStorage.setItem(SPARE_STORAGE_KEY, JSON.stringify(spareColWidths));
  }, [spareColWidths]);

  useEffect(() => {
    setEditCell(null);
    setDuplicateResolution(null);
    setUploadResult(null);
    setSyncResult(null);
    setSelectedSpareIds([]);
  }, [activeTab]);

  const activeColumns = activeTab === 'assets' ? ASSET_COLUMNS : SPARE_COLUMNS;
  const activeColWidths = activeTab === 'assets' ? assetColWidths : spareColWidths;
  const setActiveColWidths = activeTab === 'assets' ? setAssetColWidths : setSpareColWidths;

  const onResizeMouseDown = useCallback((e: React.MouseEvent, colIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { colIdx, startX: e.clientX, startW: activeColWidths[colIdx] };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const diff = ev.clientX - resizeRef.current.startX;
      const nextWidth = Math.max(40, resizeRef.current.startW + diff);
      setActiveColWidths((prev) => {
        const next = [...prev];
        next[resizeRef.current!.colIdx] = nextWidth;
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
  }, [activeColWidths, setActiveColWidths]);

  const resetWidths = () => {
    if (activeTab === 'assets') {
      setAssetColWidths(ASSET_COLUMNS.map((column) => column.defaultWidth));
      return;
    }
    setSpareColWidths(SPARE_COLUMNS.map((column) => column.defaultWidth));
  };

  const filteredAssets = assets.filter((asset) => {
    if (!search) return true;
    const query = search.toLowerCase();
    return (
      asset.device_name.toLowerCase().includes(query) ||
      (asset.hostname ?? '').toLowerCase().includes(query) ||
      (asset.ip ?? '').toLowerCase().includes(query) ||
      (asset.model ?? '').toLowerCase().includes(query) ||
      (asset.serial_number ?? '').toLowerCase().includes(query) ||
      (asset.asset_number ?? '').toLowerCase().includes(query)
    );
  });

  const filteredSpareAssets = spareAssets.filter((asset) => {
    if (!search) return true;
    const query = search.toLowerCase();
    return (
      (asset.hostname ?? '').toLowerCase().includes(query) ||
      (asset.model_name ?? '').toLowerCase().includes(query) ||
      (asset.serial_number ?? '').toLowerCase().includes(query) ||
      (asset.asset_number ?? '').toLowerCase().includes(query) ||
      (asset.idc_primary ?? '').toLowerCase().includes(query) ||
      (asset.idc_secondary ?? '').toLowerCase().includes(query) ||
      (asset.category ?? '').toLowerCase().includes(query)
    );
  });

  const duplicateSerialMap = buildDuplicateSerialMap(assets);
  const duplicateSerialCount = Object.keys(duplicateSerialMap).length;

  const startAssetEdit = (deviceName: string, key: AssetColumnKey, currentValue: string | null) => {
    setEditCell({ table: 'assets', rowId: deviceName, key });
    setEditValue(key === 'status_change_date' ? (formatStatusChangeDate(currentValue) ?? '') : (currentValue ?? ''));
  };

  const startSpareEdit = (id: number, key: SpareColumnKey, currentValue: string | null) => {
    setEditCell({ table: 'spare', rowId: id, key });
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
      if (editCell.table === 'assets') {
        const nextValue = editCell.key === 'status_change_date'
          ? (formatStatusChangeDate(editValue) ?? null)
          : (editValue || null);
        await updateAsset(editCell.rowId, { [editCell.key]: nextValue } as Partial<AssetItem>);
        setAssets((prev) => prev.map((asset) => (
          asset.device_name === editCell.rowId ? { ...asset, [editCell.key]: nextValue } : asset
        )));
      } else {
        const nextValue = editValue || null;
        await updateSpareAsset(editCell.rowId, { [editCell.key]: nextValue } as Partial<SpareAssetItem>);
        setSpareAssets((prev) => prev.map((asset) => (
          asset.id === editCell.rowId ? { ...asset, [editCell.key]: nextValue } : asset
        )));
      }
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

      if (activeTab === 'assets') {
        const res = await uploadAssetExcel(formData);
        setUploadResult(res.data);
        const refreshed = await getAssets();
        setAssets(refreshed.data);
      } else {
        const res = await uploadSpareAssetExcel(formData);
        setUploadResult(res.data);
        const refreshed = await getSpareAssets();
        setSpareAssets(refreshed.data);
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '업로드에 실패했습니다.';
      alert(message);
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

    const devicesToDelete = duplicateResolution.candidates.filter(
      (candidate) => candidate.device_name !== duplicateResolution.selectedDevice
    );

    if (devicesToDelete.length === 0) {
      setDuplicateResolution(null);
      return;
    }

    setDuplicateResolution((prev) => (prev ? { ...prev, saving: true } : prev));
    try {
      await Promise.all(devicesToDelete.map((candidate) => deleteAsset(candidate.device_name)));
      const deleteTargets = new Set(devicesToDelete.map((candidate) => candidate.device_name));
      setAssets((prev) => prev.filter((asset) => !deleteTargets.has(asset.device_name)));
      setDuplicateResolution(null);
    } catch {
      alert('중복 시리얼 정리에 실패했습니다.');
      setDuplicateResolution((prev) => (prev ? { ...prev, saving: false } : prev));
    }
  };

  const handleDeleteAssetRow = async (deviceName: string) => {
    const deleteKey = `assets:${deviceName}`;
    if (deletingKey || saving || duplicateResolution?.saving) return;
    if (!confirm(`${deviceName} 행을 삭제하시겠습니까?\n삭제 후 자산관리 목록과 로그 동기화 대상에서 제외됩니다.`)) return;

    setDeletingKey(deleteKey);
    try {
      await deleteAsset(deviceName);
      setAssets((prev) => prev.filter((asset) => asset.device_name !== deviceName));
      if (editCell?.table === 'assets' && editCell.rowId === deviceName) setEditCell(null);
      if (duplicateResolution?.candidates.some((candidate) => candidate.device_name === deviceName)) {
        setDuplicateResolution(null);
      }
    } catch {
      alert('행 삭제에 실패했습니다.');
    } finally {
      setDeletingKey(null);
    }
  };

  const handleDeleteSpareRow = async (asset: SpareAssetItem) => {
    const deleteKey = `spare:${asset.id}`;
    const label = asset.hostname || `행 ${asset.id}`;
    if (deletingKey || saving) return;
    if (!confirm(`${label} 행을 삭제하시겠습니까?`)) return;

    setDeletingKey(deleteKey);
    try {
      await deleteSpareAsset(asset.id);
      setSpareAssets((prev) => prev.filter((item) => item.id !== asset.id));
      setSelectedSpareIds((prev) => prev.filter((id) => id !== asset.id));
      if (editCell?.table === 'spare' && editCell.rowId === asset.id) setEditCell(null);
    } catch {
      alert('행 삭제에 실패했습니다.');
    } finally {
      setDeletingKey(null);
    }
  };

  const handleAddSpareRow = async () => {
    if (saving || uploading || deletingKey) return;

    try {
      const res = await createSpareAsset();
      setSpareAssets((prev) => [...prev, res.data]);
      setEditCell({ table: 'spare', rowId: res.data.id, key: 'hostname' });
      setEditValue('');
    } catch {
      alert('새 행 추가에 실패했습니다.');
    }
  };

  const toggleSpareSelection = (id: number) => {
    setSelectedSpareIds((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  };

  const visibleSpareIds = filteredSpareAssets.map((asset) => asset.id);
  const allVisibleSpareSelected = visibleSpareIds.length > 0 && visibleSpareIds.every((id) => selectedSpareIds.includes(id));

  const toggleAllVisibleSpareRows = () => {
    setSelectedSpareIds((prev) => {
      if (allVisibleSpareSelected) {
        return prev.filter((id) => !visibleSpareIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleSpareIds]));
    });
  };

  const handleDeleteSelectedSpareRows = async () => {
    if (selectedSpareIds.length === 0 || deletingKey || saving) return;
    if (!confirm(`선택한 ${selectedSpareIds.length}개 행을 삭제하시겠습니까?`)) return;

    setDeletingKey('spare:bulk');
    try {
      await Promise.all(selectedSpareIds.map((id) => deleteSpareAsset(id)));
      const selectedSet = new Set(selectedSpareIds);
      setSpareAssets((prev) => prev.filter((asset) => !selectedSet.has(asset.id)));
      setSelectedSpareIds([]);
      if (editCell?.table === 'spare' && selectedSet.has(editCell.rowId)) {
        setEditCell(null);
      }
    } catch {
      alert('선택 행 삭제에 실패했습니다.');
    } finally {
      setDeletingKey(null);
    }
  };

  const renderAssetTable = () => (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
        <table style={{ minWidth: assetColWidths.reduce((sum, width) => sum + width, 60), borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 60 }} />
            {assetColWidths.map((width, index) => <col key={index} style={{ width }} />)}
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
              {ASSET_COLUMNS.map((column, colIdx) => (
                <th
                  key={column.key}
                  style={{
                    position: 'sticky', top: 0, zIndex: 2,
                    background: column.auto ? '#ebf8ff' : '#f7fafc',
                    padding: '10px 12px', borderBottom: '2px solid #e2e8f0',
                    fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap',
                    textAlign: 'left', overflow: 'hidden',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{column.label}</span>
                    <div
                      onMouseDown={(e) => onResizeMouseDown(e, colIdx)}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
                        cursor: 'col-resize', background: 'transparent',
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.background = '#bee3f8'; }}
                      onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredAssets.map((asset, idx) => {
              const rowSerial = normalizeSerial(asset.serial_number);
              const isDuplicateRow = !!rowSerial && !!duplicateSerialMap[rowSerial];
              const rowDeleteKey = `assets:${asset.device_name}`;

              return (
                <tr key={asset.device_name} style={{ borderBottom: '1px solid #edf2f7' }}>
                  <td style={{
                    position: 'sticky', left: 0, zIndex: 1,
                    background: isDuplicateRow ? '#fff5f5' : '#fff', padding: '8px 12px',
                    borderRight: '2px solid #e2e8f0',
                    fontWeight: 600, fontSize: 12, color: '#718096',
                    boxShadow: isDuplicateRow ? 'inset 0 0 0 1px #fc8181' : undefined,
                  }}>
                    <button
                      type="button"
                      onClick={() => handleDeleteAssetRow(asset.device_name)}
                      disabled={deletingKey === rowDeleteKey}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: isDuplicateRow ? '#9b2c2c' : '#718096',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: deletingKey ? 'default' : 'pointer',
                        padding: 0,
                        width: '100%',
                        textAlign: 'left',
                      }}
                      title={deletingKey === rowDeleteKey ? '삭제 중...' : `${asset.device_name} 행 삭제`}
                    >
                      {deletingKey === rowDeleteKey ? '...' : idx + 1}
                    </button>
                  </td>
                  {ASSET_COLUMNS.map((column) => {
                    const value = asset[column.key] as string | null;
                    const displayValue = column.key === 'status_change_date' ? formatStatusChangeDate(value) : value;
                    const isEditing = editCell?.table === 'assets' && editCell.rowId === asset.device_name && editCell.key === column.key;
                    const serial = column.key === 'serial_number' ? normalizeSerial(value) : null;
                    const isDuplicateSerial = !!serial && !!duplicateSerialMap[serial];

                    if (isEditing) {
                      return (
                        <td key={column.key} style={{ padding: '4px 6px', background: '#fffff0', overflow: 'hidden' }}>
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
                        key={column.key}
                        onClick={() => {
                          if (isDuplicateRow && rowSerial) {
                            openDuplicateResolution(rowSerial);
                            return;
                          }
                          startAssetEdit(asset.device_name, column.key, value);
                        }}
                        style={{
                          padding: '8px 12px', cursor: 'pointer',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          background: isDuplicateRow ? '#fff5f5' : column.auto ? '#f7fbff' : undefined,
                          boxShadow: isDuplicateRow ? 'inset 0 0 0 1px #fc8181' : undefined,
                          fontFamily: column.key === 'ip' || column.key === 'serial_number' ? 'monospace' : 'inherit',
                          fontSize: column.key === 'os' ? 12 : 13,
                          color: isDuplicateRow ? '#9b2c2c' : undefined,
                          fontWeight: isDuplicateSerial ? 700 : undefined,
                        }}
                        title={
                          isDuplicateRow && rowSerial
                            ? `${rowSerial} (중복 행: 클릭하여 비교/정리)`
                            : displayValue
                              ? `${displayValue} (클릭하여 편집)`
                              : '클릭하여 편집'
                        }
                      >
                        {displayValue ?? <span style={{ color: '#cbd5e0' }}>-</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {filteredAssets.length === 0 && (
              <tr>
                <td colSpan={ASSET_COLUMNS.length + 1} style={{ padding: 40, textAlign: 'center', color: '#a0aec0' }}>
                  {search ? '검색 결과가 없습니다.' : '등록된 장비가 없습니다. 로그를 업로드하면 자동으로 추가됩니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSpareTable = () => (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
        <table style={{ minWidth: spareColWidths.reduce((sum, width) => sum + width, 104), borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 44 }} />
            <col style={{ width: 60 }} />
            {spareColWidths.map((width, index) => <col key={index} style={{ width }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{
                position: 'sticky', top: 0, left: 0, zIndex: 4,
                background: '#f7fafc', padding: '10px 8px', borderBottom: '2px solid #e2e8f0',
                borderRight: '1px solid #e2e8f0', textAlign: 'center',
              }}>
                <input type="checkbox" checked={allVisibleSpareSelected} onChange={toggleAllVisibleSpareRows} />
              </th>
              <th style={{
                position: 'sticky', top: 0, left: 44, zIndex: 3,
                background: '#f7fafc', padding: '10px 12px', borderBottom: '2px solid #e2e8f0',
                borderRight: '2px solid #e2e8f0', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap',
              }}>
                #
              </th>
              {SPARE_COLUMNS.map((column, colIdx) => (
                <th
                  key={`${column.key}-${colIdx}`}
                  style={{
                    position: 'sticky', top: 0, zIndex: 2,
                    background: '#f7fafc',
                    padding: '10px 12px', borderBottom: '2px solid #e2e8f0',
                    fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap',
                    textAlign: 'left', overflow: 'hidden',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{column.label}</span>
                    <div
                      onMouseDown={(e) => onResizeMouseDown(e, colIdx)}
                      style={{
                        position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
                        cursor: 'col-resize', background: 'transparent',
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.background = '#bee3f8'; }}
                      onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredSpareAssets.map((asset, idx) => {
              const rowDeleteKey = `spare:${asset.id}`;
              return (
                <tr key={asset.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                  <td style={{
                    position: 'sticky', left: 0, zIndex: 2,
                    background: '#fff', padding: '8px 8px', borderRight: '1px solid #e2e8f0',
                    textAlign: 'center',
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedSpareIds.includes(asset.id)}
                      onChange={() => toggleSpareSelection(asset.id)}
                    />
                  </td>
                  <td style={{
                    position: 'sticky', left: 44, zIndex: 1,
                    background: '#fff', padding: '8px 12px',
                    borderRight: '2px solid #e2e8f0',
                    fontWeight: 600, fontSize: 12, color: '#718096',
                  }}>
                    <button
                      type="button"
                      onClick={() => handleDeleteSpareRow(asset)}
                      disabled={deletingKey === rowDeleteKey}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#718096',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: deletingKey ? 'default' : 'pointer',
                        padding: 0,
                        width: '100%',
                        textAlign: 'left',
                      }}
                      title={deletingKey === rowDeleteKey ? '삭제 중...' : `${asset.hostname || asset.id} 행 삭제`}
                    >
                      {deletingKey === rowDeleteKey ? '...' : idx + 1}
                    </button>
                  </td>
                  {SPARE_COLUMNS.map((column) => {
                    const value = asset[column.key] as string | null;
                    const isEditing = editCell?.table === 'spare' && editCell.rowId === asset.id && editCell.key === column.key;

                    if (isEditing) {
                      return (
                        <td key={`${column.key}-${asset.id}`} style={{ padding: '4px 6px', background: '#fffff0', overflow: 'hidden' }}>
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
                        key={`${column.key}-${asset.id}`}
                        onClick={() => startSpareEdit(asset.id, column.key, value)}
                        style={{
                          padding: '8px 12px', cursor: 'pointer',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          fontFamily: column.key === 'serial_number' ? 'monospace' : 'inherit',
                        }}
                        title={value ? `${value} (클릭하여 편집)` : '클릭하여 편집'}
                      >
                        {value ?? <span style={{ color: '#cbd5e0' }}>-</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {filteredSpareAssets.length === 0 && (
              <tr>
                <td colSpan={SPARE_COLUMNS.length + 1} style={{ padding: 40, textAlign: 'center', color: '#a0aec0' }}>
                  {search ? '검색 결과가 없습니다.' : '등록된 예비장비가 없습니다. 엑셀을 업로드하면 추가됩니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, padding: '14px 0', borderTop: '1px solid #edf2f7', background: '#fafcff' }}>
        <button
          type="button"
          className="btn btn-danger"
          onClick={handleDeleteSelectedSpareRows}
          disabled={selectedSpareIds.length === 0 || deletingKey === 'spare:bulk'}
          style={{ fontSize: 12, padding: '8px 14px' }}
          title="선택한 예비장비 행 삭제"
        >
          {deletingKey === 'spare:bulk' ? '삭제 중...' : `선택 삭제${selectedSpareIds.length > 0 ? ` (${selectedSpareIds.length})` : ''}`}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleAddSpareRow}
          style={{ minWidth: 44, height: 36, justifyContent: 'center', fontSize: 20, lineHeight: 1 }}
          title="예비장비 행 추가"
        >
          +
        </button>
      </div>
    </div>
  );

  const filteredCount = activeTab === 'assets' ? filteredAssets.length : filteredSpareAssets.length;
  const searchPlaceholder = activeTab === 'assets'
    ? '장비명, 호스트명, IP, 모델, 일련번호, 자산번호 검색...'
    : 'IDC, 구분, 모델명, HostName, 자산번호, Serialnum 검색...';

  return (
    <Layout title="자산관리">
      <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setActiveTab('assets')}
            style={{
              background: activeTab === 'assets' ? '#3182ce' : '#edf2f7',
              color: activeTab === 'assets' ? '#fff' : '#4a5568',
              border: activeTab === 'assets' ? 'none' : '1px solid #cbd5e0',
            }}
          >
            자산관리
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setActiveTab('spare')}
            style={{
              background: activeTab === 'spare' ? '#3182ce' : '#edf2f7',
              color: activeTab === 'spare' ? '#fff' : '#4a5568',
              border: activeTab === 'spare' ? 'none' : '1px solid #cbd5e0',
            }}
          >
            예비장비
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <input
            type="text"
            className="form-input"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 360 }}
          />
          <span className="text-muted text-sm">총 {filteredCount}대</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
            {activeTab === 'assets' && (
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
            )}
            <button
              onClick={resetWidths}
              style={{
                fontSize: 12, padding: '3px 10px', background: '#edf2f7',
                border: '1px solid #e2e8f0', borderRadius: 5, cursor: 'pointer',
                color: '#4a5568', whiteSpace: 'nowrap',
              }}
            >
              열 너비 초기화
            </button>
            {activeTab === 'assets' && (
              <>
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
              </>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'assets' && syncResult && (
        <div className="card" style={{ padding: '12px 20px', marginBottom: 16, background: '#ebf8ff', border: '1px solid #bee3f8' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13 }}>
              로그 동기화 완료 - 갱신 <strong>{syncResult.synced}</strong>건
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
              엑셀 업로드 완료 - 신규 <strong>{uploadResult.created}</strong>건, 갱신 <strong>{uploadResult.updated}</strong>건
              {uploadResult.skipped > 0 && <>, 건너뜀 {uploadResult.skipped}건</>}
              {uploadResult.errors.length > 0 && <span style={{ color: '#e53e3e' }}>, 오류 {uploadResult.errors.length}건</span>}
            </span>
            <button onClick={() => setUploadResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#718096', fontSize: 16 }}>✕</button>
          </div>
          {uploadResult.errors.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#e53e3e' }}>
              {uploadResult.errors.map((message, index) => <div key={index}>{message}</div>)}
            </div>
          )}
        </div>
      )}

      {loading && <div className="loading-box">불러오는 중...</div>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && (activeTab === 'assets' ? renderAssetTable() : renderSpareTable())}

      {duplicateResolution && (
        <div className="modal-overlay" onClick={closeDuplicateResolution}>
          <div className="modal" style={{ width: 560, maxWidth: 'calc(100vw - 32px)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">중복 시리얼 정리</div>
            <p style={{ fontSize: 13, color: '#4a5568', marginBottom: 16 }}>
              시리얼 <strong style={{ fontFamily: 'monospace' }}>{duplicateResolution.serial}</strong> 이(가) 여러 장비에 등록되어 있습니다.
              유지할 장비를 선택하면 선택되지 않은 나머지 행은 삭제됩니다.
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
                {duplicateResolution.saving ? '정리 중...' : '선택 항목만 남기기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
