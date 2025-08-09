// mySpider.js (diagnóstico)
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const TARGET_URL = process.env.TARGET_URL;

// Logs al iniciar (no imprime los secretos)
console.log('cwd:', process.cwd());
console.log('dirname:', __dirname);
console.log('TARGET_URL:', TARGET_URL || '(no definida)');
console.log('Tiene GITHUB_TOKEN?', Boolean(process.env.GITHUB_TOKEN));
console.log('Tiene API_KEY?', Boolean(process.env.API_KEY));

app.get('/', (_req, res) => {
  res.send('Servidor OK. Prueba /obtener-script');
});

// Endpoint principal que usa env
app.get('/obtener-script', async (_req, res) => {
  try {
    if (!TARGET_URL) return res.status(500).send('Falta TARGET_URL en .env');

    const headers = {};
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      headers['User-Agent'] = 'mySpiderApp';
      headers.Accept = 'application/vnd.github+json';
    }
    if (process.env.API_KEY) {
      headers['x-api-key'] = process.env.API_KEY;
    }

    console.log('Llamando a:', TARGET_URL, 'con headers:', Object.keys(headers));
    const r = await axios.get(TARGET_URL, { headers, timeout: 15000 });
    console.log('Respuesta externa:', r.status);
    res.status(r.status).send(r.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const body = error.response?.data || error.message;
    console.error('Fallo en axios:', status, body);
    res.status(status).send(body);
  }
});

// PRUEBA 1: endpoint público de GitHub (sin token)
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

// PRUEBA 2: endpoint autenticado de GitHub (requiere token)
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

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
