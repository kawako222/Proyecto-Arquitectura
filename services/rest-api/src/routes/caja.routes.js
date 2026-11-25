'use strict';

const { Router } = require('express');
const { cajaService } = require('../../../../shared/services');

const router = Router();

/** GET /api/caja/estado -> turno abierto y totales en vivo */
router.get('/estado', async (req, res) => {
  res.json({ ok: true, data: await cajaService.estadoActual(req.actor) });
});

/** POST /api/caja/turnos/abrir { montoInicial, notas } */
router.post('/turnos/abrir', async (req, res) => {
  res.status(201).json({ ok: true, data: await cajaService.abrirTurno(req.actor, req.body) });
});

/** POST /api/caja/turnos/cerrar { efectivoContado, notas } */
router.post('/turnos/cerrar', async (req, res) => {
  res.json({ ok: true, data: await cajaService.cerrarTurno(req.actor, req.body) });
});

/** GET /api/caja/turnos?estado=CERRADO */
router.get('/turnos', async (req, res) => {
  res.json({ ok: true, data: await cajaService.listarTurnos(req.actor, req.query) });
});

/** GET /api/caja/turnos/:id (incluye movimientos) */
router.get('/turnos/:id', async (req, res) => {
  res.json({ ok: true, data: await cajaService.obtenerTurno(req.actor, req.params.id) });
});

/** GET /api/caja/movimientos?tipo=GASTO&desde=&hasta= */
router.get('/movimientos', async (req, res) => {
  res.json({ ok: true, data: await cajaService.listarMovimientos(req.actor, req.query) });
});

/** POST /api/caja/movimientos { tipo, categoria, concepto, monto, metodoPago } */
router.post('/movimientos', async (req, res) => {
  res.status(201).json({ ok: true, data: await cajaService.registrarMovimiento(req.actor, req.body) });
});

module.exports = router;
