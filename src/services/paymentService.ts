import crypto from 'crypto';
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  auditLogs,
  notifications,
  paymentEvents,
  payments,
  plans,
  subscriptions,
  users,
} from '../db/schema.ts';
import {
  checkMomoPaymentStatus,
  generateTransactionReference,
  getMomoConfigStatus,
  getMomoCurrency,
  hashMsisdn,
  isValidMtnRwandaMsisdn,
  maskPhone,
  normalizeRwandaMsisdn,
  requestMomoPayment,
} from './momo.ts';

export class PaymentServiceError extends Error {
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(message: string, statusCode = 400, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function sanitizePaymentForClient<T extends Record<string, any>>(payment: T): T {
  // Never expose raw payer hashes or internal sensitive fields to client responses
  const copy = { ...payment };
  delete copy.payerMsisdnHash;
  return copy;
}

export async function initiateMomoSubscriptionPayment(params: {
  user: { id: string; email: string; role: string };
  planSlug?: string;
  billingCycle?: string;
  phone: string;
  paymentConsent: boolean;
  idempotencyKey?: string;
  pin?: unknown;
  otp?: unknown;
  ipAddress?: string;
}) {
  // Explicit PIN/OTP rejection guard: 2MR must NEVER collect, store, or accept MoMo PINs
  if (params.pin !== undefined || params.otp !== undefined) {
    throw new PaymentServiceError(
      'Security policy violation: never enter your MTN MoMo PIN or OTP inside 2MR. Approve payments strictly on your handset.',
      400
    );
  }

  if (!params.paymentConsent) {
    throw new PaymentServiceError(
      'Explicit payment confirmation is required before sending an MTN Mobile Money request.',
      400
    );
  }

  const cfg = getMomoConfigStatus();
  if (cfg.environment === 'production' && !cfg.productionReady) {
    throw new PaymentServiceError(
      `Live MTN MoMo production activation is blocked pending official MTN onboarding/credentials. Missing or invalid configuration: ${[
        ...cfg.missingVars,
        ...cfg.warnings,
      ].join(', ')}`,
      503,
      { integrationConfigured: false, productionBlocked: true, momoConfig: cfg }
    );
  }

  if (!cfg.configured) {
    throw new PaymentServiceError(
      `MTN MoMo ${cfg.environment} credentials are not configured on the server (${cfg.missingVars.join(', ')}).`,
      503,
      { integrationConfigured: false, productionBlocked: cfg.environment === 'production', momoConfig: cfg }
    );
  }

  const msisdn = normalizeRwandaMsisdn(params.phone);
  if (!isValidMtnRwandaMsisdn(msisdn, cfg.environment)) {
    throw new PaymentServiceError(
      cfg.environment === 'production'
        ? 'Enter a valid MTN Rwanda mobile number (078XXXXXXX or 079XXXXXXX).'
        : 'Enter a valid Rwanda mobile number (e.g. 078XXXXXXX or +25078XXXXXXX) or MTN sandbox test MSISDN.',
      400
    );
  }

  const resolvedPlanSlug = params.planSlug === 'premium' ? 'premium' : 'premium';
  const [plan] = await db.select().from(plans).where(eq(plans.slug, resolvedPlanSlug)).limit(1);
  if (!plan) {
    throw new PaymentServiceError('Selected subscription plan was not found.', 404);
  }

  const cycle = params.billingCycle === 'annual' ? 'annual' : 'monthly';
  // Official price retrieved strictly from database (never trusted from client)
  const amountRwf = cycle === 'annual' ? plan.annualPriceRwf : plan.monthlyPriceRwf;
  const currency = 'RWF';
  const payerHash = hashMsisdn(msisdn);
  const maskedPhone = maskPhone(msisdn);
  const cleanIdempotencyKey = params.idempotencyKey
    ? String(params.idempotencyKey).trim().slice(0, 128)
    : null;

  // 1. Idempotency key check
  if (cleanIdempotencyKey) {
    const [existingByKey] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.userId, params.user.id), eq(payments.idempotencyKey, cleanIdempotencyKey)))
      .limit(1);

