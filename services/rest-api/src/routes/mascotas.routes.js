'use strict';

const { Router } = require('express');
const { mascotaService } = require('../../../../shared/services');

const router = Router();

/** GET /api/mascotas?nombre=can&tutor=<id> (CLIENTE solo ve las suyas) */
router.get('/', async (req, res) => {
  const data = await mascotaService.listar(req.actor, req.query);
  res.json({ ok: true, total: data.length, data });
});

/** GET /api/mascotas/:id (incluye estadoVacunas) */
router.get('/:id', async (req, res) => {
  res.json({ ok: true, data: await mascotaService.obtener(req.actor, req.params.id) });
});

/** POST /api/mascotas */
router.post('/', async (req, res) => {
  res.status(201).json({ ok: true, data: await mascotaService.crear(req.actor, req.body) });
});

/** PUT /api/mascotas/:id */
router.put('/:id', async (req, res) => {
  res.json({ ok: true, data: await mascotaService.actualizar(req.actor, req.params.id, req.body) });
});

/** DELETE /api/mascotas/:id */
router.delete('/:id', async (req, res) => {
  res.json({ ok: true, data: await mascotaService.eliminar(req.actor, req.params.id) });
});

module.exports = router;
