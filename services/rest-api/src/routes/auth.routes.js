'use strict';

const { Router } = require('express');
const { authService } = require('../../../../shared/services');
const { COOKIE_NAME, opcionesCookie, requireAuth } = require('../middleware/auth');

const router = Router();

/** POST /api/auth/register  -> crea un CLIENTE y abre sesion */
router.post('/register', async (req, res) => {
  const { usuario, token } = await authService.registrar(req.body);
  res.cookie(COOKIE_NAME, token, opcionesCookie());
  res.status(201).json({ ok: true, data: { usuario, token } });
});

/** POST /api/auth/login -> cookie HttpOnly + token (para clientes no-navegador) */
router.post('/login', async (req, res) => {
  const { usuario, token } = await authService.login(req.body);
  res.cookie(COOKIE_NAME, token, opcionesCookie());
  res.json({ ok: true, data: { usuario, token } });
});

/** POST /api/auth/logout */
router.post('/logout', (req, res) => {
  const { maxAge, ...opciones } = opcionesCookie();
  res.clearCookie(COOKIE_NAME, opciones);
  res.json({ ok: true, data: { mensaje: 'Sesión cerrada' } });
});

/** GET /api/auth/me */
router.get('/me', requireAuth(), async (req, res) => {
  res.json({ ok: true, data: await authService.perfil(req.actor) });
});

module.exports = router;
