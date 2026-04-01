import React, { useEffect, useRef, useState } from 'react';
import { createTemplate, deleteTemplate, getTemplates, updateTemplate } from '../api/client';
import type { DocumentTemplate, DocumentVariable } from '../types';
import Layout from '../components/Layout';

export default function DocumentTemplatePage() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // 업로드 모달
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 변수 레이블 편집 모달
  const [editTarget, setEditTarget] = useState<DocumentTemplate | null>(null);
  const [editVars, setEditVars] = useState<DocumentVariable[]>([]);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // 검색
  const [searchQuery, setSearchQuery] = useState('');

  const load = async () => {
    try {
      const res = await getTemplates();
      setTemplates(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async () => {
    if (!uploadFile || !uploadName.trim()) return;
    setUploading(true);
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('name', uploadName.trim());
      fd.append('description', uploadDesc.trim());
      await createTemplate(fd);
      setShowUpload(false);
      setUploadName('');
      setUploadDesc('');
      setUploadFile(null);
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setUploadError(err.response?.data?.detail || '업로드 실패');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('템플릿을 삭제하면 관련 작업 기록도 모두 삭제됩니다. 삭제하시겠습니까?')) return;
    await deleteTemplate(id);
    load();
  };

  const openEdit = (t: DocumentTemplate) => {
    setEditTarget(t);
    setEditName(t.name);
    setEditDesc(t.description || '');
    setEditVars(t.variables.map(v => ({ ...v })));
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      await updateTemplate(editTarget.id, {
        name: editName.trim(),
        description: editDesc.trim(),
        variables: editVars,
      });
      setEditTarget(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const filteredTemplates = templates.filter(t => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      t.original_filename.toLowerCase().includes(q) ||
      t.file_type.toLowerCase().includes(q) ||
      (t.created_by_username || '').toLowerCase().includes(q)
    );
  });

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '-';
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <Layout title="템플릿 관리">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <p className="text-muted text-sm">
          Word(.docx) 또는 Excel(.xlsx) 파일에 <code style={{ background: '#edf2f7', padding: '2px 6px', borderRadius: 4 }}>{'{{변수명}}'}</code> 형식으로 플레이스홀더를 작성하여 업로드하세요.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="search-input"
            placeholder="템플릿명, 파일명, 등록자 검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => setShowUpload(true)}>+ 템플릿 업로드</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#718096' }}>불러오는 중...</div>
      ) : templates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#718096' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
          <div>등록된 템플릿이 없습니다.</div>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>템플릿명</th>
                <th>파일 형식</th>
                <th>파일명</th>
                <th>변수</th>
                <th>크기</th>
                <th>등록자</th>
                <th>등록일</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredTemplates.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#718096' }}>
                    검색 결과가 없습니다.
                  </td>
                </tr>
              ) : filteredTemplates.map(t => (
                <tr key={t.id}>
                  <td><strong>{t.name}</strong>{t.description && <div className="text-muted text-sm">{t.description}</div>}</td>
                  <td>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                      background: t.file_type === 'docx' ? '#ebf8ff' : '#f0fff4',
                      color: t.file_type === 'docx' ? '#2b6cb0' : '#276749',
                    }}>
                      {t.file_type.toUpperCase()}
                    </span>
                  </td>
                  <td className="text-sm text-muted">{t.original_filename}</td>
                  <td>
                    {t.variables.length === 0 ? (
                      <span className="text-muted text-sm">없음</span>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {t.variables.map(v => (
                          <span key={v.key} style={{
                            background: (v.type ?? 'text') === 'image' ? '#fef3c7' : '#edf2f7',
                            borderRadius: 4, padding: '2px 6px', fontSize: 11,
                            color: (v.type ?? 'text') === 'image' ? '#92400e' : undefined,
                          }}>
                            {(v.type ?? 'text') === 'image' ? '🖼️ ' : ''}
                            {v.label !== v.key ? `${v.label} ({{${v.key}}})` : `{{${v.key}}}`}
                            {(v.type ?? 'text') === 'image' && v.img_width ? ` ${v.img_width}×${v.img_height}${v.img_unit ?? 'mm'}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="text-sm">{formatSize(t.file_size)}</td>
                  <td className="text-sm">{t.created_by_username || '-'}</td>
                  <td className="text-sm">{new Date(t.created_at).toLocaleDateString('ko-KR')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => openEdit(t)}>편집</button>
                      <button className="btn" style={{ padding: '4px 10px', fontSize: 12, background: '#fff5f5', color: '#c53030', border: '1px solid #fed7d7' }} onClick={() => handleDelete(t.id)}>삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 업로드 모달 */}
      {showUpload && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: 480, maxWidth: '90vw' }}>
            <h3 style={{ marginBottom: 20 }}>템플릿 업로드</h3>

            <div className="form-group">
              <label className="form-label">템플릿명 *</label>
              <input className="form-control" value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="예: 장비 점검 보고서" />
            </div>
            <div className="form-group">
              <label className="form-label">설명</label>
              <input className="form-control" value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} placeholder="선택 입력" />
            </div>
            <div className="form-group">
              <label className="form-label">파일 선택 * (.docx 또는 .xlsx)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.xlsx"
                style={{ display: 'none' }}
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
              />
              <div
                style={{ border: '2px dashed #cbd5e0', borderRadius: 8, padding: '20px', textAlign: 'center', cursor: 'pointer', background: '#f7fafc' }}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadFile ? (
                  <span style={{ color: '#2d3748' }}>{uploadFile.name}</span>
                ) : (
                  <span className="text-muted">클릭하여 파일 선택</span>
                )}
              </div>
            </div>

            {uploadError && <div style={{ color: '#c53030', marginBottom: 12, fontSize: 14 }}>{uploadError}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setShowUpload(false); setUploadError(''); }}>취소</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={uploading || !uploadFile || !uploadName.trim()}>
                {uploading ? '업로드 중...' : '업로드'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 편집 모달 */}
      {editTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: 520, maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: 20 }}>템플릿 편집</h3>

            <div className="form-group">
              <label className="form-label">템플릿명</label>
              <input className="form-control" value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">설명</label>
              <input className="form-control" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
            </div>

            {editVars.length > 0 && (
              <div className="form-group">
                <label className="form-label">변수 설정</label>
                <p className="text-muted text-sm" style={{ marginBottom: 8 }}>
                  레이블과 타입을 지정하세요. 이미지 타입은 출력 크기(mm)를 입력하세요.
                </p>
                {editVars.map((v, i) => {
                  const isImage = (v.type ?? 'text') === 'image';
                  const update = (patch: Partial<typeof v>) => {
                    const next = [...editVars];
                    next[i] = { ...next[i], ...patch };
                    setEditVars(next);
                  };
                  return (
                    <div key={v.key} style={{
                      marginBottom: 10, padding: '10px 12px',
                      border: `1.5px solid ${isImage ? '#fbd38d' : '#e2e8f0'}`,
                      borderRadius: 8, background: isImage ? '#fffbeb' : '#fafafa',
                    }}>
                      {/* 첫째 줄: 키 + 레이블 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isImage ? 8 : 0 }}>
                        <span style={{
                          fontSize: 12, fontFamily: 'monospace',
                          background: '#edf2f7', color: '#4a5568',
                          padding: '3px 7px', borderRadius: 4, flexShrink: 0,
                        }}>
                          {`{{${v.key}}}`}
                        </span>
                        <input
                          className="form-control"
                          style={{ flex: 1 }}
                          placeholder="레이블"
                          value={v.label}
                          onChange={e => update({ label: e.target.value })}
                        />
                        {/* 타입 토글 */}
                        <select
                          style={{
                            padding: '5px 8px', fontSize: 12, borderRadius: 6,
                            border: '1.5px solid #cbd5e0', background: '#fff',
                            color: isImage ? '#92400e' : '#4a5568',
                            flexShrink: 0,
                          }}
                          value={v.type ?? 'text'}
                          onChange={e => update({
                            type: e.target.value as 'text' | 'image',
                            img_width: e.target.value === 'image' ? (v.img_width ?? 100) : null,
                            img_height: e.target.value === 'image' ? (v.img_height ?? 80) : null,
                          })}
                        >
                          <option value="text">텍스트</option>
                          <option value="image">이미지</option>
                        </select>
                      </div>
                      {/* 이미지 크기 입력 */}
                      {isImage && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 2 }}>
                          <span style={{ fontSize: 11, color: '#718096', flexShrink: 0 }}>너비</span>
                          <input
                            type="number" min={0.1} step="any"
                            style={{
                              width: 72, padding: '4px 6px', fontSize: 12,
                              border: '1.5px solid #cbd5e0', borderRadius: 5,
                              textAlign: 'center',
                            }}
                            value={v.img_width ?? ''}
                            onChange={e => update({ img_width: e.target.value === '' ? null : parseFloat(e.target.value) })}
                          />
                          <span style={{ fontSize: 11, color: '#a0aec0' }}>× 높이</span>
                          <input
                            type="number" min={0.1} step="any"
                            style={{
                              width: 72, padding: '4px 6px', fontSize: 12,
                              border: '1.5px solid #cbd5e0', borderRadius: 5,
                              textAlign: 'center',
                            }}
                            value={v.img_height ?? ''}
                            onChange={e => update({ img_height: e.target.value === '' ? null : parseFloat(e.target.value) })}
                          />
                          <select
                            style={{
                              padding: '4px 6px', fontSize: 12, borderRadius: 5,
                              border: '1.5px solid #cbd5e0', background: '#fff',
                            }}
                            value={v.img_unit ?? 'mm'}
                            onChange={e => update({ img_unit: e.target.value as 'mm' | 'cm' })}
                          >
                            <option value="mm">mm</option>
                            <option value="cm">cm</option>
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEditTarget(null)}>취소</button>
              <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
