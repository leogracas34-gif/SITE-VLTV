// =============================================
// VLTV Play — server.js
// Backend Node.js — Gemini 2.0 Flash + TMDB + API-Football
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
    '.jpeg': 'image/jpeg',
    '.ico':  'image/x-icon',
    '.svg':  'image/svg+xml',
    '.json': 'application/json',
    '.webp': 'image/webp',
};

const SYSTEM_INSTRUCTION = `Você é o assistente virtual oficial da VLTV Play, um serviço de IPTV premium brasileiro.
Responda SEMPRE em português do Brasil, com tom simpático, objetivo e profissional.
Nunca se identifique como IA genérica ou mencione o Google ou Gemini — você é o Assistente VLTV.

== SAUDAÇÕES ==
Se o usuário disser "bom dia", "boa tarde", "boa noite", "olá", "oi", "tudo bem", "hey" ou qualquer saudação, responda de forma amigável e pergunte como pode ajudar com o VLTV Play.

== PLANOS E PREÇOS ==
- Plano Mensal:     R$ 40/mês    | 1 dispositivo simultâneo | HD, Full HD e 4K
- Plano Trimestral: R$ 110/3 meses | todos os benefícios | grade completa de canais
- Plano Semestral:  R$ 210/6 meses | Mais Vendido | servidores dedicados | EPG | suporte prioritário
- Plano Anual:      R$ 400/ano   | máxima economia | suporte 24h | acesso Ultra Premium
- Plano Vitalício:  R$ 569 (pagamento único) | sem mensalidades | suporte VIP permanente

== TESTE GRATUITO ==
- Duração: 3 horas de acesso completo.
- Como solicitar: clicar em "Solicitar Teste Grátis" no site ou falar pelo WhatsApp.
- O teste é liberado imediatamente pela equipe.

== FIDELIDADE E CANCELAMENTO ==
- NÃO há fidelidade em nenhum plano.
- O cliente pode cancelar quando quiser, sem multa ou burocracia.

== INTERNET NECESSÁRIA ==
- Sim, é necessário ter conexão com a internet para usar o IPTV.
- Recomendamos pelo menos 10 Mbps para HD e 25 Mbps para 4K.

== DISPOSITIVOS COMPATÍVEIS ==
- Celular (Android e iOS), TV Smart, Notebook, Computador, Fire Stick, TV Box, Roku TV.
- Instale em quantos aparelhos quiser; acesso simultâneo depende do plano.

== FORMAS DE PAGAMENTO ==
- PIX: ativação IMEDIATA e automática em minutos.
- Cartão de Crédito: ativação em até 1 hora após confirmação.
- Boleto Bancário: até 2 dias úteis, ou imediata enviando comprovante pelo WhatsApp.

== ATIVAÇÃO ==
As credenciais são enviadas pelo WhatsApp com tutorial passo a passo para o aparelho do cliente.

== SUPORTE ==
- WhatsApp direto com a equipe.
- Suporte prioritário nos planos Semestral e Anual.
- Suporte VIP permanente no plano Vitalício.

== COPA DO MUNDO 2026 ==
- Todos os jogos disponíveis ao vivo no VLTV Play em HD e 4K.
- Inclui todos os jogos do Brasil e de todas as seleções.
- Copa: EUA, Canadá e México — 11 de junho a 19 de julho de 2026.

== ESTABILIDADE E QUALIDADE ==
- Servidores dedicados nos planos Semestral, Anual e Vitalício.
- Transmissão estável, sem travamentos, qualidade HD, Full HD e 4K.

== REGRAS DO ASSISTENTE ==
- Responda saudações normalmente como um atendente faria.
- Se não souber algo com certeza, oriente pelo WhatsApp.
- Respostas curtas e diretas — máximo 3 parágrafos ou lista simples.
- Nunca invente informações sobre preços ou funcionalidades.`;

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
        if (err) { res.writeHead(404); res.end('Não encontrado'); return; }
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
            path:     tmdbPath,
            method:   'GET',
            headers:  { 'Accept': 'application/json', 'User-Agent': 'VLTVPlay/1.0' },
        }, (apiRes) => {
            let raw = '';
            apiRes.on('data', chunk => raw += chunk);
            apiRes.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(new Error('TMDB: resposta inválida')); }
            });
        });
        req.on('error', e => reject(new Error('TMDB: ' + e.message)));
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('TMDB: timeout')); });
        req.end();
    });
}

function callFootball(endpoint) {
    return new Promise((resolve, reject) => {
        if (!FOOTBALL_KEY) {
            return resolve({ response: [], errors: [], results: 0 });
        }
        const req = https.request({
            hostname: 'v3.football.api-sports.io',
            path:     '/' + endpoint,
            method:   'GET',
            headers:  { 'x-apisports-key': FOOTBALL_KEY, 'Accept': 'application/json' },
        }, (apiRes) => {
            let raw = '';
            apiRes.on('data', chunk => raw += chunk);
            apiRes.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(new Error('Football: resposta inválida')); }
            });
        });
        req.on('error', e => reject(new Error('Football: ' + e.message)));
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Football: timeout')); });
        req.end();
    });
}

