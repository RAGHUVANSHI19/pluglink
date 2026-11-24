import { Router } from 'express';
import { managementRouter } from './domain-management.js';
import { paymentReviewRouter } from './payment-review.js';
import { marketplaceRouter } from './domain-marketplace.js';

export function domainRouter(): Router {
  const router = Router();
  router.use(marketplaceRouter(), managementRouter(), paymentReviewRouter());
  return router;
}
