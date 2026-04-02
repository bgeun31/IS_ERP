import React, { useEffect, useState } from 'react';
import { extractBundlePurchaseOrder, generateBundle, getBundles, getUserDirectory } from '../api/client';
import type {
  BundlePurchaseOrderExtractResult,
  BundleVariable,
  TemplateBundle,
  TemplateBundleItem,
  UserDirectoryEntry,
} from '../types';
import Layout from '../components/Layout';

const SECTION_META: Record<string, { icon: string; title: string }> = {
  '발주정보': { icon: '📋', title: '발주 정보' },
  '장비정보': { icon: '🖥️', title: '장비 정보' },
  '납품검수': { icon: '📦', title: '납품 / 검수 정보' },
  '유지보수': { icon: '🔧', title: '유지보수' },
  'IDC출입': { icon: '🚪', title: 'IDC 출입 인원' },
};

type AccessPerson = {
  id: number;
  company: string;
  name: string;
  position: string;
  contact: string;
};

type SerialEntry = {
  id: number;
  value: string;
};

export default function InfraSecurityBundlePage() {
  const [bundle, setBundle] = useState<TemplateBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [purchaseOrderFile, setPurchaseOrderFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractResult, setExtractResult] = useState<BundlePurchaseOrderExtractResult | null>(null);
  const [autoFilledKeys, setAutoFilledKeys] = useState<Set<string>>(new Set());
  const [serialEntries, setSerialEntries] = useState<SerialEntry[]>([createEmptySerialEntry(1)]);
  const [accessPeople, setAccessPeople] = useState<AccessPerson[]>([createEmptyAccessPerson(1)]);
  const [favoriteUsers, setFavoriteUsers] = useState<UserDirectoryEntry[]>([]);
  const [selectedFavoriteUserId, setSelectedFavoriteUserId] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getUserDirectory().then(res => setFavoriteUsers(res.data)).catch(() => setFavoriteUsers([]));
  }, []);

  useEffect(() => {
    getBundles()
      .then(res => {
        const infra = res.data.find(b => b.name === '인프라보안 전용 템플릿');
        if (infra) {
          setBundle(infra);
          const init: Record<string, string> = {};
          infra.variables
            .filter((v: BundleVariable) => v.section !== 'IDC출입')
            .forEach((v: BundleVariable) => { init[v.key] = ''; });
          setFieldValues(init);
          setSerialEntries([createEmptySerialEntry(1)]);
          setAccessPeople([createEmptyAccessPerson(1)]);
          setSelectedItems(new Set(infra.items.map((it: TemplateBundleItem) => it.id)));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const desiredCount = parseQuantity(fieldValues['수량']);
    setSerialEntries(prev => syncSerialEntries(prev, desiredCount));
  }, [fieldValues['수량']]);

  const handleFieldChange = (key: string, value: string) => {
    setFieldValues(prev => ({ ...prev, [key]: value }));
  };

  const handleAccessPersonChange = (id: number, key: keyof Omit<AccessPerson, 'id'>, value: string) => {
    setAccessPeople(prev => prev.map(person => (person.id === id ? { ...person, [key]: value } : person)));
  };

  const handleSerialChange = (id: number, value: string) => {
    setSerialEntries(prev => prev.map(entry => (entry.id === id ? { ...entry, value } : entry)));
  };

  const handleAddAccessPerson = () => {
    setAccessPeople(prev => [...prev, createEmptyAccessPerson(nextAccessPersonId(prev))]);
  };

  const handleRemoveAccessPerson = (id: number) => {
    setAccessPeople(prev => (prev.length === 1 ? prev : prev.filter(person => person.id !== id)));
  };

  const handleAddFavoriteUser = () => {
    const selected = favoriteUsers.find(user => String(user.id) === selectedFavoriteUserId);
    if (!selected) return;
    const nextPerson = {
      id: 0,
      company: fieldValues['공급사_약칭'] || fieldValues['공급사'] || '',
      name: selected.full_name || selected.username,
      position: selected.position || '',
      contact: selected.phone_number || '',
    };
    setAccessPeople(prev => {
      if (
        prev.length === 1 &&
        !prev[0].company.trim() &&
        !prev[0].name.trim() &&
        !prev[0].position.trim() &&
        !prev[0].contact.trim()
      ) {
        return [{ ...nextPerson, id: prev[0].id }];
      }
      return [...prev, { ...nextPerson, id: nextAccessPersonId(prev) }];
    });
  };

  const handlePurchaseOrderExtract = async () => {
    if (!bundle || !purchaseOrderFile) return;

    setExtracting(true);
    setExtractError('');

    try {
      const formData = new FormData();
      formData.append('file', purchaseOrderFile);

      const res = await extractBundlePurchaseOrder(bundle.id, formData);
      const nextAutoFilled = new Set<string>();

      setFieldValues(prev => {
        const next = { ...prev };
        Object.entries(res.data.field_values).forEach(([key, value]) => {
          if (!value?.trim()) return;
          next[key] = value;
          nextAutoFilled.add(key);
        });
        return next;
      });

      setAutoFilledKeys(nextAutoFilled);
      setExtractResult(res.data);
    } catch (e: any) {
      setExtractError(e.response?.data?.detail || '발주서 추출 중 오류가 발생했습니다.');
    } finally {
      setExtracting(false);
    }
  };

  const toggleItem = (id: number) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!bundle) return;
    if (selectedItems.size === bundle.items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(bundle.items.map(it => it.id)));
    }
  };

  const nonIdcVariables = bundle?.variables.filter(v => v.section !== 'IDC출입') ?? [];
  const filledBaseCount = nonIdcVariables.reduce((count, variable) => {
    if (variable.key === '시리얼번호') {
      return count + serialEntries.filter(entry => entry.value.trim()).length;
    }
    return count + ((fieldValues[variable.key] || '').trim() ? 1 : 0);
  }, 0);
  const filledAccessCount = accessPeople.reduce(
    (count, person) => count + ['company', 'name', 'position', 'contact'].filter(key => person[key as keyof Omit<AccessPerson, 'id'>].trim()).length,
    0,
  );
  const filledCount = filledBaseCount + filledAccessCount;
  const totalBaseCount = nonIdcVariables.reduce((count, variable) => (
    count + (variable.key === '시리얼번호' ? serialEntries.length : 1)
  ), 0);
  const totalCount = totalBaseCount + accessPeople.length * 4;

  const handleGenerate = async () => {
    if (!bundle) return;
    setGenerating(true);
    setError('');
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append('field_values', JSON.stringify(buildSubmissionFieldValues(fieldValues, accessPeople, serialEntries)));
      formData.append('selected_items', JSON.stringify([...selectedItems]));

      const res = await generateBundle(bundle.id, formData);
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (fieldValues['발주명'] || bundle.name).replace(/[\\/*?:"<>|]/g, '_');
      a.href = url;
      a.download = `${safeName}_문서일괄.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSuccess(true);
    } catch (e: any) {
      setError(e.response?.data?.detail || '문서 생성 중 오류가 발생했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  const handleReset = () => {
    if (!bundle) return;
    const init: Record<string, string> = {};
    bundle.variables
      .filter(v => v.section !== 'IDC출입')
      .forEach(v => { init[v.key] = ''; });
    setFieldValues(init);
    setPurchaseOrderFile(null);
    setExtractError('');
    setExtractResult(null);
    setAutoFilledKeys(new Set());
    setSerialEntries([createEmptySerialEntry(1)]);
    setAccessPeople([createEmptyAccessPerson(1)]);
    setSelectedItems(new Set(bundle.items.map(it => it.id)));
    setSuccess(false);
    setError('');
  };

  if (loading) {
    return (
      <Layout title="인프라보안 전용 템플릿">
        <div style={{ padding: 60, textAlign: 'center', color: '#718096' }}>로딩 중...</div>
      </Layout>
    );
  }

  if (!bundle) {
    return (
      <Layout title="인프라보안 전용 템플릿">
        <div style={{ padding: 60, textAlign: 'center', color: '#718096' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <div>인프라보안 전용 템플릿 번들이 아직 생성되지 않았습니다.</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>서버를 재시작하여 시드 데이터를 생성해 주세요.</div>
        </div>
      </Layout>
    );
  }

  // Group variables by section
  const sections: { section: string; vars: BundleVariable[] }[] = [];
  const sectionMap = new Map<string, BundleVariable[]>();
  bundle.variables.forEach(v => {
    const sec = v.section || '기타';
    if (!sectionMap.has(sec)) sectionMap.set(sec, []);
    sectionMap.get(sec)!.push(v);
  });
  sectionMap.forEach((vars, section) => sections.push({ section, vars }));

  return (
    <Layout title="인프라보안 전용 템플릿">
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 0 40px' }}>
        {/* 헤더 */}
        <div style={{
          background: 'linear-gradient(135deg, #1a365d 0%, #2b6cb0 100%)',
          borderRadius: 12,
          padding: '28px 32px',
          marginBottom: 24,
          color: '#fff',
        }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{bundle.name}</h2>
          <p style={{ margin: '8px 0 0', fontSize: 14, opacity: 0.85 }}>
            {bundle.description}
          </p>
          <div style={{
            marginTop: 14,
            display: 'flex', gap: 16, fontSize: 13, opacity: 0.8,
          }}>
            <span>입력 필드: {totalCount}개</span>
            <span>|</span>
            <span>생성 문서: {bundle.items.length}종</span>
          </div>
        </div>

        <div style={{
          background: '#fff',
          border: '1px solid #dbe7f5',
          borderRadius: 12,
          padding: '18px 20px',
          marginBottom: 20,
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.04)',
        }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a365d', marginBottom: 6 }}>
                발주서 PDF 업로드
              </div>
              <div style={{ fontSize: 13, color: '#4a5568', lineHeight: 1.5 }}>
                발주번호, 발주명, 발주일자, 납품기한, 제조사, 모델명, 수량, 납품장소, 공급사 등을 먼저 채우고 나머지는 계속 직접 수정할 수 있습니다.
              </div>
            </div>

            <label style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              border: '1px dashed #90cdf4',
              borderRadius: 10,
              background: '#f7fbff',
              cursor: 'pointer',
              color: '#2c5282',
              fontSize: 13,
              fontWeight: 600,
            }}>
              <input
                type="file"
                accept=".pdf,application/pdf"
                style={{ display: 'none' }}
                onChange={e => setPurchaseOrderFile(e.target.files?.[0] ?? null)}
              />
              <span>발주서 선택</span>
              <span style={{ color: '#4a5568', fontWeight: 500 }}>
                {purchaseOrderFile?.name || '선택된 파일 없음'}
              </span>
            </label>

            <button
              onClick={handlePurchaseOrderExtract}
              disabled={!purchaseOrderFile || extracting}
              style={{
                padding: '11px 16px',
                borderRadius: 10,
                border: 'none',
                cursor: !purchaseOrderFile || extracting ? 'not-allowed' : 'pointer',
                background: !purchaseOrderFile || extracting ? '#cbd5e0' : '#2b6cb0',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                minWidth: 132,
              }}
            >
              {extracting ? '추출 중...' : '변수 자동 채움'}
            </button>
          </div>

          {extractError && (
            <div style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 8,
              background: '#fff5f5',
              border: '1px solid #feb2b2',
              color: '#c53030',
              fontSize: 13,
            }}>
              {extractError}
            </div>
          )}

          {extractResult && (
            <div style={{
              marginTop: 14,
              padding: '12px 14px',
              borderRadius: 10,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: '#2d3748', marginBottom: 8 }}>
                <span>자동 추출 {extractResult.extracted_keys.length}개</span>
                <span>추정 채움 {extractResult.inferred_keys.length}개</span>
                <span>직접 입력 필요 {extractResult.missing_keys.length}개</span>
              </div>

              {extractResult.warnings.length > 0 && (
                <div style={{ fontSize: 12, color: '#975a16', marginBottom: 8 }}>
                  {extractResult.warnings.join(' ')}
                </div>
              )}

              {extractResult.missing_keys.length > 0 && (
                <div style={{ fontSize: 12, color: '#4a5568', lineHeight: 1.5 }}>
                  남은 입력 항목: {extractResult.missing_keys.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {/* 왼쪽: 입력 폼 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {sections.map(({ section, vars }) => {
              const meta = SECTION_META[section] || { icon: '📝', title: section };
              return (
                <div key={section} style={{
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: '18px 20px',
                  marginBottom: 16,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 14, paddingBottom: 10,
                    borderBottom: '1px solid #edf2f7',
                  }}>
                    <span style={{ fontSize: 16 }}>{meta.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#2d3748' }}>{meta.title}</span>
                    {section === 'IDC출입' && (
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <select
                          value={selectedFavoriteUserId}
                          onChange={e => setSelectedFavoriteUserId(e.target.value)}
                          style={{
                            minWidth: 180,
                            padding: '6px 10px',
                            border: '1px solid #cbd5e0',
                            borderRadius: 6,
                            fontSize: 12,
                            background: '#fff',
                          }}
                        >
                          <option value="">사용자 선택</option>
                          {favoriteUsers.map(user => (
                            <option key={user.id} value={String(user.id)}>
                              {user.full_name || user.username}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleAddFavoriteUser}
                          disabled={!selectedFavoriteUserId}
                          style={{
                            padding: '7px 10px',
                            borderRadius: 6,
                            border: 'none',
                            background: selectedFavoriteUserId ? '#2b6cb0' : '#cbd5e0',
                            color: '#fff',
                            cursor: selectedFavoriteUserId ? 'pointer' : 'not-allowed',
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          인원 추가
                        </button>
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          color: '#718096', background: '#edf2f7',
                          padding: '2px 8px', borderRadius: 12,
                        }}>
                          {filledAccessCount} / {accessPeople.length * 4}
                        </span>
                      </div>
                    )}
                    {section !== 'IDC출입' && (
                      <span style={{
                        marginLeft: 'auto', fontSize: 11, fontWeight: 600,
                        color: '#718096', background: '#edf2f7',
                        padding: '2px 8px', borderRadius: 12,
                      }}>
                        {section === '장비정보'
                          ? `${countFilledSectionFields(vars, fieldValues, serialEntries)} / ${countTotalSectionFields(vars, serialEntries)}`
                          : `${vars.filter(v => fieldValues[v.key]?.trim()).length} / ${vars.length}`}
                      </span>
                    )}
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: vars.some(v => v.key === '발주명') ? '1fr' : '1fr 1fr',
                    gap: '10px 16px',
                  }}>
                    {section === 'IDC출입' ? (
                      <>
                        {accessPeople.map((person, index) => (
                      <div
                        key={person.id}
                        style={{
                          gridColumn: '1 / -1',
                          border: '1px solid #e2e8f0',
                          borderRadius: 10,
                          padding: '14px',
                          background: '#f8fafc',
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 12,
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#2d3748' }}>
                            출입 인원 {index + 1}
                          </div>
                          {accessPeople.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveAccessPerson(person.id)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#c53030',
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              삭제
                            </button>
                          )}
                        </div>

                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '10px 16px',
                        }}>
                          {[
                            { key: 'company', label: '회사명' },
                            { key: 'name', label: '이름' },
                            { key: 'position', label: '직책' },
                            { key: 'contact', label: '연락처' },
                          ].map(field => (
                            <div key={field.key}>
                              <label style={{
                                display: 'block',
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#4a5568',
                                marginBottom: 4,
                              }}>
                                {field.label}
                              </label>
                              <input
                                type="text"
                                value={person[field.key as keyof Omit<AccessPerson, 'id'>]}
                                onChange={e => handleAccessPersonChange(
                                  person.id,
                                  field.key as keyof Omit<AccessPerson, 'id'>,
                                  e.target.value,
                                )}
                                placeholder={getAccessPlaceholder(field.key, index)}
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: 6,
                                  fontSize: 13,
                                  outline: 'none',
                                  boxSizing: 'border-box',
                                  background: '#fff',
                                }}
                                onFocus={e => e.target.style.borderColor = '#3182ce'}
                                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                        ))}
                      </>
                    ) : vars.map(v => {
                      if (v.key === '시리얼번호') {
                        return (
                          <div key={v.key} style={{ gridColumn: '1 / -1' }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: 8,
                            }}>
                              <label style={{
                                display: 'block', fontSize: 12, fontWeight: 600, color: '#4a5568',
                              }}>
                                {v.label}
                              </label>
                              <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: '#2b6cb0',
                                background: '#ebf8ff',
                                borderRadius: 999,
                                padding: '2px 8px',
                              }}>
                                수량 기준 {serialEntries.length}개
                              </span>
                            </div>
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: '10px 16px',
                            }}>
                              {serialEntries.map((entry, index) => (
                                <div key={entry.id}>
                                  <label style={{
                                    display: 'block',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: '#4a5568',
                                    marginBottom: 4,
                                  }}>
                                    시리얼 번호 {index + 1}
                                  </label>
                                  <input
                                    type="text"
                                    value={entry.value}
                                    onChange={e => handleSerialChange(entry.id, e.target.value)}
                                    placeholder={getSerialPlaceholder(index)}
                                    style={{
                                      width: '100%',
                                      padding: '8px 12px',
                                      border: '1px solid #e2e8f0',
                                      borderRadius: 6,
                                      fontSize: 13,
                                      outline: 'none',
                                      boxSizing: 'border-box',
                                      background: '#fff',
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#3182ce'}
                                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }

                      const isWide = v.key === '발주명';
                      const isAutoFilled = autoFilledKeys.has(v.key) && !!fieldValues[v.key]?.trim();
                      return (
                        <div key={v.key} style={isWide ? { gridColumn: '1 / -1' } : undefined}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 4,
                          }}>
                            <label style={{
                              display: 'block', fontSize: 12, fontWeight: 600,
                              color: '#4a5568',
                            }}>
                              {v.label}
                            </label>
                            {isAutoFilled && (
                              <span style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: '#276749',
                                background: '#c6f6d5',
                                borderRadius: 999,
                                padding: '2px 7px',
                              }}>
                                자동
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={fieldValues[v.key] || ''}
                            onChange={e => handleFieldChange(v.key, e.target.value)}
                            placeholder={getPlaceholder(v.key)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              border: `1px solid ${isAutoFilled ? '#9ae6b4' : '#e2e8f0'}`,
                              borderRadius: 6,
                              fontSize: 13,
                              outline: 'none',
                              transition: 'border-color 0.15s',
                              boxSizing: 'border-box',
                              background: isAutoFilled ? '#f0fff4' : '#fff',
                            }}
                            onFocus={e => e.target.style.borderColor = '#3182ce'}
                            onBlur={e => e.target.style.borderColor = isAutoFilled ? '#9ae6b4' : '#e2e8f0'}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {section === 'IDC출입' && (
                    <button
                      type="button"
                      onClick={handleAddAccessPerson}
                      style={{
                        marginTop: 12,
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: '1px dashed #90cdf4',
                        background: '#f7fbff',
                        color: '#2c5282',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      + 출입 인원 추가
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* 오른쪽: 문서 선택 + 생성 버튼 */}
          <div style={{ width: 300, flexShrink: 0, position: 'sticky', top: 24 }}>
            {/* 진행 상태 */}
            <div style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '16px 20px',
              marginBottom: 16,
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 10,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#2d3748' }}>입력 진행률</span>
                <span style={{
                  fontSize: 12, fontWeight: 700,
                  color: filledCount === totalCount ? '#38a169' : '#3182ce',
                }}>
                  {filledCount} / {totalCount}
                </span>
              </div>
              <div style={{
                background: '#edf2f7', borderRadius: 999, height: 8, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 999,
                  background: filledCount === totalCount
                    ? 'linear-gradient(90deg, #38a169, #68d391)'
                    : 'linear-gradient(90deg, #3182ce, #63b3ed)',
                  width: `${totalCount > 0 ? (filledCount / totalCount) * 100 : 0}%`,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>

            {/* 문서 선택 */}
            <div style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '16px 20px',
              marginBottom: 16,
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid #edf2f7',
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#2d3748' }}>생성 대상 문서</span>
                <button
                  onClick={toggleAll}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 11, color: '#3182ce', fontWeight: 600,
                  }}
                >
                  {selectedItems.size === bundle.items.length ? '전체 해제' : '전체 선택'}
                </button>
              </div>

              {bundle.items.map(item => (
                <label
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 8px', marginBottom: 4,
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: selectedItems.has(item.id) ? '#ebf8ff' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.id)}
                    onChange={() => toggleItem(item.id)}
                    style={{ accentColor: '#3182ce', width: 16, height: 16 }}
                  />
                  <span style={{ flex: 1, fontSize: 13, color: '#2d3748', fontWeight: 500 }}>
                    {item.display_name}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    padding: '2px 6px', borderRadius: 4,
                    background: item.file_type === 'docx' ? '#e9d8fd' : '#c6f6d5',
                    color: item.file_type === 'docx' ? '#6b46c1' : '#276749',
                  }}>
                    {item.file_type?.toUpperCase()}
                  </span>
                </label>
              ))}
            </div>

            {/* 생성 버튼 */}
            {success && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', marginBottom: 12,
                background: '#f0fff4', border: '1px solid #9ae6b4',
                borderRadius: 8, fontSize: 13, color: '#276749', fontWeight: 600,
              }}>
                문서가 생성되어 다운로드되었습니다.
              </div>
            )}

            {error && (
              <div style={{
                padding: '10px 14px', marginBottom: 12,
                background: '#fff5f5', border: '1px solid #feb2b2',
                borderRadius: 8, fontSize: 13, color: '#c53030',
              }}>
                {error}
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={generating || selectedItems.size === 0}
              style={{
                width: '100%',
                padding: '13px 16px',
                fontSize: 15,
                fontWeight: 700,
                border: 'none',
                borderRadius: 10,
                cursor: generating || selectedItems.size === 0 ? 'not-allowed' : 'pointer',
                background: generating || selectedItems.size === 0
                  ? '#cbd5e0'
                  : 'linear-gradient(135deg, #2b6cb0, #3182ce)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.2s',
                boxShadow: generating || selectedItems.size === 0
                  ? 'none'
                  : '0 4px 14px rgba(49,130,206,0.3)',
              }}
            >
              {generating ? (
                <>
                  <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>&#9696;</span>
                  생성 중...
                </>
              ) : (
                <>
                  <span style={{ fontSize: 18 }}>&#128230;</span>
                  문서 일괄 생성 ({selectedItems.size}건)
                </>
              )}
            </button>

            {success && (
              <button
                onClick={handleReset}
                style={{
                  width: '100%', marginTop: 8,
                  padding: '10px 16px', fontSize: 13, fontWeight: 600,
                  border: '1px solid #e2e8f0', borderRadius: 8,
                  background: '#fff', color: '#4a5568', cursor: 'pointer',
                }}
              >
                새 문서 작성
              </button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function getPlaceholder(key: string): string {
  return key === '공급사담당자' ? '전진호' : '';
}

function createEmptyAccessPerson(id: number): AccessPerson {
  return { id, company: '', name: '', position: '', contact: '' };
}

function createEmptySerialEntry(id: number): SerialEntry {
  return { id, value: '' };
}

function nextAccessPersonId(people: AccessPerson[]): number {
  return people.reduce((maxId, person) => Math.max(maxId, person.id), 0) + 1;
}

function buildSubmissionFieldValues(fieldValues: Record<string, string>, accessPeople: AccessPerson[], serialEntries: SerialEntry[]) {
  const nextValues: Record<string, unknown> = { ...fieldValues };
  const serialValues = serialEntries.map(entry => entry.value.trim());
  nextValues.__serial_numbers = serialValues;
  nextValues['시리얼번호'] = serialValues.filter(Boolean).join('\n');
  serialValues.forEach((serial, index) => {
    const serialNumber = index + 1;
    nextValues[`시리얼번호${serialNumber}`] = serial;
    nextValues[`시리얼번호_${serialNumber}`] = serial;
  });
  accessPeople.forEach((person, index) => {
    const personNumber = index + 1;
    nextValues[`출입자${personNumber}_회사명`] = person.company;
    nextValues[`출입자${personNumber}_이름`] = person.name;
    nextValues[`출입자${personNumber}_직책`] = person.position;
    nextValues[`출입자${personNumber}_연락처`] = person.contact;
  });
  nextValues.__idc_access_people = accessPeople.map(({ company, name, position, contact }) => ({
    company,
    name,
    position,
    contact,
  }));
  return nextValues;
}

function getAccessPlaceholder(key: string, index: number): string {
  return '';
}

function parseQuantity(value: string | undefined): number {
  const parsed = Number.parseInt((value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(parsed, 100);
}

function syncSerialEntries(entries: SerialEntry[], desiredCount: number): SerialEntry[] {
  if (entries.length === desiredCount) return entries;
  if (entries.length > desiredCount) return entries.slice(0, desiredCount);

  const next = [...entries];
  let nextId = next.reduce((maxId, entry) => Math.max(maxId, entry.id), 0) + 1;
  while (next.length < desiredCount) {
    next.push(createEmptySerialEntry(nextId));
    nextId += 1;
  }
  return next;
}

function countFilledSectionFields(vars: BundleVariable[], fieldValues: Record<string, string>, serialEntries: SerialEntry[]) {
  return vars.reduce((count, variable) => {
    if (variable.key === '시리얼번호') {
      return count + serialEntries.filter(entry => entry.value.trim()).length;
    }
    return count + ((fieldValues[variable.key] || '').trim() ? 1 : 0);
  }, 0);
}

function countTotalSectionFields(vars: BundleVariable[], serialEntries: SerialEntry[]) {
  return vars.reduce((count, variable) => count + (variable.key === '시리얼번호' ? serialEntries.length : 1), 0);
}

function getSerialPlaceholder(index: number): string {
  return '';
}
