// =============================================
// VLTV Play — server.js FINAL
// =============================================

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const TMDB_API_KEY   = process.env.TMDB_API_KEY   || '9b73f5dd15b8165b1b57419be2f29128';
const FOOTBALL_KEY   = process.env.FOOTBALL_KEY   || '';
const PORT           = process.env.PORT || 3000;
const STATIC_DIR     = path.join(__dirname, 'public');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.ico':  'image/x-icon',
    '.svg':  'image/svg+xml',
    '.json': 'application/json',
    '.webp': 'image/webp',
};

const SYSTEM_INSTRUCTION = `Você é o assistente virtual oficial da VLTV Play, um serviço de IPTV premium brasileiro.
Responda SEMPRE em português do Brasil, com tom simpático, objetivo e profissional.
Nunca se identifique como IA genérica ou mencione o Google ou Gemini — você é o Assistente VLTV.

== SAUDAÇÕES ==
Se o usuário disser "bom dia", "boa tarde", "boa noite", "olá", "oi", "tudo bem" ou qualquer saudação, responda de forma amigável e pergunte como pode ajudar com o VLTV Play.

== PLANOS E PREÇOS ==
- Plano Mensal:     R$ 40/mês    | 1 dispositivo simultâneo | HD, Full HD e 4K
- Plano Trimestral: R$ 110/3 meses | todos os benefícios | grade completa de canais
- Plano Semestral:  R$ 210/6 meses | Mais Vendido | servidores dedicados | EPG | suporte prioritário
- Plano Anual:      R$ 400/ano   | máxima economia | suporte 24h | acesso Ultra Premium
- Plano Vitalício:  R$ 569 (pagamento único) | sem mensalidades | suporte VIP permanente

== TESTE GRATUITO ==
- Duração: 3 horas de acesso completo.
- Solicitar: clicar em "Solicitar Teste Grátis" no site ou falar pelo WhatsApp.
- Liberado imediatamente pela equipe.

== FIDELIDADE E CANCELAMENTO ==
- NÃO há fidelidade em nenhum plano.
- Cancele quando quiser, sem multa ou burocracia.

== INTERNET ==
- Necessário ter conexão com a internet.
- Recomendamos pelo menos 10 Mbps para HD e 25 Mbps para 4K.

== DISPOSITIVOS COMPATÍVEIS ==
- Celular (Android e iOS), TV Smart, Notebook, Computador, Fire Stick, TV Box, Roku TV.
- Instale em quantos aparelhos quiser; acesso simultâneo depende do plano.

== FORMAS DE PAGAMENTO ==
- PIX: ativação IMEDIATA em minutos.
- Cartão de Crédito: ativação em até 1 hora.
- Boleto Bancário: até 2 dias úteis, ou imediata enviando comprovante pelo WhatsApp.

== ATIVAÇÃO ==
Credenciais enviadas pelo WhatsApp com tutorial passo a passo.

== SUPORTE ==
WhatsApp direto com a equipe. Suporte prioritário nos planos Semestral e Anual. VIP no Vitalício.

== COPA DO MUNDO 2026 ==
Todos os jogos disponíveis ao vivo no VLTV Play em HD e 4K, incluindo todos os jogos do Brasil.

== REGRAS ==
- Responda saudações normalmente como um atendente faria.
- Se não souber algo, oriente pelo WhatsApp.
- Respostas curtas e diretas — máximo 3 parágrafos.
- Nunca invente preços ou funcionalidades.`;

function sendJSON(res, status, obj) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(obj));
}

function serveStatic(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Cache-Control': 'public, max-age=300',
        });
        res.end(data);
    });
}

function callTMDB(tmdbPath) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.themoviedb.org',
            path: tmdbPath,
            method: 'GET',
            headers: { 'Accept': 'application/json' },
        }, (apiRes) => {
            let raw = '';
            apiRes.on('data', chunk => raw += chunk);
            apiRes.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(new Error('TMDB inválido')); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function callFootball(endpoint) {
    return new Promise((resolve, reject) => {
        if (!FOOTBALL_KEY) return resolve({ response: [] });
        const req = https.request({
            hostname: 'v3.football.api-sports.io',
            path: '/' + endpoint,
            method: 'GET',
            headers: { 'x-apisports-key': FOOTBALL_KEY, 'Accept': 'application/json' },
        }, (apiRes) => {
            let raw = '';
            apiRes.on('data', chunk => raw += chunk);
            apiRes.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(new Error('Football inválido')); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// ── Gemini usando v1 (estável) com gemini-2.0-flash ──
function callGemini(history) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            contents: history,
            generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
        });

        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        }, (apiRes) => {
            let raw = '';
            apiRes.on('data', chunk => raw += chunk);
            apiRes.on('end', () => {
                console.log('[Gemini] HTTP Status:', apiRes.statusCode);
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed.error) {
                        console.error('[Gemini] Erro da API:', JSON.stringify(parsed.error));
                    }
                    resolve({ data: parsed, status: apiRes.statusCode });
                } catch (e) {
                    console.error('[Gemini] Resposta não é JSON:', raw.slice(0, 300));
                    reject(new Error('Gemini resposta inválida'));
                }
            });
        });

        req.on('error', (e) => {
            console.error('[Gemini] Erro de conexão:', e.message);
            reject(e);
        });
        req.write(body);
        req.end();
    });
}

