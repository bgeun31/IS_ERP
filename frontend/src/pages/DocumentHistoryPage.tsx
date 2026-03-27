import React, { useEffect, useState } from 'react';
import { deleteRecord, getRecordFile, getRecords } from '../api/client';
import type { DocumentRecord } from '../types';
import Layout from '../components/Layout';

export default function DocumentHistoryPage() {
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailTarget, setDetailTarget] = useState<DocumentRecord | null>(null);

  const load = async () => {
    try {
      const res = await getRecords();
      setRecords(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDownload = async (record: DocumentRecord) => {
    try {
      const res = await getRecordFile(record.id);
      const ext = record.file_type || 'docx';
      const mime = ext === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const blob = new Blob([res.data as ArrayBuffer], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = record.original_filename || `${record.title}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('다운로드 실패');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('이 작업 기록을 삭제하시겠습니까?')) return;
    await deleteRecord(id);
    load();
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '-';
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <Layout title="작업 내역">
      <div style={{ marginBottom: 20 }}>
        <p className="text-muted text-sm">저장된 문서 작업 기록입니다. 파일을 다시 다운로드할 수 있습니다.</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#718096' }}>불러오는 중...</div>
      ) : records.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#718096' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div>작업 기록이 없습니다.</div>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>문서 제목</th>
                <th>템플릿</th>
                <th>형식</th>
                <th>크기</th>
                <th>작성자</th>
                <th>작성일</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3182ce', fontWeight: 500, padding: 0, textAlign: 'left' }}
                      onClick={() => setDetailTarget(r)}
                    >
                      {r.title}
                    </button>
                  </td>
                  <td className="text-sm">{r.template_name || '-'}</td>
                  <td>
                    {r.file_type && (
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                        background: r.file_type === 'docx' ? '#ebf8ff' : '#f0fff4',
                        color: r.file_type === 'docx' ? '#2b6cb0' : '#276749',
                      }}>
                        {r.file_type.toUpperCase()}
                      </span>
                    )}
                  </td>
                  <td className="text-sm">{formatSize(r.file_size)}</td>
                  <td className="text-sm">{r.created_by_username || '-'}</td>
                  <td className="text-sm">{formatDate(r.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => handleDownload(r)}>
                        다운로드
                      </button>
                      <button
                        className="btn"
                        style={{ padding: '4px 10px', fontSize: 12, background: '#fff5f5', color: '#c53030', border: '1px solid #fed7d7' }}
                        onClick={() => handleDelete(r.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 상세 모달 */}
      {detailTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: 480, maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: 4 }}>{detailTarget.title}</h3>
            <p className="text-muted text-sm" style={{ marginBottom: 20 }}>
              템플릿: {detailTarget.template_name || '-'} | {formatDate(detailTarget.created_at)}
            </p>

            <div style={{ marginBottom: 16 }}>
              <div className="form-label" style={{ marginBottom: 8 }}>입력된 필드값</div>
              {Object.keys(detailTarget.field_values).length === 0 ? (
                <span className="text-muted text-sm">없음</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(detailTarget.field_values).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', gap: 8, fontSize: 14 }}>
                      <span style={{ fontFamily: 'monospace', background: '#edf2f7', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                        {`{{${key}}}`}
                      </span>
                      <span style={{ color: '#2d3748' }}>{value || <em style={{ color: '#a0aec0' }}>비어있음</em>}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setDetailTarget(null)}>닫기</button>
              <button className="btn btn-primary" onClick={() => { handleDownload(detailTarget); setDetailTarget(null); }}>
                다운로드
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
