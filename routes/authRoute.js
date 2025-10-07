import express from 'express';
import { login, register, me, updateMe, googleAuthStart, googleAuthCallback, listLoginStamps } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', login);
router.post('/register', register);
router.get('/me', requireAuth, me);
router.patch('/me', requireAuth, updateMe);
router.get('/logins', requireAuth, listLoginStamps);
// Google OAuth
router.get('/google/start', googleAuthStart);
router.get('/google/callback', googleAuthCallback);

export default router;
