import { createServer } from 'node:http'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import nodemailer from 'nodemailer'

const port = Number(process.env.PORT ?? 8025)
const mode = process.env.MAILER_MODE ?? 'local'
const apiToken = process.env.MAILER_API_TOKEN
const dataDirectory = process.env.MAILER_DATA_DIR ?? '/data'
const outboxPath = join(dataDirectory, 'outbox.json')
const inboxEnabled = process.env.MAILER_INBOX_ENABLED !== 'false'
const brevoApiUrl = process.env.BREVO_API_URL ?? 'https://api.brevo.com/v3/smtp/email'
const maxBodyBytes = 100_000
let smtpTransport
let outboxQueue = Promise.resolve()

if (!['local', 'smtp', 'brevo'].includes(mode)) {
  throw new Error('MAILER_MODE debe ser "local", "smtp" o "brevo".')
}
if (!apiToken) {
  throw new Error('Falta configurar MAILER_API_TOKEN.')
}

function json(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(payload))
}

function isAuthorized(request) {
  const header = request.headers.authorization ?? ''
  const supplied = Buffer.from(header.replace(/^Bearer\s+/i, ''))
  const expected = Buffer.from(apiToken)
  return /^Bearer\s+/i.test(header) && supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBodyBytes) {
      throw Object.assign(new Error('El cuerpo de la solicitud es demasiado grande.'), { status: 413 })
    }
    chunks.push(chunk)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('El cuerpo de la solicitud debe ser JSON válido.'), { status: 400 })
  }
}

async function readOutbox() {
  try {
    const data = await readFile(outboxPath, 'utf8')
    const messages = JSON.parse(data)
    if (!Array.isArray(messages)) throw new Error('El archivo de bandeja local no contiene una lista de mensajes.')
    return messages
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

async function writeOutbox(messages) {
  await mkdir(dataDirectory, { recursive: true })
  const temporaryPath = `${outboxPath}.${process.pid}.tmp`
  await writeFile(temporaryPath, JSON.stringify(messages), { mode: 0o600 })
  await rename(temporaryPath, outboxPath)
}

function updateOutbox(operation) {
  const pending = outboxQueue.then(async () => operation(await readOutbox()))
  outboxQueue = pending.then(() => undefined, () => undefined)
  return pending
}

function parseSender(rawFrom) {
  const value = (rawFrom ?? '').trim()
  if (!value) {
    throw new Error('Falta configurar MAIL_FROM.')
  }
  const angleMatch = value.match(/^(?:"?([^"<>]+?)"?\s*)?<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>$/)
  if (angleMatch) {
    const name = angleMatch[1]?.trim()
    const email = angleMatch[2].trim()
    return name ? { name, email } : { email }
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { email: value }
  }
  throw new Error('MAIL_FROM debe tener formato "Nombre <correo@dominio.com>" o "correo@dominio.com".')
}

function createSmtpTransport() {
  const host = process.env.SMTP_HOST
  const from = process.env.MAIL_FROM
  if (!host || !from) {
    throw new Error('El modo SMTP requiere SMTP_HOST y MAIL_FROM.')
  }

  const user = process.env.SMTP_USER
  const password = process.env.SMTP_PASSWORD
  if (user && !password) throw new Error('SMTP_PASSWORD es obligatorio cuando se configura SMTP_USER.')

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false',
    auth: user ? { user, pass: password } : undefined,
  })
}

async function deliverViaBrevo(message) {
  const apiKey = (process.env.BREVO_API_KEY ?? '').trim()
  if (!apiKey) {
    throw new Error('El modo Brevo requiere configurar BREVO_API_KEY.')
  }
  const sender = parseSender(process.env.MAIL_FROM)

  const response = await fetch(brevoApiUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender,
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
      htmlContent: message.html,
    }),
    signal: AbortSignal.timeout(7000),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Brevo API respondió con HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }
}

async function deliver(message) {
  if (mode === 'local') {
    await updateOutbox((messages) => {
      messages.unshift({ ...message, created_at: new Date().toISOString() })
      return writeOutbox(messages.slice(0, 100))
    })
    return
  }

  if (mode === 'brevo') {
    await deliverViaBrevo(message)
    return
  }

  smtpTransport ??= createSmtpTransport()
  await smtpTransport.sendMail({
    from: process.env.MAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  })
}