async function fetchNowPlayingFiltered(page) {
    page = page || 1;
    const today = new Date().toISOString().split('T')[0];
    const past60 = new Date();
    past60.setDate(past60.getDate() - 60);
    const past60Str = past60.toISOString().split('T')[0];
    return callTMDB(
        `/3/discover/movie?api_key=${TMDB_API_KEY}&language=pt-BR` +
        `&sort_by=release_date.desc` +
        `&primary_release_date.gte=${past60Str}` +
        `&primary_release_date.lte=${today}` +
        `&page=${page}`
    );
}

async function fetchUpcomingFiltered() {
    const today = new Date().toISOString().split('T')[0];
    let all = [];
    for (let page = 1; page <= 3; page++) {
        const data = await callTMDB(
            `/3/discover/movie?api_key=${TMDB_API_KEY}&language=pt-BR` +
            `&sort_by=release_date.asc&primary_release_date.gte=${today}&page=${page}`
        );
        if (data.results && data.results.length) all = all.concat(data.results);
    }
    const seen = new Set();
    return all
        .filter(m => {
            if (!m.release_date || m.release_date < today || seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
        })
        .sort((a, b) => a.release_date.localeCompare(b.release_date))
        .slice(0, 20);
}

const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    const reqPath = parsed.pathname;

    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        });
        res.end();
        return;
    }

    if (reqPath === '/api/nowplaying' && req.method === 'GET') {
        try {
            const page = parseInt(parsed.query.page || '1', 10);
            sendJSON(res, 200, await fetchNowPlayingFiltered(page));
        } catch (err) {
            console.error('[nowplaying]', err.message);
            sendJSON(res, 500, { error: 'Erro nowplaying' });
        }
        return;
    }

    if (reqPath === '/api/upcoming' && req.method === 'GET') {
        try {
            sendJSON(res, 200, { results: await fetchUpcomingFiltered() });
        } catch (err) {
            console.error('[upcoming]', err.message);
            sendJSON(res, 500, { error: 'Erro upcoming' });
        }
        return;
    }

    if (reqPath === '/api/tmdb' && req.method === 'GET') {
        const endpoint = parsed.query.endpoint || '';
        if (!endpoint) return sendJSON(res, 400, { error: 'endpoint obrigatório' });
        const sep = endpoint.includes('?') ? '&' : '?';
        try {
            sendJSON(res, 200, await callTMDB(`/3/${endpoint}${sep}api_key=${TMDB_API_KEY}`));
        } catch (err) {
            console.error('[tmdb]', err.message);
            sendJSON(res, 500, { error: 'Erro TMDB' });
        }
        return;
    }

    if (reqPath === '/api/football' && req.method === 'GET') {
        const endpoint = parsed.query.endpoint || '';
        if (!endpoint) return sendJSON(res, 400, { error: 'endpoint obrigatório' });
        try {
            sendJSON(res, 200, await callFootball(endpoint));
        } catch (err) {
            console.error('[football]', err.message);
            sendJSON(res, 500, { error: 'Erro Football' });
        }
        return;
    }

    if (reqPath === '/api/chat' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { history } = JSON.parse(body);
                if (!Array.isArray(history) || !history.length) {
                    return sendJSON(res, 400, { error: 'history inválido' });
                }

                if (!GEMINI_API_KEY) {
                    console.error('[chat] GEMINI_API_KEY não configurada!');
                    return sendJSON(res, 200, { reply: 'Assistente em manutenção. Fale pelo WhatsApp! 💬' });
                }

                console.log('[chat] Chamando Gemini com', history.length, 'mensagem(ns)...');
                const result = await callGemini(history);

                if (result.data.error) {
                    console.error('[chat] Gemini retornou erro:', JSON.stringify(result.data.error));
                    return sendJSON(res, 200, { reply: 'Não consigo responder agora. Fale pelo WhatsApp! 💬' });
                }

                const reply =
                    result.data?.candidates?.[0]?.content?.parts?.[0]?.text
                    || 'Não entendi sua pergunta. Pode repetir?';

                console.log('[chat] Resposta OK ✓');
                sendJSON(res, 200, { reply });

            } catch (err) {
                console.error('[chat] Exceção:', err.message);
                sendJSON(res, 500, { error: 'Erro interno' });
            }
        });
        return;
    }

    let filePath = path.join(STATIC_DIR, reqPath === '/' ? 'index.html' : reqPath);
    if (!filePath.startsWith(STATIC_DIR)) { res.writeHead(403); res.end('Proibido'); return; }
    serveStatic(res, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅  VLTV Play em http://0.0.0.0:${PORT}`);
    console.log(`🔑  Gemini: ${GEMINI_API_KEY ? 'Chave OK ✓ — modelo: gemini-2.0-flash (v1)' : '❌ GEMINI_API_KEY não configurada!'}`);
    console.log(`⚽  Football: ${FOOTBALL_KEY ? 'OK ✓' : '⚠️  Não configurada'}`);
    console.log(`🎬  TMDB: OK ✓`);
});
