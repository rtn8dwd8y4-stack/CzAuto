import { Router } from 'express';
import { getMonitorStatus } from '../emailMonitor';
import { getInboundStatus } from '../inboundMonitor';

const router = Router();

router.get('/', (_req, res) => {
  const monitors = [getMonitorStatus(), getInboundStatus()];
  const now = Date.now();
  const statusList = monitors.map((m) => {
    const ageMin = m.lastSuccessAt ? Math.round((now - m.lastSuccessAt.getTime()) / 60000) : null;
    return {
      name: m.name,
      lastSuccessAt: m.lastSuccessAt,
      healthy: ageMin !== null && ageMin <= 15,
      staleMinutes: ageMin,
    };
  });
  res.json({ success: true, monitors: statusList });
});

export default router;
