// src/auth/stripe-service.js
// Stripe 결제 서비스 모듈 — Checkout Session 생성 및 플랜 매핑
// 
// SETUP: Stripe 대시보드에서 각 플랜별 Price ID를 생성하고 아래 PRICE_IDS에 입력하세요.
//   https://dashboard.stripe.com/products → 상품 생성 후 Price ID 복사
//

const log = require('electron-log');

// ─── Stripe 초기화 ─────────────────────────────────────────────────────────
// IMPORTANT: SECRET KEY는 절대 클라이언트에 노출하지 마세요.
// Stripe Secret Key는 main.js에서 환경변수 또는 설정 파일로 로드하세요.
let _stripe = null;

function initStripe(secretKey) {
  if (!secretKey) {
    log.warn('[Stripe] Secret key not provided — Stripe will be disabled');
    return false;
  }
  try {
    _stripe = require('stripe')(secretKey);
    log.info('[Stripe] SDK initialized successfully');
    return true;
  } catch (e) {
    log.error('[Stripe] SDK init failed:', e.message);
    return false;
  }
}

// ─── 플랜 → Stripe Price ID 매핑 테이블 ────────────────────────────────────
// Stripe 대시보드에서 상품/가격 생성 후 Price ID를 아래에 입력하세요.
// 테스트 모드: price_test_xxx / 라이브 모드: price_xxx
const PRICE_IDS = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY   || 'price_1TbKOfB7MnEthCwbdbwmLUCT',
    yearly:  process.env.STRIPE_PRICE_STARTER_YEARLY    || 'price_1TbKOfB7MnEthCwbjvqWXWVv'
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY       || 'price_1TbKOgB7MnEthCwb0pr4UDW2',
    yearly:  process.env.STRIPE_PRICE_PRO_YEARLY        || 'price_1TbKOgB7MnEthCwb26wH27pY'
  },
  enterprise: {
    monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || 'price_1TbKOgB7MnEthCwbaKqiz589',
    yearly:  process.env.STRIPE_PRICE_ENTERPRISE_YEARLY  || 'price_1TbKOhB7MnEthCwbK5ky1dZU'
  }
};

// 플랜별 토큰량 (Webhook에서 토큰 리셋에 사용)
const PLAN_TOKENS = {
  free:       600,
  starter:    6000,
  pro:        12000,
  enterprise: 30000
};

// ─── Stripe Checkout Session 생성 ──────────────────────────────────────────
/**
 * Stripe Checkout Session을 생성하고 URL을 반환합니다.
 * 사용자는 해당 URL을 외부 브라우저에서 열어 결제를 완료합니다.
 * 
 * @param {string} planId         - 'starter' | 'pro' | 'enterprise'
 * @param {string} billingCycle   - 'monthly' | 'yearly'
 * @param {string} userId         - Supabase User ID (metadata로 전달됨)
 * @param {string} email          - 사용자 이메일 (prefill용)
 * @returns {{ url: string } | { error: string }}
 */
async function createCheckoutSession(planId, billingCycle, userId, email) {
  if (!_stripe) {
    return { error: 'Stripe is not initialized. Please configure your Secret Key.' };
  }

  const priceId = PRICE_IDS[planId]?.[billingCycle];
  if (!priceId || priceId.startsWith('price_') === false) {
    return { error: `Invalid plan or billing cycle: ${planId}/${billingCycle}` };
  }

  try {
    const session = await _stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      
      // 결제 완료/취소 후 리다이렉트 URL
      // Electron에서는 커스텀 딥링크(xpider://) 또는 thank-you 페이지 URL 사용
      success_url: 'http://xpider.pro/thanks.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url:  'https://xpider.ai/payment/cancel',

      // 고객 이메일 prefill
      customer_email: email || undefined,

      // 구독 메타데이터 (Webhook에서 userId 식별에 사용)
      subscription_data: {
        metadata: {
          xpider_user_id: userId,
          xpider_plan:    planId
        }
      },
      
      // Checkout 세션 메타데이터
      metadata: {
        xpider_user_id: userId,
        xpider_plan:    planId,
        billing_cycle:  billingCycle
      },

      // 허용 프로모 코드
      allow_promotion_codes: true
    });

    log.info(`[Stripe] Checkout session created: ${session.id} for user ${userId} plan ${planId}/${billingCycle}`);
    return { url: session.url, sessionId: session.id };
  } catch (e) {
    log.error('[Stripe] Checkout session creation failed:', e.message);
    return { error: e.message };
  }
}

