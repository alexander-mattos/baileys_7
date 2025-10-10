import 'dotenv/config'
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { Boom } from '@hapi/boom'
import NodeCache from '@cacheable/node-cache'
import readline from 'readline'
import makeWASocket, { AnyMessageContent, BinaryInfo, CacheStore, delay, DisconnectReason, downloadAndProcessHistorySyncNotification, encodeWAM, fetchLatestBaileysVersion, getAggregateVotesInPollMessage, getHistoryMsg, isJidNewsletter, jidDecode, makeCacheableSignalKeyStore, normalizeMessageContent, PatchedMessageWithRecipientJID, proto, useMultiFileAuthState, WAMessageContent, WAMessageKey } from '../src'
import P from 'pino'

const logger = P({
	level: "trace",
	transport: {
		targets: [
			{
				target: "pino-pretty", // pretty-print for console
				options: { colorize: true },
				level: "trace",
			},
			{
				target: "pino/file", // raw file output
				options: { destination: './wa-logs.txt' },
				level: "trace",
			},
		],
	},
})
logger.level = 'trace'

const doReplies = process.argv.includes('--do-reply')
const usePairingCode = process.argv.includes('--use-pairing-code')

// external map to store retry counts of messages when decryption/encryption fails
// keep this out of the socket itself, so as to prevent a message decryption/encryption loop across socket restarts
const msgRetryCounterCache = new NodeCache() as CacheStore

const onDemandMap = new Map<string, string>()

// Read line interface
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text: string) => new Promise<string>((resolve) => rl.question(text, resolve))

/**
 * Shared state for UI
 * - sharedSock: assigned when socket is created
 * - currentQR: last QR string emitted by connection.update
 * - currentPairingCode: last pairing code issued (if any)
 * - lastConnectionUpdate: last connection.update object
 */
let sharedSock: any = null
let currentQR: string | undefined = undefined
let currentPairingCode: string | undefined = undefined
let lastConnectionUpdate: any = undefined

// persistence for UI state (simple JSON file in ./tmp)
const TMP_DIR = path.join(process.cwd(), 'tmp')
const UI_STATE_FILE = path.join(TMP_DIR, 'baileys-ui-state.json')

function ensureTmpDir(){
	try { if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true }) } catch (e) { /* ignore */ }
}

function loadUIState(){
	try{
		if (!fs.existsSync(UI_STATE_FILE)) return
		const raw = fs.readFileSync(UI_STATE_FILE, 'utf8')
		const obj = JSON.parse(raw)
		currentQR = obj.qr
		currentPairingCode = obj.pairingCode
		lastConnectionUpdate = obj.lastConnectionUpdate
		logger.info({ file: UI_STATE_FILE }, 'loaded ui state from disk')
	}catch(e:any){
		logger.warn({ e }, 'failed to load ui state')
	}
}

function saveUIState(){
	try{
		ensureTmpDir()
		const toSave = {
			qr: currentQR || null,
			pairingCode: currentPairingCode || null,
			lastConnectionUpdate: lastConnectionUpdate || null,
			savedAt: (new Date()).toISOString()
		}
		fs.writeFileSync(UI_STATE_FILE, JSON.stringify(toSave, null, 2), 'utf8')
	}catch(e:any){
		logger.warn({ e }, 'failed to save ui state')
	}
}

// load persisted state on startup
ensureTmpDir()
loadUIState()
// Simple token for protecting UI and endpoints. Set ADMIN_TOKEN in env for production.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN
if (!ADMIN_TOKEN) logger.warn('No ADMIN_TOKEN set in env - endpoints will be accessible without token')
else {
	logger.info('ADMIN_TOKEN loaded from environment')
}

