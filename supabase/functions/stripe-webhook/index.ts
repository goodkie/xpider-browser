// supabase/functions/stripe-webhook/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// XPIDER Stripe Webhook Handler — Supabase Edge Function
//
// 이 함수는 Stripe의 결제 이벤트를 수신하고 Supabase DB를 업데이트합니다.
//
// 처리하는 이벤트:
//   1. checkout.session.completed  → 최초 결제 완료 → 플랜/토큰 업데이트
//   2. invoice.paid                → 구독 갱신 → 토큰 월별 리셋
//   3. customer.subscription.updated → 플랜 변경 반영
//   4. customer.subscription.deleted → 구독 취소 → free 강등
//
// 설정 방법:
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
//   supabase functions deploy stripe-webhook
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16?target=deno";

// ─── 환경변수 ─────────────────────────────────────────────────────────────────
const STRIPE_SECRET_KEY     = Deno.env.get("STRIPE_SECRET_KEY") || "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const SUPABASE_URL          = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// ─── 플랜별 토큰량 정의 ───────────────────────────────────────────────────────
const PLAN_TOKENS: Record<string, number> = {
  free:       600,
  starter:    6000,
  pro:        12000,
  enterprise: 30000
};

// ─── Stripe Price ID → Plan ID 매핑 ──────────────────────────────────────────
// Stripe 대시보드에서 생성한 Price ID를 여기에 입력하세요.
const PRICE_TO_PLAN: Record<string, string> = {
  // Monthly
  "price_1TbKOfB7MnEthCwbdbwmLUCT": "starter",
  "price_1TbKOgB7MnEthCwb0pr4UDW2": "pro",
  "price_1TbKOgB7MnEthCwbaKqiz589": "enterprise",
  // Yearly
  "price_1TbKOfB7MnEthCwbjvqWXWVv": "starter",
  "price_1TbKOgB7MnEthCwb26wH27pY": "pro",
  "price_1TbKOhB7MnEthCwbK5ky1dZU": "enterprise",
};

// ─── Stripe 초기화 ───────────────────────────────────────────────────────────
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// ─── Supabase Admin 클라이언트 ────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── 유저 DB 업데이트 헬퍼 ───────────────────────────────────────────────────
async function updateUserSubscription(
  userId: string,
  plan: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
  subscriptionStatus: string,
  subscriptionEndAt: string | null,
  resetTokens: boolean
) {
  const tokens = resetTokens ? (PLAN_TOKENS[plan] || PLAN_TOKENS.free) : undefined;

  const updateData: Record<string, unknown> = {
    plan: plan,
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: stripeSubscriptionId,
    subscription_status: subscriptionStatus,
    subscription_end_at: subscriptionEndAt,
    last_active_at: new Date().toISOString()
  };

  if (tokens !== undefined) {
    updateData.tokens_remaining = tokens;
  }

  const { error } = await supabase
    .from("profiles")
    .update(updateData)
    .eq("id", userId);

  if (error) {
    console.error(`[Webhook] Failed to update user ${userId}:`, error.message);
    throw error;
  }

  console.log(`[Webhook] User ${userId} updated: plan=${plan}, tokens=${tokens ?? 'unchanged'}, status=${subscriptionStatus}`);
}

// ─── 이메일로 User ID 조회 ────────────────────────────────────────────────────
async function findUserByEmail(email: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();
  return data?.id || null;
}

// ─── 메인 핸들러 ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body      = await req.text();
  const signature = req.headers.get("stripe-signature") || "";

  // ── Webhook 서명 검증 ────────────────────────────────────────────────────
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[Webhook] Signature verification failed:", err);
    return new Response(`Webhook signature failed: ${err}`, { status: 400 });
  }

  console.log(`[Webhook] Received: ${event.type}`);

  try {
    switch (event.type) {

      // ── 1. 최초 결제 완료 ───────────────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // userId는 session metadata에서 가져옴 (stripe-service.js에서 설정)
        let userId = session.metadata?.xpider_user_id || "";
        const plan  = session.metadata?.xpider_plan || "starter";

        // userId 없으면 이메일로 조회
        if (!userId && session.customer_details?.email) {
          userId = (await findUserByEmail(session.customer_details.email)) || "";
        }

        if (!userId) {
          console.error("[Webhook] checkout.session.completed: No user ID found");
          break;
        }

        const customerId      = session.customer as string;
        const subscriptionId  = session.subscription as string;

        // 구독 상세 조회 (만료일 등)
        let endAt: string | null = null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          endAt = new Date(sub.current_period_end * 1000).toISOString();
        }

        await updateUserSubscription(
          userId, plan,
          customerId, subscriptionId,
          "active", endAt,
          true  // 토큰 리셋
        );
        break;
      }

      // ── 2. 구독 갱신 (매월/매년 자동결제) ───────────────────────────────
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        
        // 구독 첫 결제는 checkout.session.completed에서 처리하므로 스킵
        if (invoice.billing_reason === "subscription_create") break;

        const customerId     = invoice.customer as string;
        const subscriptionId = invoice.subscription as string;

        // Stripe Customer → Supabase 유저 조회
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, plan")
          .eq("stripe_customer_id", customerId)
          .single();

        if (!profile) {
          console.error(`[Webhook] invoice.paid: No profile found for customer ${customerId}`);
          break;
        }

        // 구독 상세에서 현재 플랜과 만료일 조회
        let plan = profile.plan || "starter";
        let endAt: string | null = null;

        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          endAt = new Date(sub.current_period_end * 1000).toISOString();

          // Price ID → Plan ID 매핑
          const priceId = sub.items.data[0]?.price?.id;
          if (priceId && PRICE_TO_PLAN[priceId]) {
            plan = PRICE_TO_PLAN[priceId];
          }
        }

        // 구독 갱신 → 토큰 리셋
        await updateUserSubscription(
          profile.id, plan,
          customerId, subscriptionId,
          "active", endAt,
          true  // 토큰 리셋
        );
        break;
      }

      // ── 3. 플랜 변경 ─────────────────────────────────────────────────────
      case "customer.subscription.updated": {
        const sub        = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        const { data: profile } = await supabase
          .from("profiles")
          .select("id, plan")
          .eq("stripe_customer_id", customerId)
          .single();

        if (!profile) break;

        // Price ID → 새 플랜
        const priceId = sub.items.data[0]?.price?.id;
        const newPlan = (priceId && PRICE_TO_PLAN[priceId]) ? PRICE_TO_PLAN[priceId] : profile.plan;
        const endAt   = new Date(sub.current_period_end * 1000).toISOString();
        const status  = sub.status === "active" ? "active" : sub.status;

        // 플랜 변경 시에만 토큰 리셋
        const shouldResetTokens = newPlan !== profile.plan;

        await updateUserSubscription(
          profile.id, newPlan,
          customerId, sub.id,
          status, endAt,
          shouldResetTokens
        );
        break;
      }

      // ── 4. 구독 취소 ─────────────────────────────────────────────────────
      case "customer.subscription.deleted": {
        const sub        = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (!profile) break;

        // Free 플랜으로 강등, 토큰 600으로 리셋
        await updateUserSubscription(
          profile.id, "free",
          customerId, sub.id,
          "canceled", null,
          true  // 무료 토큰(600)으로 리셋
        );
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event: ${event.type}`);
    }
  } catch (err) {
    console.error("[Webhook] Handler error:", err);
    return new Response(`Handler error: ${err}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
});