    if (existingByKey) {
      return {
        payment: sanitizePaymentForClient(existingByKey),
        deduplicated: true,
        integrationConfigured: true,
        providerStatus: existingByKey.status.toUpperCase(),
        message: 'Existing payment request returned for idempotency key.',
      };
    }
  }

  // 2. Duplicate rapid-submit guard (same user + cycle + phone within 90s while still pending)
  const ninetySecondsAgo = new Date(Date.now() - 90_000);
  const [recentPending] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.userId, params.user.id),
        eq(payments.planSlug, resolvedPlanSlug),
        eq(payments.billingCycle, cycle),
        eq(payments.payerMsisdnHash, payerHash),
        eq(payments.status, 'pending'),
        gt(payments.createdAt, ninetySecondsAgo)
      )
    )
    .orderBy(desc(payments.createdAt))
    .limit(1);

  if (recentPending) {
    return {
      payment: sanitizePaymentForClient(recentPending),
      deduplicated: true,
      integrationConfigured: true,
      providerStatus: 'PENDING',
      message: 'A pending MTN MoMo request for this subscription is already awaiting your handset confirmation.',
    };
  }

  // 3. Create unique UUID v4 X-Reference-Id & save PENDING transaction BEFORE calling MTN
  const referenceId = generateTransactionReference();
  const externalId = `2MR-${params.user.id.slice(0, 8)}-${Date.now()}`;
  const providerCurrency = getMomoCurrency(cfg.environment);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 min authorization window

  const [pendingPayment] = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(payments)
      .values({
        userId: params.user.id,
        transactionRef: referenceId,
        externalId,
        idempotencyKey: cleanIdempotencyKey,
        phoneMasked: maskedPhone,
        payerMsisdnHash: payerHash,
        amount: amountRwf,
        currency,
        provider: 'mtn_momo_rw',
        environment: cfg.environment,
        status: 'pending',
        reconciliationStatus: 'pending',
        planSlug: resolvedPlanSlug,
        billingCycle: cycle,
        expiresAt,
        createdAt: now,
        updatedAt: now,
        metadata: {
          environment: cfg.environment,
          targetEnvironment: cfg.targetEnvironment,
          providerCurrency,
          callbackConfigured: Boolean(cfg.callbackUrl),
        },
      })
      .returning();

    await tx.insert(paymentEvents).values({
      paymentId: inserted.id,
      transactionRef: referenceId,
      eventType: 'initiated',
      source: 'checkout',
      previousStatus: null,
      newStatus: 'pending',
      details: {
        environment: cfg.environment,
        amount: amountRwf,
        currency,
        providerCurrency,
        billingCycle: cycle,
      },
    });

    return [inserted];
  });

  // 4. Submit RequestToPay to official MTN endpoint
  const momoResult = await requestMomoPayment({
    referenceId,
    externalId,
    amount: amountRwf,
    currency,
    msisdn,
    payerMessage: `2MR Premium (${cycle})`,
    payeeNote: `2MR Subscription ${externalId}`,
  });

  let finalStatus = 'pending';
  let reconciliationStatus = 'pending';
  let failureReason: string | null = null;
  let eventType = 'provider_accepted';

  if (momoResult.initiated) {
    // HTTP 202 Accepted means MTN queued the prompt; payment is STILL PENDING!
    finalStatus = 'pending';
    reconciliationStatus = 'pending';
    eventType = 'provider_accepted';
  } else if (momoResult.providerStatus === 'FAILED') {
    finalStatus = 'failed';
    reconciliationStatus = 'not_needed';
    failureReason = momoResult.message;
    eventType = 'provider_declined';
  } else {
    // Network/5xx/SETUP_REQUIRED: do not lose track of the referenceId
    finalStatus = 'requires_reconciliation';
    reconciliationStatus = 'pending';
    failureReason = momoResult.message;
    eventType = 'reconciliation';
  }

  const updatedAt = new Date();
  const [updatedPayment] = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(payments)
      .set({
        status: finalStatus,
        reconciliationStatus,
        failureReason,
        updatedAt,
        metadata: {
          ...(pendingPayment.metadata || {}),
          providerHttpStatus: momoResult.httpStatus,
          providerAccepted202: momoResult.initiated,
        },
      })
      .where(eq(payments.id, pendingPayment.id))
      .returning();

    await tx.insert(paymentEvents).values({
      paymentId: pendingPayment.id,
      transactionRef: referenceId,
      eventType,
      source: 'checkout',
      previousStatus: 'pending',
      newStatus: finalStatus,
      details: {
        httpStatus: momoResult.httpStatus,
        providerStatus: momoResult.providerStatus,
        accepted: momoResult.initiated,
      },
    });

    await tx.insert(auditLogs).values({
      actorUserId: params.user.id,
      actorEmail: params.user.email,
      action: 'MOMO_PAYMENT_INITIATED',
      resource: 'payments',
      details: {
        transactionRef: referenceId,
        environment: cfg.environment,
        amount: amountRwf,
        currency,
        status: finalStatus,
        ipAddress: params.ipAddress || 'unknown',
      },
    });

    return [row];
  });

  return {
    payment: sanitizePaymentForClient(updatedPayment),
    deduplicated: false,
    integrationConfigured: momoResult.integrationConfigured,
    providerStatus: momoResult.providerStatus,
    message: momoResult.message,
  };
}