// start a connection
const startSock = async () => {
	const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')
	// fetch latest version of WA Web
	const { version, isLatest } = await fetchLatestBaileysVersion()
	console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`)

	const sock = makeWASocket({
		version,
		logger,
		auth: {
			creds: state.creds,
			/** caching makes the store faster to send/recv messages */
			keys: makeCacheableSignalKeyStore(state.keys, logger),
		},
		msgRetryCounterCache,
		generateHighQualityLinkPreview: true,
		// ignore all broadcast messages -- to receive the same
		// comment the line below out
		// shouldIgnoreJid: jid => isJidBroadcast(jid),
		// implement to handle retries & poll updates
		getMessage
	})

	// expose sock to the UI endpoints
	sharedSock = sock

	// Pairing code for Web clients (keeps original behaviour, but also stores the code for UI)
	if (usePairingCode && !sock.authState.creds.registered) {
		// todo move to QR event
		const phoneNumber = await question('Please enter your phone number:\n')
		const code = await sock.requestPairingCode(phoneNumber)
		currentPairingCode = code
		console.log(`Pairing code: ${code}`)
			try { logger.info({ pairingCode: currentPairingCode }, 'pairing code issued (console visible)') } catch (e) {}
			// persist pairing code
			saveUIState()
	}

	const sendMessageWTyping = async (msg: AnyMessageContent, jid: string) => {
		await sock.presenceSubscribe(jid)
		await delay(500)

		await sock.sendPresenceUpdate('composing', jid)
		await delay(2000)

		await sock.sendPresenceUpdate('paused', jid)

		await sock.sendMessage(jid, msg)
	}

	// the process function lets you process all events that just occurred
	// efficiently in a batch
	sock.ev.process(
		// events is a map for event name => event data
		async (events) => {
			// something about the connection changed
			// maybe it closed, or we received all offline message or connection opened
			if (events['connection.update']) {
				const update = events['connection.update']
				const { connection, lastDisconnect } = update

					// --- update shared UI state ---
				// store QR so the webpage can display it
				if (update.qr) {
					currentQR = update.qr
						// persist UI state
						saveUIState()
					// log a short prefix of the QR for debugging (do not log full QR in prod)
					try { logger.info({ qr: currentQR?.slice?.(0,40) }, 'qr updated') } catch (e) {}
				} else if (update.connection === 'open') {
					// clear QR & pairing code when connection opens successfully
					currentQR = undefined
					currentPairingCode = undefined
						// persist UI state
						saveUIState()
					try { logger.info('connection opened, cleared qr and pairingCode') } catch (e) {}
				}
					lastConnectionUpdate = update
					// persist last connection info
					saveUIState()
				// --- end shared UI state update ---

				if (connection === 'close') {
					// reconnect if not logged out
					if ((lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut) {
						startSock()
					} else {
						console.log('Connection closed. You are logged out.')
					}
				}

				console.log('connection update', update)
			}

			// credentials updated -- save them
			if (events['creds.update']) {
				await saveCreds()
			}

			if (events['labels.association']) {
				console.log(events['labels.association'])
			}


			if (events['labels.edit']) {
				console.log(events['labels.edit'])
			}

			if (events.call) {
				console.log('recv call event', events.call)
			}

			// history received
			if (events['messaging-history.set']) {
				const { chats, contacts, messages, isLatest, progress, syncType } = events['messaging-history.set']
				if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
					console.log('received on-demand history sync, messages=', messages)
				}
				console.log(`recv ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest}, progress: ${progress}%), type: ${syncType}`)
			}

			// received a new message
			if (events['messages.upsert']) {
				const upsert = events['messages.upsert']
				console.log('recv messages ', JSON.stringify(upsert, undefined, 2))

				if (!!upsert.requestId) {
					console.log("placeholder message received for request of id=" + upsert.requestId, upsert)
				}



				if (upsert.type === 'notify') {
					for (const msg of upsert.messages) {
						if (msg.message?.conversation || msg.message?.extendedTextMessage?.text) {
							const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text
							if (text == "requestPlaceholder" && !upsert.requestId) {
								const messageId = await sock.requestPlaceholderResend(msg.key)
								console.log('requested placeholder resync, id=', messageId)
							}

							// go to an old chat and send this
							if (text == "onDemandHistSync") {
								const messageId = await sock.fetchMessageHistory(50, msg.key, msg.messageTimestamp!)
								console.log('requested on-demand sync, id=', messageId)
							}

							if (!msg.key.fromMe && doReplies && !isJidNewsletter(msg.key?.remoteJid!)) {

								console.log('replying to', msg.key.remoteJid)
								await sock!.readMessages([msg.key])
								await sendMessageWTyping({ text: 'Hello there!' }, msg.key.remoteJid!)
							}
						}
					}
				}
			}

			// messages updated like status delivered, message deleted etc.
			if (events['messages.update']) {
				console.log(
					JSON.stringify(events['messages.update'], undefined, 2)
				)

				for (const { key, update } of events['messages.update']) {
					if (update.pollUpdates) {
						const pollCreation: proto.IMessage = {} // get the poll creation message somehow
						if (pollCreation) {
							console.log(
								'got poll update, aggregation: ',
								getAggregateVotesInPollMessage({
									message: pollCreation,
									pollUpdates: update.pollUpdates,
								})
							)
						}
					}
				}
			}

			if (events['message-receipt.update']) {
				console.log(events['message-receipt.update'])
			}

			if (events['messages.reaction']) {
				console.log(events['messages.reaction'])
			}

			if (events['presence.update']) {
				console.log(events['presence.update'])
			}

			if (events['chats.update']) {
				console.log(events['chats.update'])
			}

			if (events['contacts.update']) {
				for (const contact of events['contacts.update']) {
					if (typeof contact.imgUrl !== 'undefined') {
						const newUrl = contact.imgUrl === null
							? null
							: await sock!.profilePictureUrl(contact.id!).catch(() => null)
						console.log(
							`contact ${contact.id} has a new profile pic: ${newUrl}`,
						)
					}
				}
			}

			if (events['chats.delete']) {
				console.log('chats deleted ', events['chats.delete'])
			}
		}
	)

	return sock

	async function getMessage(key: WAMessageKey): Promise<WAMessageContent | undefined> {
		// Implement a way to retreive messages that were upserted from messages.upsert
		// up to you

		// only if store is present
		return proto.Message.create({ conversation: 'test' })
	}
}

// note: startSock is not called automatically on process start for VPS use.
// Use the UI button which calls POST /connect to initiate the socket.

/**
 * Minimal UI server: 
 * - GET /           -> serves simple HTML + JS that polls /status and renders QR + pairing code
 * - GET /status     -> returns { qr, pairingCode, connection }
 * - POST /pair-code -> body: { "phone": "<country+number>" }, triggers requestPairingCode and returns { pairingCode }
 *
 * NOTE: This is intentionally minimal. Protect these endpoints if exposing to public networks.
 */
const server = http.createServer(async (req, res) => {
	try {
		const url = req.url || '/'
		// GET / -> html UI
		if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
			const html = `
