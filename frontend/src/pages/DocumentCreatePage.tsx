import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRecord, getRecordFile, getTemplates } from '../api/client';
import api from '../api/client';
import type { DocumentTemplate } from '../types';
import Layout from '../components/Layout';

declare module 'docx-preview' {
  export function renderAsync(
    data: Blob | ArrayBuffer | Uint8Array,
    bodyContainer: HTMLElement,
    styleContainer?: HTMLElement | null,
    options?: Record<string, unknown>
  ): Promise<void>;
}

export default function DocumentCreatePage() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedRecordId, setSavedRecordId] = useState<number | null>(null);

  // 파일 로딩
  const [loadingProgress, setLoadingProgress] = useState(0);   // 0~100
  const [loadingStage, setLoadingStage] = useState<'idle' | 'downloading' | 'rendering' | 'done'>('idle');

  // 템플릿 버퍼를 state로 관리 → 변경 시 useEffect로 렌더 트리거
  const [templateBuffer, setTemplateBuffer] = useState<ArrayBuffer | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getTemplates().then(res => setTemplates(res.data));
  }, []);

  const selectedTemplate = templates.find(t => t.id === selectedId) ?? null;

  // ── 템플릿 선택 시 파일 다운로드 ───────────────────────────────────────────
  useEffect(() => {
    if (!selectedId) {
      setTemplateBuffer(null);
      setLoadingStage('idle');
      setLoadingProgress(0);
      return;
    }

    setTemplateBuffer(null);
    setLoadingStage('downloading');
    setLoadingProgress(0);
    setSavedRecordId(null);

    // 필드 초기화
    const tmpl = templates.find(t => t.id === selectedId);
    if (tmpl) {
      const init: Record<string, string> = {};
      tmpl.variables.forEach(v => { init[v.key] = ''; });
      setFieldValues(init);
    }

    api.get(`/documents/templates/${selectedId}/file`, {
      responseType: 'arraybuffer',
      onDownloadProgress: (event) => {
        if (event.total && event.total > 0) {
          // 다운로드 진행률은 0~80%로 매핑 (나머지 20%는 렌더링용)
          const pct = Math.round((event.loaded / event.total) * 80);
          setLoadingProgress(pct);
        }
      },
    })
      .then(res => {
        setTemplateBuffer(res.data as ArrayBuffer);
      })
      .catch(() => {
        setTemplateBuffer(null);
        setLoadingStage('idle');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ── 버퍼 로드 완료 → 초기 렌더링 ──────────────────────────────────────────
  useEffect(() => {
    if (!templateBuffer || !selectedTemplate) return;
    setLoadingStage('rendering');
    setLoadingProgress(80);

    const doRender = async () => {
      await renderPreview(fieldValues);
      setLoadingProgress(100);
      setLoadingStage('done');
    };
    doRender();
  // fieldValues 제외 — 초기 1회만 실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateBuffer, selectedTemplate]);

  // ── 필드 변경 시 디바운스 렌더링 ───────────────────────────────────────────
  useEffect(() => {
    if (!templateBuffer || loadingStage !== 'done') return;
    if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
    renderTimerRef.current = setTimeout(() => renderPreview(fieldValues), 150);
    return () => {
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldValues]);

  const renderPreview = useCallback(async (values: Record<string, string>) => {
    const container = previewRef.current;
    if (!templateBuffer || !container || !selectedTemplate) return;
    try {
      if (selectedTemplate.file_type === 'docx') {
        await renderDocxPreview(templateBuffer, values, container);
      } else {
        await renderXlsxPreview(templateBuffer, values, container);
      }
    } catch (e) {
      console.error('미리보기 렌더링 오류:', e);
    }
  }, [templateBuffer, selectedTemplate]);

  const handleFieldChange = (key: string, value: string) => {
    setFieldValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!selectedId || !title.trim()) return;
    setSaving(true);
    setSaveError('');
    setSavedRecordId(null);
    try {
      const res = await createRecord({
        template_id: selectedId as number,
        title: title.trim(),
        field_values: fieldValues,
      });
      setSavedRecordId(res.data.id);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setSaveError(err.response?.data?.detail || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!savedRecordId || !selectedTemplate) return;
    try {
      const res = await getRecordFile(savedRecordId);
      const blob = new Blob([res.data as ArrayBuffer], {
        type: selectedTemplate.file_type === 'docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.${selectedTemplate.file_type}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('다운로드 실패');
    }
  };

  const isLoading = loadingStage === 'downloading' || loadingStage === 'rendering';
  const loadingLabel = loadingStage === 'downloading' ? '파일 다운로드 중...' : '미리보기 렌더링 중...';

  return (
    <Layout title="문서 작성">
      <div style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: 0, overflow: 'hidden' }}>

        {/* ── 왼쪽: 입력 폼 ── */}
        <div style={{ width: 360, flexShrink: 0, overflowY: 'auto', padding: '0 24px 24px 0', borderRight: '1px solid #e2e8f0' }}>

          <div className="form-group">
            <label className="form-label">템플릿 선택</label>
            <select
              className="form-control"
              value={selectedId}
              onChange={e => {
                setSavedRecordId(null);
                setSelectedId(e.target.value ? Number(e.target.value) : '');
              }}
            >
              <option value="">-- 템플릿을 선택하세요 --</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  [{t.file_type.toUpperCase()}] {t.name}
                </option>
              ))}
            </select>
          </div>

          {selectedTemplate && (
            <>
              {selectedTemplate.variables.length === 0 ? (
                <div style={{ padding: 16, background: '#fffbea', border: '1px solid #f6e05e', borderRadius: 8, fontSize: 14, color: '#744210', marginBottom: 16 }}>
                  이 템플릿에는 변수가 없습니다.
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 8, fontSize: 13, color: '#718096' }}>
                    입력하면 오른쪽 미리보기가 실시간으로 업데이트됩니다.
                  </div>
                  {selectedTemplate.variables.map(v => (
                    <div className="form-group" key={v.key}>
                      <label className="form-label">
                        {v.label}
                        <span style={{ marginLeft: 6, fontSize: 11, color: '#a0aec0', fontFamily: 'monospace' }}>
                          {`{{${v.key}}}`}
                        </span>
                      </label>
                      <input
                        className="form-control"
                        value={fieldValues[v.key] ?? ''}
                        onChange={e => handleFieldChange(v.key, e.target.value)}
                        placeholder={`${v.label} 입력`}
                        disabled={isLoading}
                      />
                    </div>
                  ))}
                </>
              )}

              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">문서 제목 *</label>
                <input
                  className="form-control"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="저장될 파일명 (확장자 제외)"
                  disabled={isLoading}
                />
              </div>

              {saveError && (
                <div style={{ color: '#c53030', fontSize: 13, marginBottom: 8 }}>{saveError}</div>
              )}

              {savedRecordId ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ padding: 12, background: '#f0fff4', border: '1px solid #9ae6b4', borderRadius: 8, fontSize: 14, color: '#276749' }}>
                    저장 완료!
                  </div>
                  <button className="btn btn-primary" onClick={handleDownload}>
                    다운로드 (.{selectedTemplate.file_type})
                  </button>
                  <button className="btn btn-secondary" onClick={() => {
                    setSavedRecordId(null);
                    setTitle('');
                    const init: Record<string, string> = {};
                    selectedTemplate.variables.forEach(v => { init[v.key] = ''; });
                    setFieldValues(init);
                  }}>
                    새 문서 작성
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={handleSave}
                  disabled={saving || !title.trim() || isLoading}
                >
                  {saving ? '저장 중...' : '저장 및 다운로드'}
                </button>
              )}
            </>
          )}
        </div>

        {/* ── 오른쪽: 미리보기 ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0 0 24px 24px' }}>
          {!selectedId ? (
            /* 템플릿 미선택 */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#a0aec0' }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>📄</div>
              <div>왼쪽에서 템플릿을 선택하면 미리보기가 표시됩니다.</div>
            </div>
          ) : (
            <>
              {/* 헤더 */}
              <div style={{ marginBottom: 12, fontSize: 13, color: '#718096', flexShrink: 0 }}>
                미리보기 — 실제 출력 결과와 다소 다를 수 있습니다.
              </div>

              {/* 로딩 오버레이 (미리보기 컨테이너 위에 표시) */}
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

                {isLoading && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 10,
                    background: 'rgba(247,250,252,0.92)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    borderRadius: 8,
                    gap: 16,
                  }}>
                    {/* 아이콘 */}
                    <div style={{ fontSize: 40 }}>
                      {loadingStage === 'downloading' ? '⬇️' : '⚙️'}
                    </div>

                    {/* 단계 라벨 */}
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#2d3748' }}>
                      {loadingLabel}
                    </div>

                    {/* 게이지 바 */}
                    <div style={{ width: 280 }}>
                      <div style={{
                        background: '#e2e8f0',
                        borderRadius: 999,
                        height: 10,
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          borderRadius: 999,
                          background: 'linear-gradient(90deg, #3182ce, #63b3ed)',
                          width: `${loadingProgress}%`,
                          transition: 'width 0.2s ease',
                        }} />
                      </div>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        marginTop: 6, fontSize: 12, color: '#718096',
                      }}>
                        <span>{loadingLabel.replace('...', '')}</span>
                        <span style={{ fontWeight: 600, color: '#3182ce' }}>{loadingProgress}%</span>
                      </div>
                    </div>

                    {/* 단계 인디케이터 — isLoading 블록 안에서 타입은 'downloading' | 'rendering' */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                      <StepDot label="다운로드" active={loadingStage === 'downloading'} done={loadingStage === 'rendering'} />
                      <div style={{ width: 24, height: 1, background: '#cbd5e0' }} />
                      <StepDot label="렌더링" active={loadingStage === 'rendering'} done={false} />
                    </div>
                  </div>
                )}

                {/* 미리보기 컨테이너 — 항상 DOM에 존재 */}
                <div
                  ref={previewRef}
                  style={{
                    height: '100%',
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: selectedTemplate?.file_type === 'xlsx' ? 0 : 16,
                    overflowY: 'auto',
                    opacity: isLoading ? 0 : 1,
                    transition: 'opacity 0.3s ease',
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

// ── 스텝 인디케이터 컴포넌트 ───────────────────────────────────────────────────

function StepDot({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  const bg = done ? '#38a169' : active ? '#3182ce' : '#e2e8f0';
  const color = done || active ? '#fff' : '#a0aec0';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: bg, color, fontSize: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700,
        transition: 'background 0.3s',
      }}>
        {done ? '✓' : active ? '●' : '○'}
      </div>
      <span style={{ fontSize: 11, color: active ? '#3182ce' : done ? '#38a169' : '#a0aec0', fontWeight: active || done ? 600 : 400 }}>
        {label}
      </span>
    </div>
  );
}

