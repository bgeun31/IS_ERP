import { useEffect, useState } from 'react';
import { deleteLog, getLogs } from '../api/client';
import Layout from '../components/Layout';
import type { LogFile } from '../types';

function formatBytes(bytes: number | null) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function LogListPage() {
  const now = new Date();
  const [logs, setLogs] = useState<LogFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState<number | ''>('');
  const [filterMonth, setFilterMonth] = useState<number | ''>('');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    getLogs(filterYear || undefined, filterMonth || undefined)
      .then((res) => setLogs(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filterYear, filterMonth]);

  const handleDelete = async (id: number, filename: string) => {
    if (!confirm(`"${filename}" 로그를 삭제하시겠습니까?\n관련 장비 스냅샷도 함께 삭제됩니다.`)) return;
    setDeleting(id);
    try {
      await deleteLog(id);
      setLogs((prev) => prev.filter((l) => l.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  const filtered = logs.filter(
    (l) =>
      l.device_name.toLowerCase().includes(search.toLowerCase()) ||
      l.original_filename.toLowerCase().includes(search.toLowerCase())
  );

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <Layout title="로그 목록">
      <div className="card">
        <div className="page-header" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>업로드된 로그 파일</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="form-select" style={{ width: 100 }} value={filterYear} onChange={(e) => setFilterYear(e.target.value ? Number(e.target.value) : '')}>
              <option value="">전체 연도</option>
              {years.map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select className="form-select" style={{ width: 90 }} value={filterMonth} onChange={(e) => setFilterMonth(e.target.value ? Number(e.target.value) : '')}>
              <option value="">전체 월</option>
              {months.map((m) => <option key={m} value={m}>{m}월</option>)}
            </select>
            <input className="search-input" placeholder="장비명, 파일명 검색..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {loading && <div className="loading-box">불러오는 중...</div>}

        {!loading && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>장비명</th>
                  <th>파일명</th>
                  <th>기준월</th>
                  <th>파일 크기</th>
                  <th>업로드 시각</th>
                  <th>업로드 사용자</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="empty-box">로그 파일이 없습니다.</td></tr>
                )}
                {filtered.map((l) => (
                  <tr key={l.id}>
                    <td><strong>{l.device_name}</strong></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{l.original_filename}</td>
                    <td>{l.log_year}-{String(l.log_month).padStart(2, '0')}</td>
                    <td className="text-muted text-sm">{formatBytes(l.file_size)}</td>
                    <td className="text-muted text-sm">{new Date(l.uploaded_at).toLocaleString('ko-KR')}</td>
                    <td className="text-muted text-sm">{l.uploaded_by_username ?? '-'}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(l.id, l.original_filename)}
                        disabled={deleting === l.id}
                      >
                        {deleting === l.id ? '...' : '삭제'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
