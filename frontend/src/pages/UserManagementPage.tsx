import { useEffect, useState } from 'react';
import { createUser, deleteUser, getUsers, updateUser } from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import type { User } from '../types';

export default function UserManagementPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);

  // Form state
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formIsAdmin, setFormIsAdmin] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    getUsers().then((res) => setUsers(res.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditUser(null);
    setFormUsername('');
    setFormPassword('');
    setFormIsAdmin(false);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setFormUsername(u.username);
    setFormPassword('');
    setFormIsAdmin(u.is_admin);
    setFormError('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      if (editUser) {
        const body: { password?: string; is_admin?: boolean } = { is_admin: formIsAdmin };
        if (formPassword) body.password = formPassword;
        await updateUser(editUser.id, body);
      } else {
        if (!formPassword) { setFormError('비밀번호를 입력해주세요.'); setSubmitting(false); return; }
        await createUser({ username: formUsername, password: formPassword, is_admin: formIsAdmin });
      }
      setShowModal(false);
      load();
    } catch (err: any) {
      setFormError(err.response?.data?.detail || '오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (u: User) => {
    if (!confirm(`"${u.username}" 사용자를 삭제하시겠습니까?`)) return;
    try {
      await deleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (err: any) {
      alert(err.response?.data?.detail || '삭제 실패');
    }
  };

  return (
    <Layout title="사용자 관리">
      <div className="card">
        <div className="page-header" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>사용자 목록</div>
          <button className="btn btn-primary" onClick={openCreate}>+ 사용자 추가</button>
        </div>

        {loading && <div className="loading-box">불러오는 중...</div>}

        {!loading && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>아이디</th>
                  <th>권한</th>
                  <th>생성일</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.username}</strong>{u.id === me?.id && <span className="badge badge-blue" style={{ marginLeft: 8 }}>나</span>}</td>
                    <td>
                      <span className={`badge ${u.is_admin ? 'badge-orange' : 'badge-gray'}`}>
                        {u.is_admin ? '관리자' : '일반 사용자'}
                      </span>
                    </td>
                    <td className="text-muted text-sm">{new Date(u.created_at).toLocaleString('ko-KR')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(u)}>수정</button>
                        {u.id !== me?.id && (
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u)}>삭제</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{editUser ? '사용자 수정' : '사용자 추가'}</div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">아이디</label>
                <input
                  className="form-input"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  disabled={!!editUser}
                  required={!editUser}
                  placeholder="아이디 입력"
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  비밀번호 {editUser && <span className="text-muted">(변경 시에만 입력)</span>}
                </label>
                <input
                  className="form-input"
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder={editUser ? '변경할 비밀번호 입력 (선택)' : '비밀번호 입력'}
                />
              </div>
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formIsAdmin}
                    onChange={(e) => setFormIsAdmin(e.target.checked)}
                  />
                  관리자 권한 부여
                </label>
              </div>
              {formError && <p className="form-error">{formError}</p>}
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>취소</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
