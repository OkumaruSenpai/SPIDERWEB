// server.js
// Express con clave API (x-api-key) para proteger /obtener-script
// Responde 401 "No autorizado" si falta o es incorrecta la clave.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const axios = require('axios');

const app = express();
app.disable('x-powered-by');

const PORT        = process.env.PORT || 3000;
const TARGET_URL  = process.env.TARGET_URL;       // URL del script remoto (GitHub/raw/lo que uses)
const API_KEY     = process.env.API_KEY;          // Clave que deben enviar los clientes
const DEBUG_ROUTES = process.env.DEBUG_ROUTES === 'true'; // Rutas de debug opcionales

// ---------- Middleware de Auth ----------
function requireApiKey(req, res, next) {
  // Lee cabecera x-api-key
  const key = req.get('x-api-key');
  if (!API_KEY || key !== API_KEY) {
    // Cambia a 404 si prefieres "como si no existiera":
    // return res.status(404).send('Not Found');
    return res.status(401).send('¿Que haces aqui?');
  }
  next();
}

// ---------- Ocultar raíz ----------
app.get('/', (_req, res) => res.status(404).send('Not Found'));

// ---------- Endpoint protegido ----------
app.get('/obtener-script', requireApiKey, async (_req, res) => {
  if (!TARGET_URL) return res.status(500).send('Server misconfigured');

  try {
    // Headers para el upstream si lo necesitas (GitHub token, etc.)
    const upstreamHeaders = {};
    if (process.env.GITHUB_TOKEN) {
      upstreamHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      upstreamHeaders['User-Agent'] = 'mySpiderApp';
      upstreamHeaders.Accept = 'application/vnd.github+json';
    }
    // Si tu upstream también requiere otra API key, usa una variable distinta:
    if (process.env.UPSTREAM_API_KEY) {
      upstreamHeaders['x-api-key'] = process.env.UPSTREAM_API_KEY;
    }

    // validateStatus: aceptamos cualquier status y lo manejamos nosotros
    const r = await axios.get(TARGET_URL, {
      headers: upstreamHeaders,
      timeout: 15000,
      validateStatus: () => true
    });

    if (r.status >= 200 && r.status < 300) {
      // Entrega el contenido tal cual (tu script Lua ofuscado, etc.)
      return res.status(200).send(r.data);
    }
    // Respuesta opaca en fallos del upstream (no revelar detalles)
    return res.status(502).send('Upstream error');
  } catch (_e) {
    return res.status(502).send('Upstream error');
  }
});

// ---------- (Opcional) Rutas de debug solo si DEBUG_ROUTES=true ----------
if (DEBUG_ROUTES) {
  app.get('/debug/github-public', async (_req, res) => {
    try {
      const r = await axios.get('https://api.github.com/rate_limit', {
        headers: { 'User-Agent': 'mySpiderApp' }
      });
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

// ---------- 404 por defecto ----------
app.use((_req, res) => res.status(404).send('Not Found'));

// ---------- Arranque ----------
app.listen(PORT, () => {
  console.log(`Servidor corriendo en :${PORT}`);
});
