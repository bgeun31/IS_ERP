import { useCallback, useRef, useState } from 'react';
import { uploadLogs } from '../api/client';
import Layout from '../components/Layout';
import type { UploadResponse } from '../types';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function LogUploadPage() {
  const now = new Date();
  const [logYear, setLogYear] = useState(now.getFullYear());
  const [logMonth, setLogMonth] = useState(now.getMonth() + 1);
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    const logFiles = Array.from(newFiles).filter((f) => f.name.endsWith('.log'));
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...logFiles.filter((f) => !names.has(f.name))];
    });
    setResult(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleUpload = async () => {
    if (files.length === 0) { setError('업로드할 파일을 선택해주세요.'); return; }
    setError('');
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      formData.append('log_year', String(logYear));
      formData.append('log_month', String(logMonth));
      const res = await uploadLogs(formData);
      setResult(res.data);
      setFiles([]);
    } catch (e: any) {
      setError(e.response?.data?.detail || '업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const years = Array.from({ length: 10 }, (_, i) => now.getFullYear() - 2 + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <Layout title="로그 업로드">
      <div style={{ maxWidth: 700 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>로그 파일 업로드</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={uploading || files.length === 0}
              >
                {uploading ? '업로드 중...' : `업로드 (${files.length}개 파일)`}
              </button>
              {files.length > 0 && (
                <button className="btn btn-secondary" onClick={() => setFiles([])}>
                  전체 제거
                </button>
              )}
            </div>
          </div>

          {/* 기준월 선택 */}
          <div className="form-row" style={{ marginBottom: 20 }}>
            <div className="form-group" style={{ flex: '0 0 auto', minWidth: 120 }}>
              <label className="form-label">로그 기준 연도</label>
              <select className="form-select" value={logYear} onChange={(e) => setLogYear(Number(e.target.value))}>
                {years.map((y) => <option key={y} value={y}>{y}년</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: '0 0 auto', minWidth: 100 }}>
              <label className="form-label">로그 기준 월</label>
              <select className="form-select" value={logMonth} onChange={(e) => setLogMonth(Number(e.target.value))}>
                {months.map((m) => <option key={m} value={m}>{m}월</option>)}
              </select>
            </div>
          </div>

          {/* 드롭존 */}
          <div
            className={`drop-zone${dragOver ? ' drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="drop-icon">📂</div>
            <p><strong>클릭하거나 파일을 여기에 드래그하세요</strong></p>
            <p style={{ marginTop: 4, fontSize: 12 }}>.log 파일만 지원됩니다 (여러 파일 동시 업로드 가능)</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".log"
            style={{ display: 'none' }}
            onChange={(e) => addFiles(e.target.files)}
          />

          {/* 선택된 파일 목록 */}
          {files.length > 0 && (
            <div className="file-list">
              {files.map((f, i) => (
                <div key={i} className="file-item">
                  <div>
                    <div className="file-item-name">📄 {f.name}</div>
                    <div className="file-item-size">{formatBytes(f.size)}</div>
                  </div>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="form-error" style={{ marginTop: 12 }}>{error}</p>}
        </div>

        {/* 업로드 결과 */}
        {result && (
          <div className="card">
            <div className="card-title">
              업로드 결과 — 성공 {result.success_count}개 / 실패 {result.error_count}개
            </div>
            <div className="upload-result">
              {result.results.map((r, i) => (
                <div key={i} className={`result-item ${r.success ? 'success' : 'error'}`}>
                  <span style={{ fontSize: 16 }}>{r.success ? '✅' : '❌'}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{r.filename}</div>
                    {r.success
                      ? <div style={{ fontSize: 12, color: '#276749' }}>장비: {r.device_name} — 파싱 및 저장 완료</div>
                      : <div style={{ fontSize: 12, color: '#9b2c2c' }}>{r.error}</div>
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