function renderInbox() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bandeja local · StatusHub</title>
  <style>
    :root{font:15px system-ui,sans-serif;color:#dbe4f0;background:#07101e}
    body{max-width:900px;margin:40px auto;padding:0 18px}
    header{display:flex;align-items:center;justify-content:space-between;gap:12px}
    h1{font-size:24px;color:#fff}.hint{color:#94a3b8;line-height:1.55}
    button{padding:9px 12px;border:1px solid #334155;border-radius:6px;color:#e2e8f0;background:#17243a;cursor:pointer}
    article{margin:14px 0;padding:16px;border:1px solid #27364d;border-radius:9px;background:#101c2e}
    article h2{margin:0 0 8px;font-size:16px;color:#fff}small{color:#94a3b8}
    pre{overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;color:#cbd5e1;line-height:1.5}
    a{color:#7dd3fc}.open-link{display:inline-block;margin:5px 0 0}
    #messages:empty:after{content:"Todavía no hay correos simulados.";display:block;padding:28px;color:#94a3b8;text-align:center}
  </style>
</head>
<body>
  <header><h1>Bandeja de correo local</h1><div><button id="refresh" type="button">Actualizar</button> <button id="clear" type="button">Vaciar bandeja</button></div></header>
  <p class="hint">Modo de desarrollo: los mensajes no se envían a ningún destinatario. Usa el enlace de recuperación para probar el flujo en StatusHub.</p>
  <p id="error" role="alert"></p>
  <main id="messages" aria-live="polite"></main>
  <script>
    const messages = document.querySelector('#messages');
    const error = document.querySelector('#error');
    async function loadMessages() {
      error.textContent = '';
      messages.replaceChildren();
      const response = await fetch('/api/messages', { cache: 'no-store' });
      if (!response.ok) throw new Error('No fue posible leer la bandeja local.');
      const data = await response.json();
      for (const message of data.messages) {
        const article = document.createElement('article');
        const subject = document.createElement('h2');
        subject.textContent = message.subject;
        const metadata = document.createElement('small');
        metadata.textContent = message.to + ' · ' + new Date(message.created_at).toLocaleString();
        const body = document.createElement('pre');
        body.textContent = message.text;
        article.append(subject, metadata, body);
        const match = message.text.match(/https?:\\/\\/[^\\s]+/);
        const href = match?.[0].replace(/[.,)]+$/, '');
        if (href && /^https?:\\/\\/[^\\s]+$/i.test(href)) {
          const link = document.createElement('a');
          link.href = href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.className = 'open-link';
          link.textContent = 'Abrir enlace de recuperación';
          article.append(link);
        }
        messages.append(article);
      }
    }
    document.querySelector('#refresh').addEventListener('click', () => loadMessages().catch((failure) => { error.textContent = failure.message; }));
    document.querySelector('#clear').addEventListener('click', async () => {
      if (!confirm('¿Vaciar los correos simulados?')) return;
      const response = await fetch('/api/messages', { method: 'DELETE' });
      if (!response.ok) { error.textContent = 'No fue posible vaciar la bandeja.'; return; }
      await loadMessages().catch((failure) => { error.textContent = failure.message; });
    });
    loadMessages().catch((failure) => { error.textContent = failure.message; });
  </script>
</body>
</html>`
}

async function handle(request, response) {
  const url = new URL(request.url, 'http://localhost')
  if (request.method === 'GET' && url.pathname === '/health') {
    return json(response, 200, { status: 'ok', mode })
  }
  if (request.method === 'GET' && url.pathname === '/') {
    if (mode !== 'local' || !inboxEnabled) return json(response, 404, { error: 'Bandeja local deshabilitada.' })
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(renderInbox())
    return
  }
  if (url.pathname === '/api/messages') {
    if (mode !== 'local' || !inboxEnabled) return json(response, 404, { error: 'Bandeja local deshabilitada.' })
    if (request.method === 'GET') return json(response, 200, { messages: await readOutbox() })
    if (request.method === 'DELETE') {
      await updateOutbox(() => writeOutbox([]))
      return json(response, 200, { message: 'Bandeja vaciada.' })
    }
  }
  if (request.method !== 'POST' || url.pathname !== '/api/send') {
    return json(response, 404, { error: 'Endpoint no encontrado.' })
  }
  if (!isAuthorized(request)) return json(response, 401, { error: 'Autenticación requerida.' })

  const message = await readJson(request)
  if (typeof message.to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)) {
    return json(response, 400, { error: 'El destinatario no es válido.' })
  }
  if (typeof message.subject !== 'string' || typeof message.text !== 'string' || typeof message.html !== 'string') {
    return json(response, 400, { error: 'Faltan campos del mensaje.' })
  }

  await deliver({
    to: message.to,
    subject: message.subject.slice(0, 200),
    text: message.text.slice(0, 20_000),
    html: message.html.slice(0, 40_000),
  })
  return json(response, 202, { accepted: true, mode })
}

const server = createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(`Error del adaptador de correo: ${error.message}`)
    if (!response.headersSent) json(response, error.status ?? 502, { error: 'No fue posible procesar el correo.' })
    else response.destroy()
  })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Adaptador de correo listo en el puerto ${port} (${mode}).`)
})