function callGemini(history) {
    return new Promise((resolve, reject) => {
        // system_instruction como campo separado — suportado em v1beta
        const bodyObj = {
            system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            contents: history,
            generationConfig: {
                temperature:     0.7,
                maxOutputTokens: 1000,
                topP:            0.9,
            },
        };
        const body = JSON.stringify(bodyObj);

        const req = https.request({
            hostname: 'generativelanguage.googleapis.com',
            path:     `/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            method:   'POST',
            headers:  {
                'Content-Type':   'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        }, (apiRes) => {
            let raw = '';
            apiRes.on('data', chunk => raw += chunk);
            apiRes.on('end', () => {
                console.log('[Gemini] HTTP Status:', apiRes.statusCode);
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed.error) console.error('[Gemini] Erro:', JSON.stringify(parsed.error));
                    resolve({ data: parsed, status: apiRes.statusCode });
                } catch (e) {
                    console.error('[Gemini] JSON inválido:', raw.slice(0, 300));
                    reject(new Error('Gemini: resposta inválida'));
                }
            });
        });

        req.on('error', e => { console.error('[Gemini] Conexão:', e.message); reject(e); });
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Gemini: timeout')); });
        req.write(body);
        req.end();
    });
}

async function fetchNowPlayingFiltered(page) {
    page = page || 1;
    const today    = new Date().toISOString().split('T')[0];
    const past60   = new Date();
    past60.setDate(past60.getDate() - 60);
    const past60Str = past60.toISOString().split('T')[0];
    return callTMDB(
        `/3/discover/movie?api_key=${TMDB_API_KEY}&language=pt-BR` +
        `&sort_by=release_date.desc` +
        `&primary_release_date.gte=${past60Str}` +
        `&primary_release_date.lte=${today}` +
        `&with_release_type=3|2&page=${page}`
    );
}

async function fetchUpcomingFiltered() {
    const today = new Date().toISOString().split('T')[0];
    let all = [];
    for (let page = 1; page <= 3; page++) {
        try {
            const data = await callTMDB(
                `/3/discover/movie?api_key=${TMDB_API_KEY}&language=pt-BR` +
                `&sort_by=release_date.asc&primary_release_date.gte=${today}` +
                `&with_release_type=3|2&page=${page}`
            );
            if (data.results && data.results.length) all = all.concat(data.results);
        } catch (e) { console.error('[upcoming] p' + page + ':', e.message); }
    }
    const seen = new Set();
    return all
        .filter(m => {
            if (!m.release_date || m.release_date < today || !m.poster_path || seen.has(m.id)) return false;
            seen.add(m.id); return true;
        })
        .sort((a, b) => a.release_date.localeCompare(b.release_date))
        .slice(0, 20);
}

const server = http.createServer(async (req, res) => {
    const parsed  = url.parse(req.url, true);
    const reqPath = parsed.pathname;

    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin':  '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        });
        res.end();
        return;
    }

    if (reqPath === '/api/nowplaying' && req.method === 'GET') {
        try {
            sendJSON(res, 200, await fetchNowPlayingFiltered(parseInt(parsed.query.page || '1', 10)));
        } catch (err) {
            console.error('[nowplaying]', err.message);
            sendJSON(res, 500, { error: 'Erro ao buscar filmes em cartaz' });
        }
        return;
    }

    if (reqPath === '/api/upcoming' && req.method === 'GET') {
        try {
            sendJSON(res, 200, { results: await fetchUpcomingFiltered() });
        } catch (err) {
            console.error('[upcoming]', err.message);
            sendJSON(res, 500, { error: 'Erro ao buscar lançamentos' });
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
            sendJSON(res, 500, { error: 'Erro Football API' });
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
                    return sendJSON(res, 200, { reply: 'Assistente indisponível no momento. Fale pelo WhatsApp! 💬' });
                }
                console.log('[chat] Chamando Gemini 2.0 Flash...');
                const result = await callGemini(history);
                if (result.status !== 200 || result.data.error) {
                    console.error('[chat] Falhou:', JSON.stringify(result.data.error || {}));
                    return sendJSON(res, 200, { reply: 'Não consigo processar agora. Fale pelo WhatsApp! 💬' });
                }
                const reply = result.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Pode repetir?';
                console.log('[chat] ✓ Resposta OK');
                sendJSON(res, 200, { reply });
            } catch (err) {
                console.error('[chat]', err.message);
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
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║        VLTV Play — Servidor Online       ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('🌐  URL:      http://0.0.0.0:' + PORT);
    console.log('🔑  Gemini:  ', GEMINI_API_KEY ? '✅ OK — gemini-2.0-flash (API v1)' : '❌ NÃO CONFIGURADA — adicione GEMINI_API_KEY no Render');
    console.log('⚽  Football:', FOOTBALL_KEY   ? '✅ OK — dados em tempo real' : '⚠️  Não configurada — Copa sem tempo real');
    console.log('🎬  TMDB:    ✅ OK');
    console.log('');
});
