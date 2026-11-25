'use strict';

const { Router } = require('express');
const { reservacionService } = require('../../../../shared/services');

const router = Router();

/** POST /api/reservaciones/cotizar -> calcula precio sin guardar */
router.post('/cotizar', async (req, res) => {
  res.json({ ok: true, data: await reservacionService.cotizar(req.actor, req.body) });
});

/** GET /api/reservaciones?estado=CONFIRMADA,EN_CURSO&zona=VIP&desde=&hasta=&page=1&limit=50 */
router.get('/', async (req, res) => {
  const data = await reservacionService.listar(req.actor, req.query);
  res.json({ ok: true, total: data.length, data });
});

/** GET /api/reservaciones/:id */
router.get('/:id', async (req, res) => {
  res.json({ ok: true, data: await reservacionService.obtener(req.actor, req.params.id) });
});

/** POST /api/reservaciones  { mascota, zona|habitacion, fechaEntrada, fechaSalida, servicios[], confirmar } */
router.post('/', async (req, res) => {
  res.status(201).json({ ok: true, data: await reservacionService.crear(req.actor, req.body) });
});

/** PUT /api/reservaciones/:id -> cambia fechas, habitacion, servicios o notas (recalcula montos) */
router.put('/:id', async (req, res) => {
  res.json({ ok: true, data: await reservacionService.actualizar(req.actor, req.params.id, req.body) });
});

/** DELETE /api/reservaciones/:id (ADMIN; solo COTIZACION o CANCELADA sin pagos) */
router.delete('/:id', async (req, res) => {
  res.json({ ok: true, data: await reservacionService.eliminar(req.actor, req.params.id) });
});

/* ---------- Acciones del ciclo de vida ---------- */
router.post('/:id/confirmar', async (req, res) => {
  res.json({ ok: true, data: await reservacionService.confirmar(req.actor, req.params.id) });
});

router.post('/:id/validar-medica', async (req, res) => {
  res.json({ ok: true, data: await reservacionService.validarMedica(req.actor, req.params.id, req.body) });
});

router.post('/:id/check-in', async (req, res) => {
  res.json({ ok: true, data: await reservacionService.checkIn(req.actor, req.params.id, req.body) });
});

router.post('/:id/pagos', async (req, res) => {
  res.status(201).json({ ok: true, data: await reservacionService.registrarPago(req.actor, req.params.id, req.body) });
});

router.post('/:id/check-out', async (req, res) => {
  res.json({ ok: true, data: await reservacionService.checkOut(req.actor, req.params.id, req.body) });
});

router.post('/:id/cancelar', async (req, res) => {
  res.json({ ok: true, data: await reservacionService.cancelar(req.actor, req.params.id, req.body) });
});

module.exports = router;
