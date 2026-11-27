import { Router } from 'express';
import { z } from 'zod';
import { allowRoles, isUuid, requireAuth, requireMerchantContext } from '../../middleware/auth.ts';
import {
  createSubscriptionInvoice,
  listMerchantSubscriptionInvoices,
  reconcileSubscriptionInvoiceForMerchant,
} from './service.ts';

const createInvoiceBody = z.object({
  planCode: z.string().trim().min(2).max(40),
  billingPeriodDays: z.number().int().min(30).max(365).optional(),
});

export const subscriptionBillingRouter = Router();
subscriptionBillingRouter.use(requireAuth, requireMerchantContext);

subscriptionBillingRouter.get('/invoices', async (req, res, next) => {
  try {
    const invoices = await listMerchantSubscriptionInvoices(req.auth!.merchantId);
    res.json(invoices);
  } catch (err) {
    next(err);
  }
});

subscriptionBillingRouter.post('/invoices', allowRoles('MERCHANT_OWNER'), async (req, res, next) => {
  try {
    const input = createInvoiceBody.parse(req.body);
    const invoice = await createSubscriptionInvoice({
      merchantId: req.auth!.merchantId,
      actorUserId: req.auth!.sub,
      planCode: input.planCode,
      billingPeriodDays: input.billingPeriodDays,
    });
    res.status((invoice as { reusedExisting?: boolean }).reusedExisting ? 200 : 201).json(invoice);
  } catch (err) {
    next(err);
  }
});

subscriptionBillingRouter.post('/invoices/:id/reconcile', allowRoles('MERCHANT_OWNER'), async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Invoice langganan tidak ditemukan' });
    const result = await reconcileSubscriptionInvoiceForMerchant(req.params.id, req.auth!.merchantId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
