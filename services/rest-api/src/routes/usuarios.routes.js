'use strict';

const { Router } = require('express');
const { authService } = require('../../../../shared/services');

const router = Router();

/** GET /api/usuarios?rol=CLIENTE (ADMIN todos; STAFF solo clientes) */
router.get('/', async (req, res) => {
  res.json({ ok: true, data: await authService.listarUsuarios(req.actor, req.query) });
});

/** POST /api/usuarios (ADMIN) { nombre, email, password, rol } */
router.post('/', async (req, res) => {
  res.status(201).json({ ok: true, data: await authService.crearUsuario(req.actor, req.body) });
});

/** PUT /api/usuarios/:id (ADMIN) */
router.put('/:id', async (req, res) => {
  res.json({ ok: true, data: await authService.actualizarUsuario(req.actor, req.params.id, req.body) });
});

/** DELETE /api/usuarios/:id (ADMIN, desactivacion logica) */
router.delete('/:id', async (req, res) => {
  res.json({ ok: true, data: await authService.eliminarUsuario(req.actor, req.params.id) });
});

module.exports = router;