// ─── Stripe Customer Portal Session 생성 ───────────────────────────────────
/**
 * 고객이 구독을 직접 관리할 수 있는 Stripe 포털 세션을 생성합니다.
 * (플랜 변경, 취소, 청구서 조회 등)
 * 
 * @param {string} customerId - Stripe Customer ID (profiles.stripe_customer_id)
 * @returns {{ url: string } | { error: string }}
 */
async function createPortalSession(customerId) {
  if (!_stripe) {
    return { error: 'Stripe is not initialized.' };
  }
  if (!customerId) {
    return { error: 'No Stripe customer ID found. Please complete a purchase first.' };
  }

  try {
    const session = await _stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: 'https://xpider.ai/account'
    });
    return { url: session.url };
  } catch (e) {
    log.error('[Stripe] Portal session creation failed:', e.message);
    return { error: e.message };
  }
}

// ─── Stripe Webhook 서명 검증 ───────────────────────────────────────────────
/**
 * Stripe Webhook 이벤트 서명을 검증합니다.
 * @param {string} payload   - raw request body
 * @param {string} signature - Stripe-Signature header
 * @param {string} secret    - Webhook signing secret
 */
function verifyWebhookSignature(payload, signature, secret) {
  if (!_stripe) return null;
  try {
    return _stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (e) {
    log.error('[Stripe] Webhook signature verification failed:', e.message);
    return null;
  }
}

// ─── 사용자 최신 구독 정보 조회 ──────────────────────────────────────────
/**
 * 이메일로 Stripe 고객을 검색하고 활성 구독을 반환합니다.
 * 결제 완료 확인 시 사용됩니다.
 * 
 * @param {string} email - 사용자 이메일
 * @returns {{ planId, customerId, status } | { error }}
 */
async function getLatestSubscription(email) {
  if (!_stripe) {
    return { error: 'Stripe is not initialized.' };
  }
  if (!email) {
    return { error: 'Email is required.' };
  }

  try {
    // 1. 이메일로 고객 검색
    const customers = await _stripe.customers.list({ email: email.toLowerCase(), limit: 5 });
    if (!customers.data || customers.data.length === 0) {
      return { error: 'No Stripe customer found for this email.' };
    }

    // 2. 각 고객의 활성/trialing 구독 확인 (최신 순)
    for (const customer of customers.data) {
      const subs = await _stripe.subscriptions.list({
        customer: customer.id,
        status: 'all',  // active + trialing 모두 포함
        limit: 10,
        expand: ['data.items.data.price.product']
      });

      // active 또는 trialing 구독만 필터
      const activeSubs = subs.data?.filter(s => s.status === 'active' || s.status === 'trialing') || [];

      if (activeSubs.length > 0) {
        // 가장 최신 활성/trialing 구독 선택
        const sub = activeSubs[0];
        const priceId = sub.items.data[0]?.price?.id;

        // priceId로 플랜 ID 역매핑
        let detectedPlan = null;
        if (priceId) {
          for (const [planId, cycles] of Object.entries(PRICE_IDS)) {
            if (Object.values(cycles).includes(priceId)) {
              detectedPlan = planId;
              break;
            }
          }
        }

        // metadata에서도 플랜 ID 확인 (backup)
        const metaPlan = sub.metadata?.xpider_plan
          || sub.items.data[0]?.price?.product?.metadata?.xpider_plan;
        const finalPlan = detectedPlan || metaPlan;

        if (finalPlan) {
          log.info(`[Stripe] Found subscription: plan=${finalPlan}, status=${sub.status}, priceId=${priceId}`);
          return {
            planId: finalPlan,
            customerId: customer.id,
            subscriptionId: sub.id,
            status: sub.status,
            priceId
          };
        }

        // 역매핑 실패했지만 구독 자체는 존재 → priceId를 그대로 반환 (IPC에서 fallback 처리)
        log.warn(`[Stripe] Subscription found but plan mapping failed. priceId=${priceId}, metadata=${JSON.stringify(sub.metadata)}`);
        // 이 경우도 에러로 반환하지 않고 error를 담아서 반환 → IPC에서 planId fallback 사용
      }
    }

    return { error: 'No active subscription found for this email.' };
  } catch (e) {
    log.error('[Stripe] getLatestSubscription error:', e.message);
    return { error: e.message };
  }
}

module.exports = {
  initStripe,
  createCheckoutSession,
  createPortalSession,
  verifyWebhookSignature,
  getLatestSubscription,
  PLAN_TOKENS,
  PRICE_IDS
};
