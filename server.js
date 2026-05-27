// =============================================
// VLTV Play — server.js (CORRIGIDO)
// =============================================

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'SUA_CHAVE_AQUI';
const TMDB_API_KEY   = process.env.TMDB_API_KEY   || '9b73f5dd15b8165b1b57419be2f29128';
const FOOTBALL_KEY   = process.env.FOOTBALL_KEY   || ''; // API-Football key (api-football.com)
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

== PLANOS E PREÇOS ==
- Plano Mensal:     R$ 40/mês    | 1 dispositivo simultâneo | HD, Full HD e 4K
- Plano Trimestral: R$ 110/3 meses | todos os benefícios | grade completa de canais
- Plano Semestral:  R$ 210/6 meses | Mais Vendido | servidores dedicados | EPG | suporte prioritário
- Plano Anual:      R$ 400/ano   | máxima economia | suporte 24h | acesso Ultra Premium
- Plano Vitalício:  R$ 569 (pagamento único) | sem mensalidades | suporte VIP permanente

== TESTE GRATUITO ==
- Duração do teste: 3 horas de acesso completo.
- Para solicitar, basta clicar em "Solicitar Teste Grátis" no site ou falar pelo WhatsApp.
- O teste é liberado imediatamente pela equipe.

== FIDELIDADE E CANCELAMENTO ==
- NÃO há fidelidade em nenhum plano.
- O cliente pode cancelar quando quiser, sem multa ou burocracia.

== INTERNET ==
- Sim, é necessário ter conexão com a internet para usar o IPTV.
- Recomendamos pelo menos 10 Mbps para HD e 25 Mbps para 4K.

== DISPOSITIVOS COMPATÍVEIS ==
- Sim, pode instalar no Celular (Android e iOS).
- Sim, pode instalar em TV Smart.
- Sim, pode instalar em Notebook / Computador.
- Sim, pode instalar em Fire Stick / TV Box.
- Sim, pode instalar em Roku TV.
- Você pode instalar em quantos aparelhos desejar; o acesso simultâneo depende da quantidade de telas do plano.

== FORMAS DE PAGAMENTO ==
- PIX: ativação IMEDIATA e automática após confirmação (em minutos).
- Cartão de Crédito: ativação em até 1 hora após confirmação.
- Boleto Bancário: ativação após compensação bancária (até 2 dias úteis) OU imediata se o cliente enviar o comprovante pelo WhatsApp.

== ATIVAÇÃO ==
As credenciais são enviadas pelo WhatsApp com tutorial passo a passo para o aparelho do cliente.

== SUPORTE ==
WhatsApp direto com a equipe. Suporte prioritário nos planos Semestral e Anual. VIP no Vitalício.

== SAUDAÇÕES ==
Se o usuário disser "bom dia", "boa tarde", "boa noite", "olá", "oi", "tudo bem" ou qualquer saudação, responda de forma amigável e pergunte como pode ajudar com o VLTV Play.

