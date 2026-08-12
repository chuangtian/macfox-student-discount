import {render} from 'preact';
import {useCallback, useEffect, useState} from 'preact/hooks';

const API_BASE = 'https://macfox.decomkt.com/api/shopify-app/student-discounts';

export default async () => {
  render(<App />, document.body);
};

function App() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewingId, setReviewingId] = useState('');
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [evidenceSrc, setEvidenceSrc] = useState('');
  const [evidenceLoading, setEvidenceLoading] = useState(false);

  const apiFetch = useCallback(async (path = '', init = {}) => {
    const token = await shopify.auth.idToken();
    return fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
  }, []);

  const viewEvidence = useCallback(async (claim) => {
    setSelectedClaim(claim);
    setEvidenceSrc('');
    setEvidenceLoading(true);
    try {
      const response = await apiFetch(`/claims/${claim.id}/evidence`, {cache: 'no-store'});
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.error || '学生证图片加载失败');
      }
      const mime = response.headers.get('content-type') || 'image/jpeg';
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      const chunkSize = 0x8000;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
      }
      setEvidenceSrc(`data:${mime};base64,${btoa(binary)}`);
    } catch (evidenceError) {
      shopify.toast.show(
        evidenceError instanceof Error ? evidenceError.message : '学生证图片加载失败',
        {isError: true},
      );
    } finally {
      setEvidenceLoading(false);
    }
  }, [apiFetch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('', {cache: 'no-store'});
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || '申请记录加载失败');
      setClaims(json.claims || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '申请记录加载失败');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const reviewClaim = useCallback(async (claim, action) => {
    setReviewingId(claim.id);
    try {
      const response = await apiFetch(`/claims/${claim.id}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          action,
          reason: action === 'REJECT' ? '学生身份未通过审核' : undefined,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || '审核操作失败');
      shopify.toast.show(action === 'APPROVE' ? '审核通过，优惠码已发送' : '申请已拒绝');
      await load();
    } catch (reviewError) {
      shopify.toast.show(
        reviewError instanceof Error ? reviewError.message : '审核操作失败',
        {isError: true},
      );
    } finally {
      setReviewingId('');
    }
  }, [apiFetch, load]);

  return (
    <s-page heading="学生优惠">
      <s-button slot="primary-action" onClick={() => void load()} disabled={loading}>
        刷新
      </s-button>

      <s-section heading="申请与审核">
        <s-stack direction="block" gap="base">
          <s-text>最近 100 条记录；学生证文件审核完成后仍保留。</s-text>

          {error && <s-banner tone="critical">{error}</s-banner>}
          {loading && <s-stack direction="inline" gap="small"><s-spinner /><s-text>正在加载申请记录…</s-text></s-stack>}

          {!loading && !error && claims.length === 0 && (
            <s-banner tone="info">暂无申请记录</s-banner>
          )}

          {!loading && !error && claims.length > 0 && (
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">申请人</s-table-header>
                <s-table-header>验证方式</s-table-header>
                <s-table-header>证明</s-table-header>
                <s-table-header>折扣码</s-table-header>
                <s-table-header>状态</s-table-header>
                <s-table-header>提交时间</s-table-header>
                <s-table-header>操作</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {claims.map((claim) => (
                  <s-table-row key={claim.id}>
                    <s-table-cell>
                      <s-stack direction="block" gap="small-200">
                        <s-text type="strong">{claim.fullName || '—'}</s-text>
                        <s-text color="subdued">{claim.email}</s-text>
                      </s-stack>
                    </s-table-cell>
                    <s-table-cell>{claim.verificationMethod === 'STUDENT_ID' ? '学生证' : '教育邮箱'}</s-table-cell>
                    <s-table-cell>
                      {claim.evidenceAvailable ? (
                        <s-button
                          variant="tertiary"
                          commandFor="student-id-modal"
                          command="--show"
                          onClick={() => void viewEvidence(claim)}
                        >
                          查看学生证
                        </s-button>
                      ) : '—'}
                    </s-table-cell>
                    <s-table-cell>{claim.status === 'ISSUED' ? claim.code : '—'}</s-table-cell>
                    <s-table-cell><StatusBadge status={claim.status} /></s-table-cell>
                    <s-table-cell>{new Date(claim.createdAt).toLocaleString('zh-CN')}</s-table-cell>
                    <s-table-cell>
                      {claim.status === 'PENDING' && claim.verificationMethod === 'STUDENT_ID' ? (
                        <s-button-group>
                          <s-button
                            variant="primary"
                            loading={reviewingId === claim.id}
                            onClick={() => void reviewClaim(claim, 'APPROVE')}
                          >
                            通过
                          </s-button>
                          <s-button
                            tone="critical"
                            disabled={Boolean(reviewingId)}
                            onClick={() => void reviewClaim(claim, 'REJECT')}
                          >
                            拒绝
                          </s-button>
                        </s-button-group>
                      ) : '—'}
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
        </s-stack>
      </s-section>

      <s-section heading="店铺模块">
        <s-text>前台学生优惠入口由主题编辑器中的 Student discount 应用区块控制。</s-text>
      </s-section>

      <s-modal id="student-id-modal" heading="学生证照片" size="large-100" padding="none">
        {evidenceLoading ? (
          <s-box padding="base"><s-stack direction="inline" gap="small"><s-spinner /><s-text>正在安全加载学生证照片…</s-text></s-stack></s-box>
        ) : evidenceSrc ? (
          <s-image src={evidenceSrc} alt={`${selectedClaim?.fullName || selectedClaim?.email} 的学生证照片`} />
        ) : (
          <s-box padding="base"><s-text>未找到学生证照片</s-text></s-box>
        )}
        <s-button slot="secondary-actions" commandFor="student-id-modal" command="--hide">关闭</s-button>
      </s-modal>
    </s-page>
  );
}

function StatusBadge({status}) {
  const config = {
    PENDING: ['待审核', 'info'],
    ISSUED: ['已发放', 'success'],
    FAILED: ['失败', 'critical'],
    REJECTED: ['已拒绝', 'critical'],
  }[status] || [status, 'neutral'];
  return <s-badge tone={config[1]}>{config[0]}</s-badge>;
}
