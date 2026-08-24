import { Router } from 'express';
import { getActiveTaxes, getAllTaxes, createTax, updateTaxStatus } from '../modules/seller/controllers/taxController';
import { authenticate, requireUserType } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Reads: sellers need the tax list when creating products; admins manage them.
router.get('/active', requireUserType('Seller', 'Admin'), getActiveTaxes);
router.get('/', requireUserType('Seller', 'Admin'), getAllTaxes);

// Writes: tax configuration is platform-level and is Admin-only. These used to
// sit behind `authenticate` alone, so any logged-in customer or courier could
// create tax rates or disable them. (#H-13)
router.post('/', requireUserType('Admin'), createTax);
router.patch('/:id/status', requireUserType('Admin'), updateTaxStatus);

export default router;