<!doctype html>
<html>
<head>
	<meta charset="utf-8"/>
	<title>Baileys - Connect</title>
	<style>
		body { font-family: Arial, sans-serif; padding: 20px; }
		#qrcode { width: 300px; height: 300px; margin-bottom: 12px; }
		#pair { font-size: 1.2em; color: #333; }
		#conn { margin-top: 8px; color: #666; }
		.box { display:flex; gap:20px; align-items:flex-start; }
		#connectBtn { padding: 12px 18px; font-size:16px }
	</style>
</head>
<body>
	<h1>Baileys - WhatsApp Connector</h1>
	<div style="margin-bottom:12px;">
		<label style="margin-right:12px">Token:
			<input id="uiToken" placeholder="paste admin token" style="width:300px"/>
		</label>
		<button id="saveTokenBtn">Salvar Token</button>
		<button id="connectBtn">Conectar WhatsApp</button>
		<span id="connectMsg" style="margin-left:12px;color:green"></span>
	</div>
	<div class="box">
		<div>
			<div id="qrcode"></div>
			<div id="conn"></div>
		</div>
		<div>
			<div><strong>Pairing code:</strong></div>
			<pre id="pair">-</pre>

			<form id="pairForm">
				<label>Phone (for pairing code)<br/>
					<input type="text" id="phone" placeholder="+55119XXXXYYYY" style="width:220px"/>
				</label>
				<div style="margin-top:8px;">
					<button type="submit">Request Pairing Code</button>
				</div>
			</form>

			<div id="msg" style="color:green;margin-top:8px"></div>
		</div>
	</div>

	<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
	<script>
		const qrContainer = document.getElementById('qrcode')
		const pairEl = document.getElementById('pair')
		const connEl = document.getElementById('conn')
		const msgEl = document.getElementById('msg')
		const connectBtn = document.getElementById('connectBtn')
		const connectMsg = document.getElementById('connectMsg')
		let qrcode = null

		async function fetchStatus(){
			try {
				const token = localStorage.getItem('uiToken')
				const r = await fetch('/status', token ? { headers: { 'Authorization': 'Bearer ' + token } } : undefined)
				const j = await r.json()
				// show connection
				connEl.textContent = 'connection: ' + (j.connection?.connection || '-') 
				// update pairing code
				pairEl.textContent = j.pairingCode || '-'
				// update QR
				if (j.qr) {
					if (!qrcode) {
						qrcode = new QRCode(qrContainer, { text: j.qr, width: 300, height: 300 })
					} else {
						qrContainer.innerHTML = ''
						qrcode = new QRCode(qrContainer, { text: j.qr, width: 300, height: 300 })
					}
				} else {
					// clear
					qrContainer.innerHTML = '<div style="color:#999">QR not available</div>'
				}
			} catch (e) {
				connEl.textContent = 'error fetching status'
			}
		}

		// poll every 1s
		setInterval(fetchStatus, 1000)
		fetchStatus()

		// save token button
		document.getElementById('saveTokenBtn').addEventListener('click', () => {
			const el = document.getElementById('uiToken')
			// avoid TS-only casts in embedded HTML; use plain JS to read value or textContent
			const raw = (el && (el.value !== undefined ? el.value : el.textContent)) || ''
			const t = String(raw).trim()
			if (!t) return alert('enter token')
			localStorage.setItem('uiToken', t)
			alert('token saved')
		})

		// connect button
		connectBtn.addEventListener('click', async () => {
			connectMsg.textContent = ''
			connectBtn.disabled = true
			try {
				const token = localStorage.getItem('uiToken')
				const r = await fetch('/connect', token ? { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } } : { method: 'POST' })
				const j = await r.json()
				if (r.ok) {
					connectMsg.style.color = 'green'
					connectMsg.textContent = j.message || 'Conectando...'
				} else {
					connectMsg.style.color = 'red'
					connectMsg.textContent = j.error || 'erro'
					connectBtn.disabled = false
				}
			} catch (err) {
				connectMsg.style.color = 'red'
				connectMsg.textContent = 'network error'
				connectBtn.disabled = false
			}
		})

		// pairing form
		document.getElementById('pairForm').addEventListener('submit', async (ev) => {
			ev.preventDefault()
			msgEl.textContent = ''
			const phone = document.getElementById('phone').value.trim()
			if (!phone) { msgEl.textContent = 'enter phone'; return }
			try {
				const token = localStorage.getItem('uiToken')
				const headers = Object.assign({ 'Content-Type': 'application/json' }, token ? { 'Authorization': 'Bearer ' + token } : {})
				const r = await fetch('/pair-code', {
					method: 'POST',
					headers,
					body: JSON.stringify({ phone })
				})
				const j = await r.json()
				if (r.ok) {
					msgEl.textContent = 'Pairing code requested. Check the displayed code.'
				} else {
					msgEl.style.color = 'red'
					msgEl.textContent = j.error || 'error'
				}
			} catch (err) {
				msgEl.style.color = 'red'
				msgEl.textContent = 'network error'
			}
		})
	</script>
