import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { revokeSession, sessionRoom } from '../services/authSessionService';

const router = Router();
router.get('/session', authenticate, (req, res) => {
  res.json({ success: true, data: { userType: req.user!.userType, status: req.user!.accountStatus } });
});
router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  const token = req.headers.authorization!.substring(7);
  await revokeSession(token);
  req.app.get('io')?.in(sessionRoom(token)).disconnectSockets(true);
  res.json({ success: true, message: 'Logged out successfully' });
}));
export default router;