== REGRAS ==
- Responda saudações normalmente como um atendente faria.
- Se não souber algo com certeza, oriente o cliente a entrar em contato pelo WhatsApp.
- Respostas curtas e diretas — máximo 3 parágrafos ou lista simples.
- Nunca invente informações sobre preços ou funcionalidades que não estejam listadas acima.`;

// ── Helpers ──
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

// ── Proxy TMDB ──
function callTMDB(tmdbPath) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.themoviedb.org',
            path:     tmdbPath,
            method:   'GET',
            headers:  { 'Accept': 'application/json' },
        };
        const req = https.request(options, (apiRes) => {
            let raw = '';
            apiRes.on('data', chunk => raw += chunk);
            apiRes.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(new Error('Resposta inválida do TMDB')); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// ── Proxy API-Football ──
function callFootball(endpoint) {
    return new Promise((resolve, reject) => {
        if (!FOOTBALL_KEY) {
            return resolve({ response: [] });
        }
        const options = {
            hostname: 'v3.football.api-sports.io',
            path:     '/' + endpoint,
            method:   'GET',
            headers:  {
                'x-apisports-key': FOOTBALL_KEY,
                'Accept': 'application/json',
            },
        };
        const req = https.request(options, (apiRes) => {
            let raw = '';
            apiRes.on('data', chunk => raw += chunk);
            apiRes.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(new Error('Resposta inválida da API Football')); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// ── Chamada à API Gemini ──
function callGemini(history) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            contents: history,
            generationConfig: {
                temperature:     0.7,
                maxOutputTokens: 1500,
            }
        });

        const options = {
            hostname: 'generativelanguage.googleapis.com',
            path:     `/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            method:   'POST',
            headers: {
                'Content-Type':   'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (apiRes) => {
            let raw = '';
            apiRes.on('data', chunk => raw += chunk);
            apiRes.on('end', () => {
                try {
                    const parsed = JSON.parse(raw);
                    resolve(parsed);
                } catch (e) {
                    reject(new Error('Resposta inválida da API Gemini'));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ── Filmes em cartaz: apenas com lançamento nos últimos 60 dias + data <= hoje ──
async function fetchNowPlayingFiltered(page = 1) {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const past60 = new Date(today);
    past60.setDate(past60.getDate() - 60);
    const past60Str = past60.toISOString().split('T')[0];

    // Usa discover com intervalo de datas real para garantir filmes em cartaz
    const data = await callTMDB(
        `/3/discover/movie?api_key=${TMDB_API_KEY}&language=pt-BR` +
        `&sort_by=release_date.desc` +
        `&primary_release_date.gte=${past60Str}` +
        `&primary_release_date.lte=${todayStr}` +
        `&page=${page}`
    );
    return data;
}

// ── Lançamentos futuros ──
async function fetchUpcomingFiltered() {
    const today = new Date().toISOString().split('T')[0];
    let allResults = [];

    for (let page = 1; page <= 3; page++) {
        const data = await callTMDB(
            `/3/discover/movie?api_key=${TMDB_API_KEY}&language=pt-BR` +
            `&sort_by=release_date.asc` +
            `&primary_release_date.gte=${today}` +
            `&page=${page}`
        );
        if (data.results && data.results.length > 0) {
            allResults = allResults.concat(data.results);
        }
    }

    const seen = new Set();
    const filtered = allResults
        .filter(m => {
            if (!m.release_date || m.release_date < today) return false;
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
        })
        .sort((a, b) => a.release_date.localeCompare(b.release_date))
        .slice(0, 20);

    return filtered;
}

// ── Servidor ──
const server = http.createServer(async (req, res) => {
    const parsed  = url.parse(req.url, true);
    const reqPath = parsed.pathname;

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin':  '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        });
        res.end();
        return;
    }

    // ── /api/nowplaying — filmes em cartaz (últimos 60 dias, ordenados por data desc) ──
    if (reqPath === '/api/nowplaying' && req.method === 'GET') {
        try {
            const page = parseInt(parsed.query.page || '1', 10);
            const data = await fetchNowPlayingFiltered(page);
            sendJSON(res, 200, data);
        } catch (err) {
            console.error('[/api/nowplaying] Erro:', err.message);
            sendJSON(res, 500, { error: 'Erro ao buscar filmes em cartaz' });
        }
        return;
    }

    // ── /api/upcoming ──
    if (reqPath === '/api/upcoming' && req.method === 'GET') {
        try {
            const movies = await fetchUpcomingFiltered();
            sendJSON(res, 200, { results: movies });
        } catch (err) {
            console.error('[/api/upcoming] Erro:', err.message);
            sendJSON(res, 500, { error: 'Erro ao buscar filmes' });
        }
        return;
    }

    // ── /api/tmdb — proxy genérico ──
    if (reqPath === '/api/tmdb' && req.method === 'GET') {
        const endpoint = parsed.query.endpoint || '';
        if (!endpoint) return sendJSON(res, 400, { error: 'endpoint obrigatório' });
        const sep      = endpoint.includes('?') ? '&' : '?';
        const fullPath = `/3/${endpoint}${sep}api_key=${TMDB_API_KEY}`;
        try {
            const data = await callTMDB(fullPath);
            sendJSON(res, 200, data);
        } catch (err) {
            console.error('[/api/tmdb] Erro:', err.message);
            sendJSON(res, 500, { error: 'Erro ao buscar dados do TMDB' });
        }
        return;
    }

    // ── /api/football — Copa do Mundo e futebol ao vivo ──
    if (reqPath === '/api/football' && req.method === 'GET') {
        const endpoint = parsed.query.endpoint || '';
        if (!endpoint) return sendJSON(res, 400, { error: 'endpoint obrigatório' });
        try {
            const data = await callFootball(endpoint);
            sendJSON(res, 200, data);
        } catch (err) {
            console.error('[/api/football] Erro:', err.message);
            sendJSON(res, 500, { error: 'Erro ao buscar dados de futebol' });
        }
        return;
    }

    // ── /api/chat (Gemini) ──
    if (reqPath === '/api/chat' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { history } = JSON.parse(body);
                if (!Array.isArray(history) || history.length === 0) {
                    return sendJSON(res, 400, { error: 'history inválido' });
                }

                // Verificação da chave antes de chamar
                if (GEMINI_API_KEY === 'SUA_CHAVE_AQUI' || !GEMINI_API_KEY) {
                    return sendJSON(res, 200, {
                        reply: 'Olá! No momento estou em manutenção. Entre em contato pelo nosso WhatsApp para atendimento rápido! 💬'
                    });
                }

                const geminiData = await callGemini(history);

                // Log para debug em caso de erro da API
                if (geminiData.error) {
                    console.error('[Gemini API Error]', JSON.stringify(geminiData.error));
                    return sendJSON(res, 200, {
                        reply: 'Olá! No momento não consigo processar sua pergunta. Fale conosco pelo WhatsApp! 💬'
                    });
                }

                const reply =
                    geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
                    || 'Não consegui processar sua pergunta agora. Entre em contato pelo nosso WhatsApp para atendimento rápido! 💬';
                sendJSON(res, 200, { reply });
            } catch (err) {
                console.error('[/api/chat] Erro:', err.message);
                sendJSON(res, 500, { error: 'Erro interno no servidor' });
            }
        });
        return;
    }

    // ── Arquivos estáticos ──
    let filePath = path.join(STATIC_DIR, reqPath === '/' ? 'index.html' : reqPath);
    if (!filePath.startsWith(STATIC_DIR)) {
        res.writeHead(403); res.end('Proibido'); return;
    }
    serveStatic(res, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅  VLTV Play rodando em http://0.0.0.0:${PORT}`);
    console.log(`🔑  Gemini: ${GEMINI_API_KEY === 'SUA_CHAVE_AQUI' ? '⚠️  NÃO CONFIGURADA — configure a variável GEMINI_API_KEY' : 'OK ✓'}`);
    console.log(`⚽  Football API: ${FOOTBALL_KEY ? 'OK ✓' : '⚠️  NÃO CONFIGURADA (seção Copa opcional)'}`);
    console.log(`🎬  TMDB: OK ✓`);
    console.log(`\n📌  Para acessar de outros dispositivos na mesma rede, use o IP da sua máquina:${PORT}`);
});
