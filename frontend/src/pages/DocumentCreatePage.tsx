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
        <div style={{
          width: 340,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #e2e8f0',
          background: '#f8fafc',
          overflow: 'hidden',
        }}>
          {/* 스크롤 영역 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>

            {/* ── 섹션: 템플릿 선택 ── */}
            <SectionHeader icon="🗂️" title="템플릿 선택" />

            <select
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1.5px solid #cbd5e0',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                color: selectedId ? '#1a202c' : '#a0aec0',
                background: '#fff',
                outline: 'none',
                cursor: 'pointer',
                marginBottom: selectedTemplate ? 12 : 20,
                appearance: 'auto',
              }}
              value={selectedId}
              onChange={e => {
                setSavedRecordId(null);
                setSelectedId(e.target.value ? Number(e.target.value) : '');
              }}
            >
              <option value="">— 템플릿을 선택하세요 —</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  [{t.file_type.toUpperCase()}] {t.name}
                </option>
              ))}
            </select>

            {/* 선택된 템플릿 정보 카드 */}
            {selectedTemplate && (
              <div style={{
                background: '#fff',
                border: '1.5px solid #bee3f8',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ fontSize: 22 }}>{selectedTemplate.file_type === 'docx' ? '📄' : '📊'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1a202c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedTemplate.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                      background: selectedTemplate.file_type === 'docx' ? '#ebf8ff' : '#f0fff4',
                      color: selectedTemplate.file_type === 'docx' ? '#2b6cb0' : '#276749',
                    }}>
                      {selectedTemplate.file_type.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, color: '#718096' }}>
                      변수 {selectedTemplate.variables.length}개
                    </span>
                  </div>
                </div>
              </div>
            )}

            {selectedTemplate && (
              <>
                {/* ── 섹션: 변수 입력 ── */}
                {selectedTemplate.variables.length === 0 ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '12px 14px',
                    background: '#fffbea', border: '1px solid #f6e05e',
                    borderRadius: 8, fontSize: 13, color: '#744210',
                    marginBottom: 20,
                  }}>
                    <span>⚠️</span> 이 템플릿에는 변수가 없습니다.
                  </div>
                ) : (
                  <>
                    <SectionHeader
                      icon="✏️"
                      title="변수 입력"
                      badge={`${Object.values(fieldValues).filter(v => v.trim()).length} / ${selectedTemplate.variables.length}`}
                      hint="입력하면 미리보기가 실시간으로 반영됩니다"
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                      {selectedTemplate.variables.map(v => {
                        const val = fieldValues[v.key] ?? '';
                        const filled = val.trim().length > 0;
                        return (
                          <div key={v.key} style={{
                            background: '#fff',
                            border: `1.5px solid ${filled ? '#9ae6b4' : '#e2e8f0'}`,
                            borderRadius: 8,
                            padding: '10px 12px',
                            transition: 'border-color 0.2s',
                          }}>
                            {/* 라벨 행 */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#4a5568' }}>
                                {v.label}
                              </span>
                              <span style={{
                                fontSize: 11, fontFamily: 'monospace',
                                background: '#edf2f7', color: '#718096',
                                padding: '1px 6px', borderRadius: 4,
                              }}>
                                {`{{${v.key}}}`}
                              </span>
                            </div>
                            {/* 입력 행 */}
                            <div style={{ position: 'relative' }}>
                              <input
                                style={{
                                  width: '100%',
                                  padding: '7px 32px 7px 10px',
                                  border: '1.5px solid #e2e8f0',
                                  borderRadius: 6,
                                  fontSize: 13,
                                  outline: 'none',
                                  background: '#f8fafc',
                                  color: '#1a202c',
                                  transition: 'border-color 0.15s, box-shadow 0.15s',
                                }}
                                value={val}
                                onChange={e => handleFieldChange(v.key, e.target.value)}
                                placeholder={`${v.label} 입력`}
                                disabled={isLoading}
                                onFocus={e => { e.currentTarget.style.borderColor = '#3182ce'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(49,130,206,0.12)'; }}
                                onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
                              />
                              {filled && (
                                <span style={{
                                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                  color: '#38a169', fontSize: 14, fontWeight: 700,
                                }}>✓</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* ── 섹션: 저장 설정 ── */}
                <SectionHeader icon="💾" title="저장 설정" />
                <div style={{
                  background: '#fff',
                  border: `1.5px solid ${title.trim() ? '#9ae6b4' : '#e2e8f0'}`,
                  borderRadius: 8,
                  padding: '10px 12px',
                  marginBottom: 20,
                  transition: 'border-color 0.2s',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#4a5568', marginBottom: 6 }}>
                    문서 제목
                    <span style={{ marginLeft: 4, color: '#e53e3e' }}>*</span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      style={{
                        width: '100%',
                        padding: '7px 32px 7px 10px',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: 6,
                        fontSize: 13,
                        outline: 'none',
                        background: '#f8fafc',
                        color: '#1a202c',
                        transition: 'border-color 0.15s, box-shadow 0.15s',
                      }}
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="저장될 파일명 (확장자 제외)"
                      disabled={isLoading}
                      onFocus={e => { e.currentTarget.style.borderColor = '#3182ce'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(49,130,206,0.12)'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
                    />
                    {title.trim() && (
                      <span style={{
                        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                        color: '#38a169', fontSize: 14, fontWeight: 700,
                      }}>✓</span>
                    )}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: '#a0aec0' }}>
                    저장 파일명: {title.trim() ? `${title.trim()}.${selectedTemplate.file_type}` : `미입력.${selectedTemplate.file_type}`}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── 하단 고정: 액션 버튼 ── */}
          {selectedTemplate && (
            <div style={{
              flexShrink: 0,
              padding: '14px 20px',
              borderTop: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}>
              {saveError && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 12px', marginBottom: 10,
                  background: '#fff5f5', border: '1px solid #fed7d7',
                  borderRadius: 7, fontSize: 12, color: '#c53030',
                }}>
                  <span>⚠️</span> {saveError}
                </div>
              )}

              {savedRecordId ? (
                <>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px', marginBottom: 10,
                    background: '#f0fff4', border: '1px solid #9ae6b4',
                    borderRadius: 8, fontSize: 13, color: '#276749', fontWeight: 600,
                  }}>
                    <span>✅</span> 저장이 완료되었습니다.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      onClick={handleDownload}
                    >
                      ⬇ 다운로드
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ flex: 1 }}
                      onClick={() => {
                        setSavedRecordId(null);
                        setTitle('');
                        const init: Record<string, string> = {};
                        selectedTemplate.variables.forEach(v => { init[v.key] = ''; });
                        setFieldValues(init);
                      }}
                    >
                      새 문서 작성
                    </button>
                  </div>
                </>
              ) : (
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '11px 16px', fontSize: 14, justifyContent: 'center' }}
                  onClick={handleSave}
                  disabled={saving || !title.trim() || isLoading}
                >
                  {saving ? '⏳ 저장 중...' : '저장 및 다운로드'}
                </button>
              )}
            </div>
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
                    background: selectedTemplate?.file_type === 'xlsx' ? '#fff' : '#e8ecf0',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: selectedTemplate?.file_type === 'xlsx' ? 8 : 0,
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

// ── 섹션 헤더 컴포넌트 ────────────────────────────────────────────────────────

function SectionHeader({ icon, title, badge, hint }: { icon: string; title: string; badge?: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {title}
        </span>
        {badge && (
          <span style={{
            marginLeft: 2, fontSize: 11, fontWeight: 700,
            background: '#ebf8ff', color: '#2b6cb0',
            padding: '1px 7px', borderRadius: 20,
          }}>
            {badge}
          </span>
        )}
      </div>
      {hint && (
        <div style={{ marginTop: 3, fontSize: 11, color: '#a0aec0' }}>{hint}</div>
      )}
    </div>
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

  // 페이지 구분용 CSS — 중복 주입 방지
  if (!document.getElementById('docx-viewer-style')) {
    const style = document.createElement('style');
    style.id = 'docx-viewer-style';
    style.textContent = `
      .docx-viewer-wrap {
        background: #e8ecf0;
        padding: 24px 16px;
        min-height: 100%;
        box-sizing: border-box;
      }
      .docx-viewer-wrap .docx {
        background: #fff;
        box-shadow: 0 2px 12px rgba(0,0,0,0.18);
        margin: 0 auto 24px auto;
        box-sizing: border-box;
      }
      .docx-viewer-wrap .docx:last-child {
        margin-bottom: 0;
      }
    `;
    document.head.appendChild(style);
  }

  await renderAsync(blob, container, undefined, {
    className: 'docx-viewer-wrap',
    inWrapper: true,
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
  const xlsxModule = await import('xlsx');
  const XLSX = xlsxModule.default ?? xlsxModule;

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
