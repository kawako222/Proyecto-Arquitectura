'use strict';

const { Router } = require('express');
const { habitacionService } = require('../../../../shared/services');

const router = Router();

/** GET /api/habitaciones?zona=VIP&estado=DISPONIBLE&disponibleDesde=2026-12-01&disponibleHasta=2026-12-05 */
router.get('/', async (req, res) => {
  const data = await habitacionService.listar(req.actor, req.query);
  res.json({ ok: true, total: data.length, data });
});

/** GET /api/habitaciones/resumen/zonas */
router.get('/resumen/zonas', async (req, res) => {
  res.json({ ok: true, data: await habitacionService.resumenPorZona(req.actor) });
});

/** GET /api/habitaciones/:id */
router.get('/:id', async (req, res) => {
  res.json({ ok: true, data: await habitacionService.obtener(req.actor, req.params.id) });
});

/** POST /api/habitaciones (ADMIN, maximo 29) */
router.post('/', async (req, res) => {
  res.status(201).json({ ok: true, data: await habitacionService.crear(req.actor, req.body) });
});

/** PUT /api/habitaciones/:id (ADMIN total; STAFF solo estado/notas) */
router.put('/:id', async (req, res) => {
  res.json({ ok: true, data: await habitacionService.actualizar(req.actor, req.params.id, req.body) });
});

/** DELETE /api/habitaciones/:id (ADMIN) */
router.delete('/:id', async (req, res) => {
  res.json({ ok: true, data: await habitacionService.eliminar(req.actor, req.params.id) });
});

module.exports = router;
