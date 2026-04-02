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
  const [imageFiles, setImageFiles] = useState<Record<string, File>>({});
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedRecordId, setSavedRecordId] = useState<number | null>(null);

  // 파일 로딩
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState<'idle' | 'downloading' | 'rendering' | 'done'>('idle');

  const [templateBuffer, setTemplateBuffer] = useState<ArrayBuffer | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // 항상 최신 값을 참조하는 refs
  const templateBufferRef = useRef<ArrayBuffer | null>(null);
  const selectedTemplateRef = useRef<DocumentTemplate | null>(null);
  const fieldValuesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    getTemplates().then(res => setTemplates(res.data));
  }, []);

  const selectedTemplate = templates.find(t => t.id === selectedId) ?? null;

  useEffect(() => { templateBufferRef.current = templateBuffer; }, [templateBuffer]);
  useEffect(() => { selectedTemplateRef.current = selectedTemplate; }, [selectedTemplate]);
  useEffect(() => { fieldValuesRef.current = fieldValues; }, [fieldValues]);

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

    const tmpl = templates.find(t => t.id === selectedId);
    if (tmpl) {
      const init: Record<string, string> = {};
      tmpl.variables.forEach(v => {
        if ((v.type ?? 'text') === 'text') init[v.key] = '';
      });
      setFieldValues(init);
      setImageFiles({});
    }

    api.get(`/documents/templates/${selectedId}/file`, {
      responseType: 'arraybuffer',
      onDownloadProgress: (event) => {
        if (event.total && event.total > 0) {
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

  const renderPreview = async (values: Record<string, string>) => {
    const buffer = templateBufferRef.current;
    const template = selectedTemplateRef.current;
    const container = previewRef.current;
    if (!buffer || !container || !template) return;
    try {
      if (template.file_type === 'docx') {
        await renderDocxPreview(buffer, values, container);
      } else {
        await renderXlsxPreview(buffer, values, container);
      }
    } catch (e) {
      console.error('미리보기 렌더링 오류:', e);
    }
  };

  // ── 버퍼 로드 완료 → 초기 렌더링 ──────────────────────────────────────────
  useEffect(() => {
    if (!templateBuffer || !selectedTemplate) return;
    setLoadingStage('rendering');
    setLoadingProgress(80);

    renderPreview({}).then(() => {
      setLoadingProgress(100);
      setLoadingStage('done');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateBuffer]);

  const handleFieldChange = (key: string, value: string) => {
    const newValues = { ...fieldValuesRef.current, [key]: value };
    fieldValuesRef.current = newValues;
    setFieldValues(newValues);

    // 파일명에 변수가 포함된 경우 제목 자동 완성
    const tmpl = selectedTemplateRef.current;
    if (tmpl) {
      const baseName = tmpl.original_filename.replace(/\.[^.]+$/, '');
      if (baseName.includes('{{')) {
        const autoTitle = baseName.replace(/\{\{([^{}]+)\}\}/g, (_, k) => newValues[k.trim()] || `{{${k}}}`);
        setTitle(autoTitle);
      }
    }

    if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
    renderTimerRef.current = setTimeout(() => {
      renderPreview(fieldValuesRef.current);
    }, 150);
  };

  const handleImageChange = (key: string, file: File | null) => {
    setImageFiles(prev => {
      const next = { ...prev };
      if (file) {
        next[key] = file;
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedId || !title.trim()) return;
    setSaving(true);
    setSaveError('');
    setSavedRecordId(null);
    try {
      const fd = new FormData();
      fd.append('template_id', String(selectedId));
      fd.append('title', title.trim());
      fd.append('field_values', JSON.stringify(fieldValues));
      for (const [key, file] of Object.entries(imageFiles)) {
        fd.append(`img__${key}`, file);
      }
      const res = await createRecord(fd);
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

  const filledCount =
    Object.values(fieldValues).filter(v => v.trim()).length +
    Object.keys(imageFiles).length;

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
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>

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
                      badge={`${filledCount} / ${selectedTemplate.variables.length}`}
                      hint="입력하면 미리보기가 실시간으로 반영됩니다"
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                      {selectedTemplate.variables.map(v => {
                        const isImage = (v.type ?? 'text') === 'image';
                        const val = isImage ? '' : (fieldValues[v.key] ?? '');
                        const imageFile = isImage ? imageFiles[v.key] : undefined;
                        const filled = isImage ? !!imageFile : val.trim().length > 0;

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
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#4a5568' }}>
                                  {v.label}
                                </span>
                                {isImage && (
                                  <span style={{
                                    fontSize: 10, fontWeight: 600,
                                    background: '#fef3c7', color: '#92400e',
                                    padding: '1px 5px', borderRadius: 4,
                                  }}>
                                    이미지
                                  </span>
                                )}
                              </div>
                              <span style={{
                                fontSize: 11, fontFamily: 'monospace',
                                background: '#edf2f7', color: '#718096',
                                padding: '1px 6px', borderRadius: 4,
                              }}>
                                {`{{${v.key}}}`}
                              </span>
                            </div>

                            {/* 입력 영역 */}
                            {isImage ? (
                              <div>
                                <input
                                  ref={el => { imageInputRefs.current[v.key] = el; }}
                                  type="file"
                                  accept="image/*"
                                  style={{ display: 'none' }}
                                  disabled={isLoading}
                                  onChange={e => handleImageChange(v.key, e.target.files?.[0] ?? null)}
                                />
                                <div
                                  onClick={() => !isLoading && imageInputRefs.current[v.key]?.click()}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '7px 10px',
                                    border: `1.5px dashed ${imageFile ? '#9ae6b4' : '#cbd5e0'}`,
                                    borderRadius: 6,
                                    cursor: isLoading ? 'default' : 'pointer',
                                    background: imageFile ? '#f0fff4' : '#f8fafc',
                                    fontSize: 12,
                                    color: imageFile ? '#276749' : '#a0aec0',
                                    transition: 'all 0.15s',
                                  }}
                                >
                                  <span style={{ fontSize: 16 }}>{imageFile ? '🖼️' : '📁'}</span>
                                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {imageFile ? imageFile.name : '클릭하여 이미지 선택'}
                                  </span>
                                  {imageFile && (
                                    <span
                                      onClick={e => { e.stopPropagation(); handleImageChange(v.key, null); }}
                                      style={{ color: '#e53e3e', fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}
                                    >✕</span>
                                  )}
                                </div>
                                {imageFile && <ImagePreview file={imageFile} />}
                                <div style={{ marginTop: 4, fontSize: 11, color: '#a0aec0' }}>
                                  출력 크기: {v.img_width}×{v.img_height}{v.img_unit ?? 'mm'}
                                </div>
                              </div>
                            ) : (
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
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* ── 섹션: 저장 설정 ── */}
                {(() => {
                  const baseName = selectedTemplate.original_filename.replace(/\.[^.]+$/, '');
                  const isAutoTitle = baseName.includes('{{');
                  return (
                    <SectionHeader
                      icon="💾"
                      title="저장 설정"
                      hint={isAutoTitle ? '변수 입력 시 제목이 자동으로 완성됩니다' : undefined}
                    />
                  );
                })()}
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
                        selectedTemplate.variables.forEach(v => {
                          if ((v.type ?? 'text') === 'text') init[v.key] = '';
                        });
                        setFieldValues(init);
                        setImageFiles({});
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#a0aec0' }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>📄</div>
              <div>왼쪽에서 템플릿을 선택하면 미리보기가 표시됩니다.</div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 12, fontSize: 13, color: '#718096', flexShrink: 0 }}>
                미리보기 — 실제 출력 결과와 다소 다를 수 있습니다. 이미지는 다운로드 파일에서 확인하세요.
              </div>

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
                    <div style={{ fontSize: 40 }}>
                      {loadingStage === 'downloading' ? '⬇️' : '⚙️'}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#2d3748' }}>
                      {loadingLabel}
                    </div>
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
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                      <StepDot label="다운로드" active={loadingStage === 'downloading'} done={loadingStage === 'rendering'} />
                      <div style={{ width: 24, height: 1, background: '#cbd5e0' }} />
                      <StepDot label="렌더링" active={loadingStage === 'rendering'} done={false} />
                    </div>
                  </div>
                )}

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

// ── 이미지 썸네일 (object URL 생명주기 관리) ────────────────────────────────────

function ImagePreview({ file }: { file: File }) {
  const [url, setUrl] = React.useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  if (!url) return null;
  return (
    <img
      src={url}
      alt="preview"
      style={{
        marginTop: 6,
        width: '100%',
        maxHeight: 100,
        objectFit: 'contain',
        borderRadius: 4,
        border: '1px solid #e2e8f0',
      }}
    />
  );
}

// ── Word 미리보기 ──────────────────────────────────────────────────────────────

async function renderDocxPreview(
  originalBuffer: ArrayBuffer,
  values: Record<string, string>,
  container: HTMLElement
) {
  const jszipModule = await import('jszip');
  const JSZip = jszipModule.default ?? jszipModule;
  const { renderAsync } = await import('docx-preview');

  const zip = await JSZip.loadAsync(originalBuffer.slice(0));

  const xmlFile = zip.file('word/document.xml');
  if (xmlFile) {
    let xml = await xmlFile.async('string');
    // Word가 플레이스홀더를 여러 run으로 분리하는 경우 먼저 병합
    xml = mergeDocxRuns(xml);
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

  const wb = XLSX.read(new Uint8Array(originalBuffer.slice(0)), { type: 'array' });

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
          delete cell.h;
          delete cell.r;
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

// ── DOCX run 병합 ──────────────────────────────────────────────────────────────
// Word는 {{변수명}}을 여러 <w:r> run으로 분리해 저장하는 경우가 있음.
// 같은 단락 내 연속된 run의 텍스트를 합쳐서 플레이스홀더를 복원한다.
function mergeDocxRuns(xml: string): string {
  // <w:p> 단락 단위로 처리
  return xml.replace(/(<w:p[ >][\s\S]*?<\/w:p>)/g, (para) => {
    // run 전체를 텍스트로 합친 뒤, {{...}} 가 걸쳐있으면 단락 내 텍스트를 재구성
    const runPattern = /(<w:r[ >][\s\S]*?<\/w:r>)/g;
    const runs = [...para.matchAll(runPattern)].map(m => m[1]);
    if (runs.length === 0) return para;

    // run에서 <w:t> 텍스트만 추출
    const getText = (run: string) => {
      const m = run.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/);
      return m ? m[1] : '';
    };

    const combined = runs.map(getText).join('');
    // 플레이스홀더가 분리됐을 가능성이 있을 때만 처리
    if (!combined.includes('{{') && !combined.includes('}}')) return para;

    // 첫 번째 run의 서식을 기준 run으로 사용하고, 텍스트 전체를 하나의 <w:t>로 합침
    const firstRun = runs[0];
    const rPrMatch = firstRun.match(/(<w:rPr[\s\S]*?<\/w:rPr>)/);
    const rPr = rPrMatch ? rPrMatch[1] : '';
    const mergedRun = `<w:r>${rPr}<w:t xml:space="preserve">${combined}</w:t></w:r>`;

    // 단락에서 기존 run들을 병합된 run 하나로 교체
    let result = para;
    // 모든 run을 제거하고 첫 run 위치에 병합 run 삽입
    const firstRunIndex = result.indexOf(runs[0]);
    const lastRun = runs[runs.length - 1];
    const lastRunEnd = result.indexOf(lastRun) + lastRun.length;
    result = result.slice(0, firstRunIndex) + mergedRun + result.slice(lastRunEnd);
    return result;
  });
}
