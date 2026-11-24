import { Router } from 'express';
import { managementRouter } from './domain-management.js';
import { marketplaceRouter } from './domain-marketplace.js';

export function domainRouter(): Router {
  const router = Router();
  router.use(marketplaceRouter(), managementRouter());
  return router;
}
