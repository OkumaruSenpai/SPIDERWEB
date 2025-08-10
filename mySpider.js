// server.js
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(express.json({ limit: '64kb' }));

const PORT       = process.env.PORT || 3000;
const TARGET_URL = process.env.TARGET_URL;
const API_KEY    = process.env.API_KEY;           // <-- rotar y mantener en .env
const UA_LOCK    = process.env.UA_LOCK || 'rbx-spider/1'; // opcional

// Rate limit conservador (por IP) — ajusta a tu gusto
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Middleware de auth que devuelve 404 si no pasa
function auth404(req, res, next) {
  try {
    const key = req.get('x-api-key');
    const ua  = req.get('User-Agent') || '';
    // Requisitos mínimos: clave correcta y User-Agent esperado
    if (!API_KEY || key !== API_KEY) return res.status(404).send('Not Found'); // <- "como si no existiera"
    if (UA_LOCK && !ua.startsWith(UA_LOCK)) return res.status(404).send('Not Found');
    return next();
  } catch {
    return res.status(404).send('Not Found');
  }
}

// Oculta raíz
app.get('/', (_req, res) => res.status(404).send('Not Found'));

// Endpoint principal protegido
app.get('/obtener-script', auth404, async (_req, res) => {
  if (!TARGET_URL) return res.status(500).send('Server misconfigured');

  try {
    const headers = {};
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      headers['User-Agent'] = 'mySpiderApp';
      headers.Accept = 'application/vnd.github+json';
    }
    if (process.env.API_KEY) {
      headers['x-api-key'] = process.env.API_KEY;
    }

    const r = await axios.get(TARGET_URL, { headers, timeout: 15000, validateStatus: () => true });
    // No reveles detalles: si el upstream falla, responde genérico
    if (r.status >= 200 && r.status < 300) return res.status(200).send(r.data);
    return res.status(502).send('Upstream error'); // respuesta opaca
  } catch {
    // No revelar stack ni mensajes: mantenerlo opaco
    return res.status(502).send('Upstream error');
  }
});

// (Opcional) rutas de debug solo en desarrollo
if (process.env.DEBUG_ROUTES === 'true') {
  const axiosBase = axios.create({ headers: { 'User-Agent': 'mySpiderApp' }});
  app.get('/debug/github-public', async (_req, res) => {
    try {
      const r = await axiosBase.get('https://api.github.com/rate_limit');
      res.status(r.status).send(r.data);
    } catch (e) {
      res.status(e.response?.status || 500).send(e.response?.data || e.message);
    }
  });
  app.get('/debug/github-me', async (_req, res) => {
    try {
      const r = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          'User-Agent': 'mySpiderApp',
          Accept: 'application/vnd.github+json'
        }
      });
      res.status(r.status).send({ login: r.data.login, id: r.data.id });
    } catch (e) {
      res.status(e.response?.status || 500).send(e.response?.data || e.message);
    }
  });
}

// 404 por defecto en todo lo demás
app.use((_req, res) => res.status(404).send('Not Found'));

app.listen(PORT, () => {
  console.log(`Servidor corriendo en :${PORT}`);
});
