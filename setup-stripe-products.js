// 이 스크립트를 실행하면 Stripe에 XPIDER 상품 3개와 가격 6개(월/연)를 자동 생성합니다.
// 실행: node setup-stripe-products.js

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || '');

const PLANS = [
  {
    id: 'starter',
    name: 'XPIDER Starter Plan',
    description: '6,000 AI tokens per month. 10-Engine Local Business Crawler, Google Maps Finder, Email Extractor.',
    monthly_amount: 5900,   // $59.00 in cents
    yearly_amount:  47000,  // $47.00/mo × 12 = $564/yr (billed yearly)
    tokens: 6000
  },
  {
    id: 'pro',
    name: 'XPIDER Business Pro Plan',
    description: '12,000 AI tokens per month. All 7 Core Engines, VPN, AutoForm Sender, SendForce Mailer.',
    monthly_amount: 9900,   // $99.00
    yearly_amount:  79000,  // $79.00/mo × 12 = $948/yr (billed yearly)
    tokens: 12000
  },
  {
    id: 'enterprise',
    name: 'XPIDER Enterprise Plan',
    description: '30,000 AI tokens per month. Multi-Proxy Subnets, Custom Dev, 1:1 Engineering Support.',
    monthly_amount: 19900,  // $199.00
    yearly_amount:  159000, // $159.00/mo × 12 = $1908/yr (billed yearly)
    tokens: 30000
  }
];

async function main() {
  console.log('🚀 XPIDER Stripe 상품 자동 생성 시작...\n');

  const results = {};

  for (const plan of PLANS) {
    console.log(`📦 [${plan.id.toUpperCase()}] ${plan.name} 생성 중...`);

    // 1. Product 생성
    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: {
        xpider_plan: plan.id,
        tokens: String(plan.tokens)
      }
    });
    console.log(`   ✅ Product ID: ${product.id}`);

    // 2. 월간 가격 생성
    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.monthly_amount,
      currency: 'usd',
      recurring: { interval: 'month' },
      nickname: `${plan.name} — Monthly`,
      metadata: {
        xpider_plan: plan.id,
        billing_cycle: 'monthly'
      }
    });
    console.log(`   ✅ Monthly Price ID: ${monthlyPrice.id}`);

    // 3. 연간 가격 생성 (연간 총액 — 할인 20%)
    const yearlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.yearly_amount * 12,  // 연간 총액
      currency: 'usd',
      recurring: { interval: 'year' },
      nickname: `${plan.name} — Yearly (Save 20%)`,
      metadata: {
        xpider_plan: plan.id,
        billing_cycle: 'yearly'
      }
    });
    console.log(`   ✅ Yearly Price ID: ${yearlyPrice.id}\n`);

    results[plan.id] = {
      productId: product.id,
      monthly: monthlyPrice.id,
      yearly: yearlyPrice.id
    };
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ 모든 상품 생성 완료! 아래 Price ID를 복사하세요:\n');
  console.log(JSON.stringify(results, null, 2));
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('\n📋 stripe-service.js PRICE_IDS 섹션에 붙여넣을 코드:');
  console.log(`
const PRICE_IDS = {
  starter: {
    monthly: '${results.starter?.monthly}',
    yearly:  '${results.starter?.yearly}'
  },
  pro: {
    monthly: '${results.pro?.monthly}',
    yearly:  '${results.pro?.yearly}'
  },
  enterprise: {
    monthly: '${results.enterprise?.monthly}',
    yearly:  '${results.enterprise?.yearly}'
  }
};
  `);

  console.log('\n📋 stripe-webhook/index.ts PRICE_TO_PLAN 섹션에 붙여넣을 코드:');
  console.log(`
const PRICE_TO_PLAN: Record<string, string> = {
  "${results.starter?.monthly}":    "starter",
  "${results.pro?.monthly}":        "pro",
  "${results.enterprise?.monthly}": "enterprise",
  "${results.starter?.yearly}":     "starter",
  "${results.pro?.yearly}":         "pro",
  "${results.enterprise?.yearly}":  "enterprise",
};
  `);
}

main().catch(e => {
  console.error('❌ 오류 발생:', e.message);
  process.exit(1);
});