// ── Word 미리보기 ──────────────────────────────────────────────────────────────

async function renderDocxPreview(
  originalBuffer: ArrayBuffer,
  values: Record<string, string>,
  container: HTMLElement
) {
  const JSZip = (await import('jszip')).default;
  const { renderAsync } = await import('docx-preview');

  const zip = await JSZip.loadAsync(originalBuffer.slice(0));

  const xmlFile = zip.file('word/document.xml');
  if (xmlFile) {
    let xml = await xmlFile.async('string');
    for (const [key, value] of Object.entries(values)) {
      if (!value) continue;
      const escaped = value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      xml = xml.replaceAll(`{{${key}}}`, escaped);
    }
    zip.file('word/document.xml', xml);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  container.innerHTML = '';
  await renderAsync(blob, container, undefined, {
    className: 'docx-wrapper',
    inWrapper: false,
    ignoreWidth: false,
    ignoreHeight: false,
  });
}

// ── Excel 미리보기 ─────────────────────────────────────────────────────────────

async function renderXlsxPreview(
  originalBuffer: ArrayBuffer,
  values: Record<string, string>,
  container: HTMLElement
) {
  const XLSX = (await import('xlsx')).default;

  const wb = XLSX.read(new Uint8Array(originalBuffer), { type: 'array' });

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    for (const cellRef in ws) {
      if (cellRef.startsWith('!')) continue;
      const cell = ws[cellRef];
      if (cell.t === 's' && typeof cell.v === 'string') {
        let val = cell.v as string;
        for (const [key, value] of Object.entries(values)) {
          if (!value) continue;
          val = val.replaceAll(`{{${key}}}`, value);
        }
        if (val !== cell.v) {
          cell.v = val;
          cell.w = val;
        }
      }
    }
  }

  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  const html = XLSX.utils.sheet_to_html(firstSheet);

  container.innerHTML = `
    <style>
      .xlsx-preview table { border-collapse: collapse; width: 100%; font-size: 13px; }
      .xlsx-preview td, .xlsx-preview th { border: 1px solid #e2e8f0; padding: 6px 10px; }
      .xlsx-preview tr:first-child { background: #f7fafc; font-weight: 600; }
    </style>
    <div class="xlsx-preview">${html}</div>
  `;
}