export async function verifyAndSyncMomoPayment(params: {
  transactionRef: string;
  source: 'status_poll' | 'mtn_callback' | 'admin_reconcile' | 'background_reconcile';
  expectedUserId?: string;
  actorEmail?: string;
}) {
  const [initialPayment] = await db
    .select()
    .from(payments)
    .where(eq(payments.transactionRef, params.transactionRef))
    .limit(1);

  if (!initialPayment) {
    throw new PaymentServiceError('Transaction not found.', 404);
  }

  if (params.expectedUserId && initialPayment.userId !== params.expectedUserId) {
    throw new PaymentServiceError('Access denied for this payment transaction.', 403);
  }

  if (initialPayment.isSynthetic || initialPayment.isDemoTransaction) {
    throw new PaymentServiceError('Synthetic demo transactions cannot be verified against live MTN MoMo.', 400);
  }

  // Already verified & settled
  if (initialPayment.status === 'successful') {
    return {
      payment: sanitizePaymentForClient(initialPayment),
      verified: true,
      alreadyVerified: true,
      integrationConfigured: true,
      message: 'Payment already verified and Premium subscription active.',
    };
  }

  // Query MTN's official Get RequestToPay Status API
  const check = await checkMomoPaymentStatus(initialPayment.transactionRef);
  if (!check.integrationConfigured) {
    return {
      payment: sanitizePaymentForClient(initialPayment),
      verified: false,
      integrationConfigured: false,
      message: check.reason || 'MTN MoMo API credentials are not configured on the server.',
    };
  }

  const now = new Date();
  const expectedProviderCurrency =
    initialPayment.environment === 'production'
      ? initialPayment.currency
      : getMomoCurrency('sandbox');

  return db.transaction(async (tx) => {
    // Lock row inside transaction so concurrent polls + callbacks cannot double-activate
    const lockedRes = await tx.execute(
      sql`SELECT * FROM payments WHERE id = ${initialPayment.id} FOR UPDATE`
    );
    const lockedRow: any = (lockedRes as any).rows?.[0];
    const [current] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, initialPayment.id))
      .limit(1);

    if (!current || !lockedRow) {
      throw new PaymentServiceError('Payment record unavailable.', 404);
    }

    if (current.status === 'successful') {
      return {
        payment: sanitizePaymentForClient(current),
        verified: true,
        alreadyVerified: true,
        integrationConfigured: true,
        message: 'Payment verified and Premium active.',
      };
    }

    let nextStatus = current.status;
    let nextReconcileStatus = current.reconciliationStatus;
    let nextFailureReason: string | null = check.reason || current.failureReason;
    let verifiedAt: Date | null = current.verifiedAt;
    let reconciledAt: Date | null = current.reconciledAt;
    let eventType = 'status_checked';
    let subscriptionId = current.subscriptionId;

    if (check.status === 'successful') {
      // STRICT VALIDATION BEFORE ACTIVATING PREMIUM:
      // 1. Amount check
      const amountMismatch =
        check.amount !== undefined && Math.round(check.amount) !== Number(current.amount);
      // 2. Currency check
      const currencyMismatch =
        check.currency !== undefined &&
        check.currency.toUpperCase() !== expectedProviderCurrency.toUpperCase() &&
        check.currency.toUpperCase() !== current.currency.toUpperCase();
      // 3. ExternalId check
      const externalIdMismatch =
        Boolean(check.externalId && current.externalId && check.externalId !== current.externalId);
      // 4. Payer MSISDN identity check
      const payerMismatch = Boolean(
        check.payerPartyId &&
          current.payerMsisdnHash &&
          hashMsisdn(check.payerPartyId) !== current.payerMsisdnHash
      );

      if (amountMismatch || currencyMismatch || externalIdMismatch || payerMismatch) {
        nextStatus = 'requires_reconciliation';
        nextReconcileStatus = 'mismatch';
        eventType = 'verification_mismatch';
        nextFailureReason = [
          amountMismatch ? `Amount mismatch (expected ${current.amount}, provider ${check.amount})` : null,
          currencyMismatch ? `Currency mismatch (expected ${expectedProviderCurrency}, provider ${check.currency})` : null,
          externalIdMismatch ? 'ExternalId mismatch' : null,
          payerMismatch ? 'Payer MSISDN mismatch' : null,
        ]
          .filter(Boolean)
          .join('; ');

        await tx.insert(auditLogs).values({
          actorUserId: current.userId,
          actorEmail: params.actorEmail || 'system',
          action: 'PAYMENT_VERIFICATION_MISMATCH',
          resource: 'payments',
          details: {
            transactionRef: current.transactionRef,
            reason: nextFailureReason,
            source: params.source,
          },
        });
      } else {
        // Verified SUCCESSFUL!
        nextStatus = 'successful';
        nextReconcileStatus = 'reconciled';
        nextFailureReason = null;
        verifiedAt = now;
        reconciledAt = now;
        eventType = 'subscription_activated';

        // Idempotent Premium Subscription Activation inside same DB transaction
        const [existingSub] = await tx
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.activatedByPaymentId, current.id))
          .limit(1);

        if (existingSub) {
          subscriptionId = existingSub.id;
        } else {
          const [plan] = await tx
            .select()
            .from(plans)
            .where(eq(plans.slug, current.planSlug || 'premium'))
            .limit(1);

          if (plan) {
            const durationDays = current.billingCycle === 'annual' ? 365 : 30;
            // If user already has an active future subscription, extend from its expiration
            const [activeSub] = await tx
              .select()
              .from(subscriptions)
              .where(
                and(
                  eq(subscriptions.userId, current.userId),
                  eq(subscriptions.status, 'active'),
                  gt(subscriptions.expiresAt, now)
                )
              )
              .orderBy(desc(subscriptions.expiresAt))
              .limit(1);

            const startsAt = now;
            const baseDate = activeSub ? new Date(activeSub.expiresAt) : now;
            const expiresAt = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

            const [createdSub] = await tx
              .insert(subscriptions)
              .values({
                userId: current.userId,
                planId: plan.id,
                activatedByPaymentId: current.id,
                status: 'active',
                billingCycle: current.billingCycle,
                startsAt,
                expiresAt,
                autoRenew: false,
                isSynthetic: false,
              })
              .returning();

            subscriptionId = createdSub.id;

            const [u] = await tx
              .select()
              .from(users)
              .where(eq(users.id, current.userId))
              .limit(1);

            if (u) {
              await tx
                .update(users)
                .set({
                  role: u.role === 'admin' ? 'admin' : 'premium',
                  aiQueriesLimit: plan.aiMonthlyLimit,
                  storageLimitMb: plan.storageLimitMb,
                  updatedAt: now,
                })
                .where(eq(users.id, u.id));
            }

            await tx.insert(notifications).values({
              userId: current.userId,
              category: 'subscription',
              title: '2MR Premium Activated',
              message: `Your MTN MoMo payment (${current.amount.toLocaleString()} ${current.currency}, ref ${current.transactionRef.slice(0, 8)}) has been verified. 2MR Premium is now active until ${expiresAt.toLocaleDateString()}.`,
            });

            await tx.insert(auditLogs).values({
              actorUserId: current.userId,
              actorEmail: u?.email || params.actorEmail || 'system',
              action: 'PREMIUM_SUBSCRIPTION_ACTIVATED',
              resource: 'subscriptions',
              details: {
                paymentId: current.id,
                transactionRef: current.transactionRef,
                providerRef: check.providerRef || null,
                subscriptionId: createdSub.id,
                environment: current.environment,
                source: params.source,
              },
            });
          }
        }
      }
    } else if (check.status === 'pending') {
      if (current.expiresAt && new Date(current.expiresAt) < now) {
        nextStatus = 'expired';
        nextReconcileStatus = 'reconciled';
        reconciledAt = now;
        nextFailureReason = 'Payment authorization window expired before confirmation.';
      } else {
        nextStatus = 'pending';
        nextReconcileStatus = 'pending';
        nextFailureReason = null;
      }
    } else if (check.status === 'failed' || check.status === 'rejected' || check.status === 'expired') {
      nextStatus = check.status;
      nextReconcileStatus = 'reconciled';
      reconciledAt = now;
      nextFailureReason = check.reason || `Provider reported transaction status: ${check.status.toUpperCase()}`;
    } else {
      // Unrecognized / transport failure -> flag for reconciliation, never activate Premium
      nextStatus = 'requires_reconciliation';
      nextReconcileStatus = 'pending';
      nextFailureReason = check.reason || 'Unresolved provider status; queued for reconciliation.';
    }

    const [updated] = await tx
      .update(payments)
      .set({
        status: nextStatus,
        reconciliationStatus: nextReconcileStatus,
        providerRef: check.providerRef || current.providerRef,
        subscriptionId,
        failureReason: nextFailureReason,
        lastCheckedAt: now,
        reconciledAt,
        verifiedAt,
        updatedAt: now,
      })
      .where(eq(payments.id, current.id))
      .returning();

    await tx.insert(paymentEvents).values({
      paymentId: current.id,
      transactionRef: current.transactionRef,
      eventType,
      source: params.source,
      previousStatus: current.status,
      newStatus: nextStatus,
      details: {
        rawProviderStatus: check.rawProviderStatus || null,
        providerRef: check.providerRef || null,
        httpStatus: check.httpStatus,
        reason: nextFailureReason,
      },
    });

    return {
      payment: sanitizePaymentForClient(updated),
      verified: nextStatus === 'successful',
      alreadyVerified: false,
      integrationConfigured: true,
      message:
        nextStatus === 'successful'
          ? 'Payment verified via MTN MoMo API. 2MR Premium is now active.'
          : nextFailureReason || `Current transaction status: ${nextStatus.toUpperCase()}`,
    };
  });
}

