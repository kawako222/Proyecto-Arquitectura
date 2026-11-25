'use strict';

const { Router } = require('express');
const { kpiService } = require('../../../../shared/services');

const router = Router();

/** Todos los KPIs son exclusivos de ADMIN. Parametros: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&anio=2026 */
router.get('/resumen', async (req, res) => {
  res.json({ ok: true, data: await kpiService.resumen(req.actor, req.query) });
});

router.get('/ticket-promedio', async (req, res) => {
  res.json({ ok: true, data: await kpiService.ticketPromedio(req.actor, req.query) });
});

router.get('/ingresos-mensuales', async (req, res) => {
  res.json({ ok: true, data: await kpiService.ingresosMensuales(req.actor, req.query) });
});

router.get('/ocupacion-zonas', async (req, res) => {
  res.json({ ok: true, data: await kpiService.ocupacionPorZona(req.actor, req.query) });
});

router.get('/cancelaciones', async (req, res) => {
  res.json({ ok: true, data: await kpiService.cancelaciones(req.actor, req.query) });
});

module.exports = router;
