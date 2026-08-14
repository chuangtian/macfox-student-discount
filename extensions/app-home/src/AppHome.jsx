import {render} from 'preact';
import {useCallback, useEffect, useRef, useState} from 'preact/hooks';
import {LocationProvider, useLocation} from 'preact-iso';

const API_BASE = 'https://macfox.decomkt.com/api/shopify-app/student-discounts';
const DEFAULT_DISCOUNT_SETTINGS = {
  codePrefix: 'STUDENT',
  discountType: 'PERCENTAGE',
  discountValue: 10,
  discountTarget: 'ALL_PRODUCTS',
  discountProductIds: [],
  discountCollectionIds: [],
  usageLimit: 1,
  combinesWithProduct: false,
  combinesWithOrder: false,
  combinesWithShipping: false,
};

export default async () => {
  render(
    <LocationProvider>
      <App />
    </LocationProvider>,
    document.body,
  );
};

function App() {
  const location = useLocation();
  const [claims, setClaims] = useState([]);
  const [campaign, setCampaign] = useState(DEFAULT_DISCOUNT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearingTestData, setClearingTestData] = useState(false);
  const [testCleanupAvailable, setTestCleanupAvailable] = useState(false);
  const [error, setError] = useState('');
  const [reviewingId, setReviewingId] = useState('');
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [evidenceSrc, setEvidenceSrc] = useState('');
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const clearTestDataModalRef = useRef(null);
  const [expandedSettings, setExpandedSettings] = useState({
    prefix: true,
    type: true,
    target: true,
    usage: true,
    combinations: true,
  });

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
      setCampaign({...DEFAULT_DISCOUNT_SETTINGS, ...(json.campaign || {})});
      setTestCleanupAvailable(Boolean(json.testCleanupAvailable));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '申请记录加载失败');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  const clearAllTestData = useCallback(async () => {
    setClearingTestData(true);
    try {
      const response = await apiFetch('', {
        method: 'DELETE',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({confirmation: 'CLEAR_ALL_TEST_DATA'}),
      });
      const json = await response.json();
      if (!response.ok && response.status !== 207) {
        throw new Error(json.error || '测试数据清理失败');
      }
      clearTestDataModalRef.current?.hideOverlay();
      await load();
      if (json.failedClaims) {
        shopify.toast.show(
          `已清理 ${json.deletedClaims} 条记录，另有 ${json.failedClaims} 条未能清理，请重试`,
          {isError: true},
        );
      } else {
        shopify.toast.show(
          `已清理 ${json.deletedClaims} 条申请、${json.deletedDiscounts} 个折扣码和 ${json.deletedEvidenceFiles} 个学生证文件`,
        );
      }
    } catch (cleanupError) {
      shopify.toast.show(
        cleanupError instanceof Error ? cleanupError.message : '测试数据清理失败',
        {isError: true},
      );
    } finally {
      setClearingTestData(false);
    }
  }, [apiFetch, load]);

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
      shopify.toast.show(action === 'APPROVE'
        ? json.emailSent === false
          ? '审核通过，优惠码已创建，但邮件发送失败'
          : '审核通过，优惠码已发送'
        : json.emailSent === false
          ? '申请已拒绝，但拒绝通知邮件发送失败'
          : '申请已拒绝，通知邮件已发送');
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

  const updateCampaign = useCallback((key, value) => {
    setCampaign((current) => ({...current, [key]: value}));
  }, []);

  const selectDiscountResources = useCallback(async () => {
    const isProduct = campaign.discountTarget === 'PRODUCTS';
    const ids = isProduct ? campaign.discountProductIds : campaign.discountCollectionIds;
    try {
      const selected = await shopify.resourcePicker({
        type: isProduct ? 'product' : 'collection',
        action: 'select',
        multiple: 100,
        selectionIds: (ids || []).map((id) => ({id})),
        ...(isProduct ? {filter: {variants: false}} : {}),
      });
      if (!selected) return;
      updateCampaign(
        isProduct ? 'discountProductIds' : 'discountCollectionIds',
        selected.map((resource) => resource.id),
      );
    } catch (pickerError) {
      shopify.toast.show(
        pickerError instanceof Error ? pickerError.message : '资源选择器打开失败',
        {isError: true},
      );
    }
  }, [campaign, updateCampaign]);

  const saveDiscountSettings = useCallback(async () => {
    setSaving(true);
    try {
      const response = await apiFetch('', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          codePrefix: campaign.codePrefix,
          discountType: campaign.discountType,
          discountValue: Number(campaign.discountValue),
          discountTarget: campaign.discountTarget,
          discountProductIds: campaign.discountProductIds,
          discountCollectionIds: campaign.discountCollectionIds,
          usageLimit: Number(campaign.usageLimit),
          combinesWithProduct: campaign.combinesWithProduct,
          combinesWithOrder: campaign.combinesWithOrder,
          combinesWithShipping: campaign.combinesWithShipping,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || '折扣设置保存失败');
      setCampaign({...DEFAULT_DISCOUNT_SETTINGS, ...json.campaign});
      shopify.toast.show('折扣设置已保存');
    } catch (saveError) {
      shopify.toast.show(
        saveError instanceof Error ? saveError.message : '折扣设置保存失败',
        {isError: true},
      );
    } finally {
      setSaving(false);
    }
  }, [apiFetch, campaign]);

  const toggleSetting = useCallback((key) => {
    setExpandedSettings((current) => ({...current, [key]: !current[key]}));
  }, []);

  const path = location.path || '/';
  const view = path.endsWith('/discount-settings')
    ? 'discount-settings'
    : path.endsWith('/theme-module')
      ? 'theme-module'
      : 'reviews';

  return (
    <>
      <s-app-nav>
        <s-link href="/">申请与审核</s-link>
        <s-link href="/discount-settings">折扣设置</s-link>
        <s-link href="/theme-module">店铺模块</s-link>
      </s-app-nav>

      <s-box padding="base" maxInlineSize="180px">
        <s-image src="./macfox-logo-black.png" alt="Macfox" />
      </s-box>

      {view === 'discount-settings' && (
        <s-page heading="折扣设置">
          <s-button
            slot="primary-action"
            variant="primary"
            loading={saving}
            onClick={() => void saveDiscountSettings()}
          >
            保存设置
          </s-button>

          {error && <s-banner tone="critical">{error}</s-banner>}
          {loading && <s-banner tone="info">正在加载折扣设置…</s-banner>}

          <CollapsibleSection
            heading="1. 折扣码前缀"
            summary={campaign.codePrefix || '未设置'}
            expanded={expandedSettings.prefix}
            onToggle={() => toggleSetting('prefix')}
          >
            <s-text-field
              label="折扣码前缀"
              details="只使用英文字母和数字，最长 12 个字符。"
              value={campaign.codePrefix}
              onInput={(event) => updateCampaign('codePrefix', event.currentTarget.value)}
            />
          </CollapsibleSection>

          <CollapsibleSection
            heading="2. 折扣类型"
            summary={`${campaign.discountType === 'PERCENTAGE' ? '百分比' : '固定金额'} · ${campaign.discountValue}${campaign.discountType === 'PERCENTAGE' ? '%' : ''}`}
            expanded={expandedSettings.type}
            onToggle={() => toggleSetting('type')}
          >
            <s-grid gridTemplateColumns="@container (inline-size <= 500px) 1fr, repeat(2, minmax(0, 1fr))" gap="base">
              <s-select
                label="折扣类型"
                value={campaign.discountType}
                onChange={(event) => updateCampaign('discountType', event.currentTarget.value)}
              >
                <s-option value="PERCENTAGE">百分比折扣</s-option>
                <s-option value="FIXED_AMOUNT">固定金额折扣</s-option>
              </s-select>
              <s-number-field
                label={campaign.discountType === 'PERCENTAGE' ? '折扣百分比' : '折扣金额'}
                value={String(campaign.discountValue)}
                min="0.01"
                max={campaign.discountType === 'PERCENTAGE' ? 100 : undefined}
                step="0.01"
                suffix={campaign.discountType === 'PERCENTAGE' ? '%' : undefined}
                onInput={(event) => updateCampaign('discountValue', event.currentTarget.value)}
              />
            </s-grid>
          </CollapsibleSection>

          <CollapsibleSection
            heading="3. 折扣适用范围"
            summary={discountTargetLabel(campaign)}
            expanded={expandedSettings.target}
            onToggle={() => toggleSetting('target')}
          >
            <s-grid gap="base">
              <s-select
                label="折扣适用范围"
                value={campaign.discountTarget}
                onChange={(event) => updateCampaign('discountTarget', event.currentTarget.value)}
              >
                <s-option value="ALL_PRODUCTS">全部产品</s-option>
                <s-option value="PRODUCTS">指定产品</s-option>
                <s-option value="COLLECTIONS">指定产品系列</s-option>
              </s-select>

              {campaign.discountTarget !== 'ALL_PRODUCTS' && (
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-button onClick={() => void selectDiscountResources()}>
                    {campaign.discountTarget === 'PRODUCTS' ? '选择产品' : '选择产品系列'}
                  </s-button>
                  <s-text color="subdued">
                    已选择 {campaign.discountTarget === 'PRODUCTS'
                      ? campaign.discountProductIds.length
                      : campaign.discountCollectionIds.length} 项
                  </s-text>
                </s-stack>
              )}
            </s-grid>
          </CollapsibleSection>

          <CollapsibleSection
            heading="4. 折扣使用次数"
            summary={`每个折扣码最多使用 ${campaign.usageLimit} 次`}
            expanded={expandedSettings.usage}
            onToggle={() => toggleSetting('usage')}
          >
            <s-number-field
              label="折扣使用次数"
              details="每个发放的折扣码最多可在 Shopify 中成功核销的总次数。"
              value={String(campaign.usageLimit)}
              min="1"
              max="1000000"
              step="1"
              inputMode="numeric"
              onInput={(event) => updateCampaign('usageLimit', event.currentTarget.value)}
            />
          </CollapsibleSection>

          <CollapsibleSection
            heading="5. 与其他折扣叠加"
            summary={discountCombinationSummary(campaign)}
            expanded={expandedSettings.combinations}
            onToggle={() => toggleSetting('combinations')}
          >
            <s-stack direction="block" gap="small">
              <s-checkbox
                label="允许与商品折扣叠加"
                checked={campaign.combinesWithProduct}
                onChange={(event) => updateCampaign('combinesWithProduct', event.currentTarget.checked)}
              />
              <s-checkbox
                label="允许与订单折扣叠加"
                checked={campaign.combinesWithOrder}
                onChange={(event) => updateCampaign('combinesWithOrder', event.currentTarget.checked)}
              />
              <s-checkbox
                label="允许与运费折扣叠加"
                checked={campaign.combinesWithShipping}
                onChange={(event) => updateCampaign('combinesWithShipping', event.currentTarget.checked)}
              />
            </s-stack>
          </CollapsibleSection>

          <s-section>
            <s-stack direction="inline" justifyContent="end">
              <s-button variant="primary" loading={saving} onClick={() => void saveDiscountSettings()}>
                保存折扣设置
              </s-button>
            </s-stack>
          </s-section>
        </s-page>
      )}

      {view === 'reviews' && (
        <s-page heading="申请与审核">
          <s-button slot="primary-action" onClick={() => void load()} disabled={loading}>
            刷新
          </s-button>

          <s-section heading="申请与审核">
            <s-stack direction="block" gap="base">
              <s-text>最近 100 条记录；学生证文件审核完成后仍保留。</s-text>

              {testCleanupAvailable && (
                <s-banner tone="warning" heading="临时测试工具">
                  <s-stack direction="block" gap="base">
                    <s-text>清空当前测试店铺的申请记录、学生证文件，以及这些申请生成的 Shopify 折扣码。折扣规则设置会保留。</s-text>
                    <s-stack direction="inline">
                      <s-button
                        tone="critical"
                        disabled={loading || claims.length === 0}
                        commandFor="clear-test-data-modal"
                        command="--show"
                      >
                        一键清空全部数据
                      </s-button>
                    </s-stack>
                  </s-stack>
                </s-banner>
              )}

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
                    <s-table-cell>
                      <s-stack direction="block" gap="small-200">
                        <StatusBadge status={claim.status} />
                        {claim.status === 'PENDING' && claim.error && (
                          <s-text color="subdued">{claim.error}</s-text>
                        )}
                      </s-stack>
                    </s-table-cell>
                    <s-table-cell>{new Date(claim.createdAt).toLocaleString('zh-CN')}</s-table-cell>
                    <s-table-cell>
                      {claim.status === 'PENDING' && claim.verificationMethod === 'STUDENT_ID' ? (
                        <>
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
                        </>
                      ) : '—'}
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
                </s-table>
              )}
            </s-stack>
          </s-section>
        </s-page>
      )}

      {view === 'theme-module' && (
        <s-page heading="店铺模块">
          <s-section heading="前台学生优惠入口">
            <s-stack direction="block" gap="base">
              <s-text>前台学生优惠入口由主题编辑器中的 Student discount 应用区块控制。</s-text>
              <s-text color="subdued">进入在线商店的主题编辑器，将该应用区块添加到需要展示学生优惠的模板中。</s-text>
            </s-stack>
          </s-section>
        </s-page>
      )}

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

      <s-modal ref={clearTestDataModalRef} id="clear-test-data-modal" heading="确认清空全部测试数据">
        <s-stack direction="block" gap="base">
          <s-banner tone="critical">此操作无法撤销。</s-banner>
          <s-text>将永久删除当前测试店铺的全部 {claims.length} 条申请记录、学生证文件，以及申请生成的 Shopify 折扣码。</s-text>
          <s-text color="subdued">折扣码前缀、折扣类型、适用范围、使用次数和叠加规则会保留。</s-text>
        </s-stack>
        <s-button slot="secondary-actions" disabled={clearingTestData} commandFor="clear-test-data-modal" command="--hide">取消</s-button>
        <s-button slot="primary-action" variant="primary" tone="critical" loading={clearingTestData} onClick={() => void clearAllTestData()}>确认永久清空</s-button>
      </s-modal>
    </>
  );
}