function normalizeClientIp(rawIp: string | undefined): string {
  if (!rawIp) return '';
  return rawIp.replace(/^::ffff:/, '').trim();
}

export async function handleMomoCallback(params: {
  body: Record<string, any>;
  headers: Record<string, string | string[] | undefined>;
  clientIp?: string;
}) {
  // 1. Optional MTN Gateway IP Allowlist enforcement
  const allowedIpsRaw = (process.env.MTN_MOMO_ALLOWED_IPS || '').trim();
  if (allowedIpsRaw) {
    const allowedSet = new Set(
      allowedIpsRaw
        .split(',')
        .map((ip) => ip.trim())
        .filter(Boolean)
    );
    const reqIp = normalizeClientIp(params.clientIp);
    const forwardedHeader = params.headers['x-forwarded-for'];
    const forwardedFirst = Array.isArray(forwardedHeader)
      ? forwardedHeader[0]
      : typeof forwardedHeader === 'string'
        ? forwardedHeader.split(',')[0]
        : '';
    const forwardedIp = normalizeClientIp(forwardedFirst);

    if (!allowedSet.has(reqIp) && (!forwardedIp || !allowedSet.has(forwardedIp))) {
      await db.insert(auditLogs).values({
        actorEmail: 'mtn-callback-guard',
        action: 'MOMO_CALLBACK_IP_REJECTED',
        resource: 'payments',
        details: { clientIp: reqIp || 'unknown' },
      });
      throw new PaymentServiceError('Callback origin IP is not on the authorized MTN allowlist.', 403);
    }
  }

  // 2. Optional webhook shared secret header (for reverse-proxy/gateway deployments)
  const webhookSecret = (process.env.MTN_MOMO_WEBHOOK_SECRET || '').trim();
  if (webhookSecret) {
    const provided =
      params.headers['x-webhook-secret'] ||
      params.headers['x-callback-secret'] ||
      params.headers['x-mtn-signature'];
    if (provided !== webhookSecret) {
      throw new PaymentServiceError('Unauthorized callback signature.', 401);
    }
  }

  const headerRef = params.headers['x-reference-id'];
  const ref =
    (typeof headerRef === 'string' ? headerRef : undefined) ||
    params.body?.referenceId ||
    params.body?.X_Reference_Id ||
    params.body?.externalId;

  if (!ref || typeof ref !== 'string') {
    throw new PaymentServiceError('Missing transaction referenceId in callback payload.', 400);
  }

  // Locate payment strictly by transactionRef (UUID v4) or externalId
  const cleanRef = ref.trim();
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.transactionRef, cleanRef))
    .limit(1);

  const resolvedPayment =
    payment ||
    (
      await db
        .select()
        .from(payments)
        .where(eq(payments.externalId, cleanRef))
        .limit(1)
    )[0];

  if (!resolvedPayment) {
    throw new PaymentServiceError('Referenced payment transaction not found.', 404);
  }

  // 3. Replay & Duplicate callback protection via payload SHA-256 hash
  const payloadHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(params.body || {}))
    .digest('hex');

  const [duplicateEvent] = await db
    .select()
    .from(paymentEvents)
    .where(
      and(
        eq(paymentEvents.transactionRef, resolvedPayment.transactionRef),
        eq(paymentEvents.payloadHash, payloadHash),
        inArray(paymentEvents.eventType, ['callback_received', 'callback_duplicate'])
      )
    )
    .limit(1);

  if (duplicateEvent) {
    await db.insert(paymentEvents).values({
      paymentId: resolvedPayment.id,
      transactionRef: resolvedPayment.transactionRef,
      eventType: 'callback_duplicate',
      source: 'mtn_callback',
      previousStatus: resolvedPayment.status,
      newStatus: resolvedPayment.status,
      payloadHash,
      details: { deduplicated: true },
    });
    return {
      received: true,
      deduplicated: true,
      status: resolvedPayment.status,
      transactionRef: resolvedPayment.transactionRef,
    };
  }

  await db.insert(paymentEvents).values({
    paymentId: resolvedPayment.id,
    transactionRef: resolvedPayment.transactionRef,
    eventType: 'callback_received',
    source: 'mtn_callback',
    previousStatus: resolvedPayment.status,
    newStatus: resolvedPayment.status,
    payloadHash,
    details: {
      reportedStatus: params.body?.status ? String(params.body.status).slice(0, 40) : null,
      clientIp: normalizeClientIp(params.clientIp) || 'unknown',
    },
  });

  // 4. NEVER trust callback payload status directly — verify via official MTN Get Status API!
  const verified = await verifyAndSyncMomoPayment({
    transactionRef: resolvedPayment.transactionRef,
    source: 'mtn_callback',
  });

  return {
    received: true,
    deduplicated: false,
    status: verified.payment.status,
    verified: verified.verified,
    transactionRef: resolvedPayment.transactionRef,
  };
}

export async function reconcilePendingMomoPayments(adminUser: { id: string; email: string }, limit = 20) {
  const candidates = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.isSynthetic, false),
        eq(payments.isDemoTransaction, false),
        eq(payments.provider, 'mtn_momo_rw'),
        inArray(payments.status, ['pending', 'requires_reconciliation'])
      )
    )
    .orderBy(desc(payments.createdAt))
    .limit(Math.min(50, Math.max(1, limit)));

  const results: Array<{ transactionRef: string; status: string; verified: boolean }> = [];
  for (const p of candidates) {
    try {
      const res = await verifyAndSyncMomoPayment({
        transactionRef: p.transactionRef,
        source: 'admin_reconcile',
        actorEmail: adminUser.email,
      });
      results.push({
        transactionRef: p.transactionRef,
        status: res.payment.status,
        verified: res.verified,
      });
    } catch {
      results.push({
        transactionRef: p.transactionRef,
        status: p.status,
        verified: false,
      });
    }
  }

  await db.insert(auditLogs).values({
    actorUserId: adminUser.id,
    actorEmail: adminUser.email,
    action: 'ADMIN_BATCH_PAYMENT_RECONCILE',
    resource: 'payments',
    details: { checkedCount: results.length },
  });

  return results;
}
