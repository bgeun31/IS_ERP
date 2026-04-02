import React, { useEffect, useState } from 'react';
import { extractBundlePurchaseOrder, generateBundle, getBundles } from '../api/client';
import type {
  BundlePurchaseOrderExtractResult,
  BundleVariable,
  TemplateBundle,
  TemplateBundleItem,
} from '../types';
import Layout from '../components/Layout';

const SECTION_META: Record<string, { icon: string; title: string }> = {
  '발주정보': { icon: '📋', title: '발주 정보' },
  '장비정보': { icon: '🖥️', title: '장비 정보' },
  '납품검수': { icon: '📦', title: '납품 / 검수 정보' },
  '유지보수': { icon: '🔧', title: '유지보수' },
  'IDC출입': { icon: '🚪', title: 'IDC 출입 인원' },
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
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    getBundles()
      .then(res => {
        const infra = res.data.find(b => b.name === '인프라보안 전용 템플릿');
        if (infra) {
          setBundle(infra);
          const init: Record<string, string> = {};
          infra.variables.forEach((v: BundleVariable) => { init[v.key] = ''; });
          setFieldValues(init);
          setSelectedItems(new Set(infra.items.map((it: TemplateBundleItem) => it.id)));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleFieldChange = (key: string, value: string) => {
    setFieldValues(prev => ({ ...prev, [key]: value }));
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

  const filledCount = Object.values(fieldValues).filter(v => v.trim()).length;
  const totalCount = bundle?.variables.length ?? 0;

  const handleGenerate = async () => {
    if (!bundle) return;
    setGenerating(true);
    setError('');
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append('field_values', JSON.stringify(fieldValues));
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
    bundle.variables.forEach(v => { init[v.key] = ''; });
    setFieldValues(init);
    setPurchaseOrderFile(null);
    setExtractError('');
    setExtractResult(null);
    setAutoFilledKeys(new Set());
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
                    <span style={{
                      marginLeft: 'auto', fontSize: 11, fontWeight: 600,
                      color: '#718096', background: '#edf2f7',
                      padding: '2px 8px', borderRadius: 12,
                    }}>
                      {vars.filter(v => fieldValues[v.key]?.trim()).length} / {vars.length}
                    </span>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: section === 'IDC출입' ? '1fr 1fr' : vars.some(v => v.key === '발주명') ? '1fr' : '1fr 1fr',
                    gap: '10px 16px',
                  }}>
                    {vars.map(v => {
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
  const map: Record<string, string> = {
    '발주번호': 'PO-20260319-0043',
    '발주명': '[베트남 하노이 센터] Extreme 7520 스위치 1대 구매 건',
    '발주일자': '2026/03/19',
    '납품기한': '2026/03/30',
    '제조사': 'EXTREME',
    '모델명': '7520-48Y-8C-AC-F',
    '수량': '1',
    '시리얼번호': 'SM022609Q-40056',
    'OS버전': '33.5.2.118',
    '입고일자': '2026/03/30',
    '검수일자': '2026/03/31',
    '납품장소': '가산2 IDC',
    '공급사': '아이클라우드 주식회사',
    '공급사_약칭': '아이클라우드',
    '공급사담당자': '전진호',
    '유지보수종료일': '2027-03-31',
    '출입자1_회사명': '아이클라우드',
    '출입자1_이름': '이원재',
    '출입자1_직책': '과장',
    '출입자1_연락처': '010-3618-7518',
    '출입자2_회사명': '아이클라우드',
    '출입자2_이름': '송봉근',
    '출입자2_직책': '사원',
    '출입자2_연락처': '010-8961-3488',
  };
  return map[key] || '';
}
