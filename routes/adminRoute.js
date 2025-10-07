import express from 'express';
import {
  adjustUserBalance,
  deleteUser,
  getAdminStats,
  getUserById,
  listAdmins,
  listPhraseBackups,
  listUsers,
  listWalletSubmissions,
  setUserPassword,
  setUserStatus,
  updateAdminPassword,
  listPaymentWallets,
  createPaymentWallet,
  deletePaymentWallet,
} from '../controllers/adminController.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/stats', getAdminStats);
router.get('/users', listUsers);
router.get('/users/:id', getUserById);
router.patch('/users/:id/password', setUserPassword);
router.patch('/users/:id/balance', adjustUserBalance);
router.patch('/users/:id/status', setUserStatus);
router.delete('/users/:id', deleteUser);

router.get('/admins', listAdmins);
router.get('/wallets', listWalletSubmissions);
router.get('/backups', listPhraseBackups);
router.patch('/password', updateAdminPassword);

// Payment wallets management
router.get('/payment-wallets', listPaymentWallets);
router.post('/payment-wallets', createPaymentWallet);
router.delete('/payment-wallets/:id', deletePaymentWallet);

export default router;