function CollapsibleSection({heading, summary, expanded, onToggle, children}) {
  return (
    <s-section>
      <s-grid gap="base">
        <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
          <s-stack direction="block" gap="small-200">
            <s-heading>{heading}</s-heading>
            <s-text color="subdued">{summary}</s-text>
          </s-stack>
          <s-button
            variant="tertiary"
            tone="neutral"
            icon={expanded ? 'chevron-up' : 'chevron-down'}
            accessibilityLabel={`${expanded ? '收起' : '展开'}${heading}`}
            onClick={onToggle}
          />
        </s-grid>
        <s-box display={expanded ? 'auto' : 'none'}>
          {children}
        </s-box>
      </s-grid>
    </s-section>
  );
}

function discountTargetLabel(campaign) {
  if (campaign.discountTarget === 'PRODUCTS') {
    return `指定产品 · 已选择 ${campaign.discountProductIds.length} 项`;
  }
  if (campaign.discountTarget === 'COLLECTIONS') {
    return `指定产品系列 · 已选择 ${campaign.discountCollectionIds.length} 项`;
  }
  return '全部产品';
}

function discountCombinationSummary(campaign) {
  const enabled = [
    campaign.combinesWithProduct && '商品折扣',
    campaign.combinesWithOrder && '订单折扣',
    campaign.combinesWithShipping && '运费折扣',
  ].filter(Boolean);
  return enabled.length > 0 ? `允许与${enabled.join('、')}叠加` : '不允许与其他折扣叠加';
}

function StatusBadge({status}) {
  const config = {
    PENDING: ['待人工审核', 'info'],
    ISSUED: ['已发放', 'success'],
    FAILED: ['失败', 'critical'],
    REJECTED: ['已拒绝', 'critical'],
  }[status] || [status, 'neutral'];
  return <s-badge tone={config[1]}>{config[0]}</s-badge>;
}
