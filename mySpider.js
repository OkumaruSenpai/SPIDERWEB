// mySpider.js (seguro para Railway)
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false, // no servimos HTML dinámico aquí
  crossOriginResourcePolicy: { policy: 'same-site' }
}));

// CORS: BLOQUEADO por defecto (solo si lo necesitas, abre orígenes específicos)
// const cors = require('cors');
// app.use(cors({ origin: ['https://tu-dominio'], methods: ['GET'] }));

const PORT          = process.env.PORT || 3000;
const TARGET_URL    = process.env.TARGET_URL;             // RAW del .lua o README
const API_KEY       = process.env.API_KEY || '';          // requerido
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN || '';
const SIGNING_SECRET = process.env.SIGNING_SECRET || '';  // opcional para HMAC

// Rate limit (defensa básica)
app.set('trust proxy', 1);
app.use(rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false }));

// --- Middleware auth con API Key ---
function apiKeyGuard(req, res, next) {
  if (!API_KEY) return res.status(500).json({ ok:false, code:'MISSING_API_KEY' });
  const key = req.get('x-api-key');
  if (key && key === API_KEY) return next();
  return res.status(401).json({ ok:false, code:'UNAUTHORIZED' });
}

// --- (Opcional) Firma HMAC: x-sign y x-ts ---
// En Roblox firmas body vacío: HMAC_SHA256( ts + '\n' + 'GET /obtener-script' , SIGNING_SECRET )
const crypto = require('crypto');
function hmacGuard(req, res, next) {
  if (!SIGNING_SECRET) return next(); // desactivado si no hay secreto
  const ts = req.get('x-ts');
  const sig = req.get('x-sign');
  if (!ts || !sig) return res.status(401).json({ ok:false, code:'MISSING_SIGNATURE' });

  // Evita replays (5 min)
  const drift = Math.abs(Date.now() - Number(ts));
  if (!Number.isFinite(+ts) || drift > 5 * 60 * 1000) {
    return res.status(401).json({ ok:false, code:'STALE_TIMESTAMP' });
  }

  const base = `${ts}\nGET /obtener-script`;
  const expected = crypto.createHmac('sha256', SIGNING_SECRET).update(base).digest('hex');
  if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return next();
  return res.status(401).json({ ok:false, code:'BAD_SIGNATURE' });
}

// --- Raíz: no revelar info ---
app.get('/', (_req, res) => res.status(404).send(''));

// --- ÚNICO endpoint expuesto ---
app.get('/obtener-script', apiKeyGuard, hmacGuard, async (req, res) => {
  try {
    if (!TARGET_URL) return res.status(500).json({ ok:false, code:'MISSING_TARGET_URL' });

    const headers = { 'User-Agent': 'spiderweb-proxy', 'Accept': 'text/plain' };
    if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

    const r = await axios.get(TARGET_URL, { headers, responseType: 'text', timeout: 15000 });

    // No caches largas en intermediarios
    res.set('Cache-Control', 'no-store');
    res.type('text/plain').status(200).send(r.data);
  } catch (e) {
    const status = e.response?.status || 500;
    res.status(status).json({ ok:false, code:'UPSTREAM_ERROR', status, detail: e.message });
  }
});

// Nada de rutas de debug en producción

app.listen(PORT, () => {
  console.log(`Servidor listo en :${PORT}`);
});
