import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRecord, getRecordFile, getTemplateFile, getTemplates } from '../api/client';
import type { DocumentTemplate } from '../types';
import Layout from '../components/Layout';

// docx-preview 타입 선언
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

  // 템플릿 파일 원본 (ArrayBuffer) 보관
  const templateBufferRef = useRef<ArrayBuffer | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    getTemplates().then(res => setTemplates(res.data));
  }, []);

  const selectedTemplate = templates.find(t => t.id === selectedId) ?? null;

  // 템플릿 선택 시 파일 다운로드
  useEffect(() => {
    if (!selectedId) {
      templateBufferRef.current = null;
      if (previewRef.current) previewRef.current.innerHTML = '';
      return;
    }
    setPreviewLoading(true);
    getTemplateFile(selectedId as number)
      .then(res => {
        templateBufferRef.current = res.data as ArrayBuffer;
        // 초기 렌더링 (치환 없이)
        renderPreview({});
      })
      .catch(() => {
        templateBufferRef.current = null;
      })
      .finally(() => setPreviewLoading(false));

    // 필드 초기화
    const tmpl = templates.find(t => t.id === selectedId);
    if (tmpl) {
      const init: Record<string, string> = {};
      tmpl.variables.forEach(v => { init[v.key] = ''; });
      setFieldValues(init);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // 필드 변경 시 디바운스 렌더링
  useEffect(() => {
    if (!templateBufferRef.current) return;
    if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
    renderTimerRef.current = setTimeout(() => renderPreview(fieldValues), 150);
    return () => {
      if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldValues]);

  const renderPreview = useCallback(async (values: Record<string, string>) => {
    const buffer = templateBufferRef.current;
    const container = previewRef.current;
    if (!buffer || !container || !selectedTemplate) return;

    try {
      if (selectedTemplate.file_type === 'docx') {
        await renderDocxPreview(buffer, values, container);
      } else {
        await renderXlsxPreview(buffer, values, container);
      }
    } catch (e) {
      console.error('미리보기 렌더링 오류:', e);
    }
  }, [selectedTemplate]);

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

  return (
    <Layout title="문서 작성">
      <div style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: 0, overflow: 'hidden' }}>

        {/* 왼쪽: 입력 폼 */}
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
                  disabled={saving || !title.trim()}
                >
                  {saving ? '저장 중...' : '저장 및 다운로드'}
                </button>
              )}
            </>
          )}
        </div>

        {/* 오른쪽: 미리보기 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 24px 24px', position: 'relative' }}>
          {!selectedId ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#a0aec0' }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>📄</div>
              <div>왼쪽에서 템플릿을 선택하면 미리보기가 표시됩니다.</div>
            </div>
          ) : previewLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#718096' }}>
              미리보기 로딩 중...
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 12, fontSize: 13, color: '#718096' }}>
                미리보기 — 실제 출력 결과와 다소 다를 수 있습니다.
              </div>
              <div
                ref={previewRef}
                style={{
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  minHeight: 400,
                  padding: selectedTemplate?.file_type === 'xlsx' ? 0 : 16,
                  overflow: 'auto',
                }}
              />
            </>
          )}
        </div>
      </div>
    </Layout>
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

  // ArrayBuffer 복사 (원본 보존)
  const copied = originalBuffer.slice(0);
  const zip = await JSZip.loadAsync(copied);

  // document.xml 플레이스홀더 치환
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