</body>
</html>
`
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
			res.end(html)
			return
		}

		// helper: require auth for protected endpoints
		const requireAuth = () => {
			try {
				if (!ADMIN_TOKEN) return true // no token configured -> allow (dev)
				const auth = (req.headers['authorization'] as string) || undefined
				if (auth && auth.startsWith('Bearer ')) {
					return auth.slice(7) === ADMIN_TOKEN
				}
				// allow token in query param for convenience: ?token=...
				try {
					const u = new URL(req.url || '/', 'http://localhost')
					const q = u.searchParams.get('token')
					if (q) return q === ADMIN_TOKEN
				} catch (e) {}
				return false
			} catch (e) {
				return false
			}
		}

		// GET /status -> json
		if (req.method === 'GET' && req.url === '/status') {
			if (!requireAuth()) {
				res.writeHead(401, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify({ error: 'unauthorized' }))
				return
			}
			// log minimal info for debugging
			logger.debug({ url: req.url }, 'incoming /status request')

			// Build a safe connection object to avoid circular references
			const safeConnection: any = {}
			if (lastConnectionUpdate) {
				safeConnection.connection = lastConnectionUpdate.connection
				if (lastConnectionUpdate.qr) safeConnection.qr = lastConnectionUpdate.qr
				if (lastConnectionUpdate.lastDisconnect) {
					const ld = lastConnectionUpdate.lastDisconnect
					safeConnection.lastDisconnect = {
						// prefer plain message/string and date
						message: ld?.error?.message || ld?.error || null,
						statusCode: (ld?.error as any)?.output?.statusCode || ld?.statusCode || null,
						date: ld?.date ? (new Date(ld.date)).toISOString() : (ld?.date || null)
					}
				}
			}

			res.writeHead(200, { 'Content-Type': 'application/json' })
			res.end(JSON.stringify({
				qr: currentQR || null,
				pairingCode: currentPairingCode || null,
				connection: safeConnection
			}))
			return
		}

		// POST /connect -> triggers startSock() to initiate connection
		if (req.method === 'POST' && req.url === '/connect') {
			if (!requireAuth()) {
				res.writeHead(401, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify({ error: 'unauthorized' }))
				return
			}
			// prevent multiple concurrent starts
			try {
				if (sharedSock) {
					res.writeHead(200, { 'Content-Type': 'application/json' })
					res.end(JSON.stringify({ message: 'socket already started' }))
					return
				}
				// call startSock but don't await to avoid blocking response
				startSock().then(() => logger.info('startSock() finished')).catch(e => logger.error({ e }, 'startSock error'))
				res.writeHead(200, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify({ message: 'starting' }))
				return
			} catch (e:any) {
				res.writeHead(500, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify({ error: e?.message || 'failed to start' }))
				return
			}
		}

		// POST /pair-code -> { phone } -> calls requestPairingCode on socket
		if (req.method === 'POST' && req.url === '/pair-code') {
			if (!requireAuth()) {
				res.writeHead(401, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify({ error: 'unauthorized' }))
				return
			}
			let body = ''
			req.on('data', chunk => body += chunk)
			req.on('end', async () => {
				try {
					const data = body ? JSON.parse(body) : {}
					const phone = data.phone
					if (!phone) {
						res.writeHead(400, { 'Content-Type': 'application/json' })
						res.end(JSON.stringify({ error: 'phone required' }))
						return
					}
					if (!sharedSock) {
						res.writeHead(500, { 'Content-Type': 'application/json' })
						res.end(JSON.stringify({ error: 'socket not ready' }))
						return
					}
					// call requestPairingCode - this will store to currentPairingCode below
					try {
						const code = await sharedSock.requestPairingCode(phone)
						currentPairingCode = code
						res.writeHead(200, { 'Content-Type': 'application/json' })
						res.end(JSON.stringify({ pairingCode: code }))
					} catch (err: any) {
						// persist pairing code
						saveUIState()

						res.writeHead(500, { 'Content-Type': 'application/json' })
						res.end(JSON.stringify({ error: err?.message || 'failed to request pairing code' }))
					}
				} catch (err: any) {
					res.writeHead(400, { 'Content-Type': 'application/json' })
					res.end(JSON.stringify({ error: 'invalid json' }))
				}
			})
			return
		}

		// POST /send -> { jid, message } -> sends a text message via sharedSock
		if (req.method === 'POST' && req.url === '/send') {
			if (!requireAuth()) {
				res.writeHead(401, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify({ error: 'unauthorized' }))
				return
			}
			let body = ''
			req.on('data', chunk => body += chunk)
			req.on('end', async () => {
				try {
					const data = body ? JSON.parse(body) : {}
					const jid = data.jid // ex: "552141216120@s.whatsapp.net"
					const message = data.message // string text
					if (!jid || !message) {
						res.writeHead(400, { 'Content-Type': 'application/json' })
						res.end(JSON.stringify({ error: 'jid and message are required' }))
						return
					}
					if (!sharedSock) {
						res.writeHead(500, { 'Content-Type': 'application/json' })
						res.end(JSON.stringify({ error: 'socket not ready' }))
						return
					}
					try {
						// send text message
						const result = await sharedSock.sendMessage(jid, { text: message })
						// result may contain message ID and ack info. Return it to the caller.
						res.writeHead(200, { 'Content-Type': 'application/json' })
						res.end(JSON.stringify({ ok: true, result }))
					} catch (sendErr: any) {
						logger.error({ sendErr }, 'failed to send message')
						res.writeHead(500, { 'Content-Type': 'application/json' })
						res.end(JSON.stringify({ error: sendErr?.message || 'failed to send message' }))
					}
				} catch (err: any) {
					res.writeHead(400, { 'Content-Type': 'application/json' })
					res.end(JSON.stringify({ error: 'invalid json' }))
				}
			})
			return
		}

		// fallback
		res.writeHead(404, { 'Content-Type': 'text/plain' })
		res.end('Not Found')
	} catch (err) {
		res.writeHead(500, { 'Content-Type': 'text/plain' })
		res.end('Server error')
	}
})

const PORT = process.env.PORT ? Number(process.env.PORT) : 3333
server.listen(PORT, () => logger.info({ port: PORT }, 'Baileys HTTP server listening'))

// save UI state before exit
process.on('exit', () => saveUIState())
process.on('SIGINT', () => { saveUIState(); process.exit() })
process.on('SIGTERM', () => { saveUIState(); process.exit() })