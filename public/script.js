// =============================================
// VLTV Play — script.js
// =============================================

const WHATSAPP = '5531998491711';
let currentPlan = 'Geral';

const GENRES_MOVIE = {
    28:'Ação',12:'Aventura',16:'Animação',35:'Comédia',80:'Crime',
    99:'Documentário',18:'Drama',10751:'Família',14:'Fantasia',36:'História',
    27:'Terror',10402:'Música',9648:'Mistério',10749:'Romance',
    878:'Ficção Científica',53:'Thriller',10752:'Guerra',37:'Faroeste'
};
const GENRES_TV = {
    10759:'Ação & Aventura',16:'Animação',35:'Comédia',80:'Crime',
    99:'Documentário',18:'Drama',10751:'Família',10762:'Kids',9648:'Mistério',
    10765:'Sci-Fi',10766:'Novela',10768:'Guerra',37:'Faroeste'
};

// ── TMDB via backend ──
async function tmdb(endpoint) {
    const r = await fetch('/api/tmdb?endpoint=' + encodeURIComponent(endpoint));
    if (!r.ok) throw new Error('TMDB ' + r.status);
    return r.json();
}

// ── CARROSSEL: swipe touch + drag mouse ──
function buildCarousel(trackEl, viewEl, prevEl, nextEl) {
    const CARD_W = 170 + 14;
    let pos = 0, dragging = false, startX = 0, startPos = 0;

    function clamp(v) {
        return Math.max(0, Math.min(v, Math.max(0, trackEl.scrollWidth - viewEl.clientWidth)));
    }
    function move(p, animate = true) {
        pos = clamp(p);
        trackEl.style.transition = animate ? 'transform .4s ease' : 'none';
        trackEl.style.transform  = `translateX(-${pos}px)`;
    }

    prevEl.addEventListener('click', () => move(pos - CARD_W * 2));
    nextEl.addEventListener('click', () => move(pos + CARD_W * 2));

    trackEl.addEventListener('mousedown', e => { dragging=true; startX=e.clientX; startPos=pos; trackEl.style.transition='none'; });
    window.addEventListener('mousemove', e => { if(dragging) move(startPos-(e.clientX-startX), false); });
    window.addEventListener('mouseup',   () => { if(dragging){ dragging=false; trackEl.style.transition='transform .4s ease'; } });

    trackEl.addEventListener('touchstart', e => { startX=e.touches[0].clientX; startPos=pos; trackEl.style.transition='none'; }, {passive:true});
    trackEl.addEventListener('touchmove',  e => { move(startPos-(e.touches[0].clientX-startX), false); }, {passive:true});
    trackEl.addEventListener('touchend',   () => { trackEl.style.transition='transform .4s ease'; });
}

// ── CRIAR CARD ──
function createCard(item, isTV) {
    const poster = item.poster_path
        ? 'https://image.tmdb.org/t/p/w342' + item.poster_path
        : 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=342';
    const title  = item.title || item.name || '';
    const date   = item.release_date || item.first_air_date || '';
    const dateF  = date ? date.split('-').reverse().join('/') : 'Em breve';
    const rating = item.vote_average && item.vote_average > 0 ? '⭐ ' + item.vote_average.toFixed(1) : '';

    const today = new Date(); today.setHours(0,0,0,0);
    const rel   = date ? new Date(date+'T00:00:00') : null;
    const diff  = rel ? (rel - today) / 86400000 : 999;
    const isNew = diff >= 0 && diff <= 7;

    const card = document.createElement('div');
    card.className = 'media-card';
    card.innerHTML = `
        ${isNew ? '<div class="new-badge">🔥 Esta semana</div>' : ''}
        <img src="${poster}" alt="${title}" loading="lazy"
             onerror="this.src='https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=342'">
        <div class="media-card-info">
            <div class="media-card-title">${title}</div>
            <div class="media-card-date">📆 ${dateF}</div>
            ${rating ? `<div class="media-card-rating">${rating}</div>` : ''}
        </div>`;
    card.addEventListener('click', () => openMediaModal(item, isTV));
    return card;
}

// ── CARREGAR FILMES EM CARTAZ NO CINEMA ──
async function loadNowPlaying() {
    const track = document.getElementById('trackCinema');
    const view  = document.getElementById('viewCinema');
    if (!track || !view) return;
    try {
        // Busca 3 páginas para ter volume suficiente, ordena por data de lançamento crescente
        const [p1, p2, p3] = await Promise.all([
            fetch('/api/nowplaying?page=1').then(r => r.json()),
            fetch('/api/nowplaying?page=2').then(r => r.json()),
            fetch('/api/nowplaying?page=3').then(r => r.json()),
        ]);
        const seen = new Set();
        const movies = [...(p1.results||[]), ...(p2.results||[]), ...(p3.results||[])]
            .filter(m => {
                if (!m.poster_path || !(m.title || m.name)) return false;
                if (seen.has(m.id)) return false;
                seen.add(m.id);
                return true;
            })
            .sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''));

        if (!movies.length) { track.innerHTML = '<div class="loading-card">Nenhum filme em cartaz encontrado.</div>'; return; }
        track.innerHTML = '';
        movies.forEach(m => track.appendChild(createCard(m, false)));
        buildCarousel(track, view, document.getElementById('prevCinema'), document.getElementById('nextCinema'));
    } catch(e) {
        console.error('NowPlaying:', e);
        track.innerHTML = '<div class="loading-card">Erro ao carregar filmes em cartaz.</div>';
    }
}


async function loadMovies() {
    const track = document.getElementById('trackMovies');
    const view  = document.getElementById('viewMovies');
    try {
        const r = await fetch('/api/upcoming');
        if (!r.ok) throw new Error(r.status);
        const data   = await r.json();
        const movies = (data.results || []).filter(m => m.poster_path && (m.title || m.name));
        if (!movies.length) { track.innerHTML = '<div class="loading-card">Nenhum filme encontrado.</div>'; return; }
        track.innerHTML = '';
        movies.forEach(m => track.appendChild(createCard(m, false)));
        buildCarousel(track, view, document.getElementById('prevMovies'), document.getElementById('nextMovies'));
    } catch(e) {
        track.innerHTML = '<div class="loading-card">Erro ao carregar filmes.</div>';
    }
}

// ── CARREGAR SÉRIES ──
// Só séries com estreia futura (a partir de hoje) e populares
async function loadSeries() {
    const track = document.getElementById('trackSeries');
    const view  = document.getElementById('viewSeries');
    try {
        const today  = new Date().toISOString().split('T')[0];
        const future = new Date(); future.setDate(future.getDate()+120);
        const futStr = future.toISOString().split('T')[0];

        // Busca 3 fontes em paralelo para ter volume suficiente
        const [p1, p2, p3] = await Promise.all([
            // Séries que estreiam nos próximos 120 dias, mais populares primeiro
            tmdb(`discover/tv?language=pt-BR&sort_by=popularity.desc&first_air_date.gte=${today}&first_air_date.lte=${futStr}&page=1`),
            tmdb(`discover/tv?language=pt-BR&sort_by=popularity.desc&first_air_date.gte=${today}&first_air_date.lte=${futStr}&page=2`),
            // Séries no ar AGORA com primeiro episódio a partir de hoje (recentes)
            tmdb(`discover/tv?language=pt-BR&sort_by=first_air_date.desc&first_air_date.gte=${today}&page=1`)
        ]);

        const seen = new Set();
        const all  = [...(p1.results||[]), ...(p2.results||[]), ...(p3.results||[])]
            .filter(s => {
                if (!s.poster_path) return false;
                // FILTRO IMPORTANTE: só aceita série com data de estreia >= hoje
                const d = s.first_air_date || '';
                if (!d || d < today) return false;
                if (seen.has(s.id)) return false;
                seen.add(s.id);
                return true;
            })
            .sort((a,b) => (a.first_air_date||'').localeCompare(b.first_air_date||''))
            .slice(0, 20);

        if (!all.length) { track.innerHTML = '<div class="loading-card">Nenhuma série futura encontrada.</div>'; return; }
        track.innerHTML = '';
        all.forEach(s => track.appendChild(createCard(s, true)));
        buildCarousel(track, view, document.getElementById('prevSeries'), document.getElementById('nextSeries'));
    } catch(e) {
        console.error('Series:', e);
        track.innerHTML = '<div class="loading-card">Erro ao carregar séries.</div>';
    }
}

// ── ABAS ──
function switchTab(tab, btn) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + tab).classList.add('active');
}

// ── MODAL FILME/SÉRIE ──
async function openMediaModal(item, isTV) {
    const modal    = document.getElementById('mediaModal');
    const backdrop = document.getElementById('mediaBackdrop');
    const poster   = document.getElementById('mediaPoster');
    const title    = document.getElementById('mediaTitle');
    const tags     = document.getElementById('mediaTags');
    const meta     = document.getElementById('mediaMetaRow');
    const overview = document.getElementById('mediaOverview');
    const cast     = document.getElementById('mediaCast');
    const ctaWrap  = document.getElementById('mediaCtaWrap');

    tags.innerHTML=''; meta.innerHTML=''; cast.innerHTML=''; ctaWrap.innerHTML='';
    title.textContent = item.title || item.name || '';

    // Sinopse — usa o que veio no card; se vazio, busca detalhes completos
    let sinopse = item.overview || '';

    poster.src = item.poster_path ? 'https://image.tmdb.org/t/p/w342'+item.poster_path : '';
    backdrop.style.backgroundImage = item.backdrop_path
        ? `url('https://image.tmdb.org/t/p/w1280${item.backdrop_path}')`
        : `url('https://images.unsplash.com/photo-1574375927938-d5a98e8edd86?q=80&w=1280')`;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Busca detalhes + créditos em paralelo (sinopse em pt-BR e elenco)
    try {
        const type = isTV ? 'tv' : 'movie';
        const [details, credits] = await Promise.all([
            tmdb(`${type}/${item.id}?language=pt-BR`),
            tmdb(`${type}/${item.id}/credits?language=pt-BR`)
        ]);

        // Sinopse em português com fallback
        sinopse = details.overview || sinopse || 'Sinopse ainda não disponível.';
        overview.textContent = sinopse;

        // Gêneros vindos dos detalhes completos
        tags.innerHTML = '';
        (details.genres || []).slice(0,3).forEach(g => {
            const t = document.createElement('span');
            t.className='media-tag'; t.textContent=g.name; tags.appendChild(t);
        });

        // Duração / temporadas
        const extra = isTV
            ? (details.number_of_seasons ? `${details.number_of_seasons} temp.` : '')
            : (details.runtime ? `${details.runtime} min` : '');

        const date  = item.release_date || item.first_air_date;
        const dateF = date ? date.split('-').reverse().join('/') : 'Em breve';
        meta.innerHTML = `
            <div class="media-meta">📆 <strong>${dateF}</strong></div>
            ${item.vote_average ? `<div class="media-meta">⭐ <strong>${item.vote_average.toFixed(1)}</strong></div>` : ''}
            ${extra ? `<div class="media-meta">🎞 <strong>${extra}</strong></div>` : ''}
            ${details.original_language ? `<div class="media-meta">🌐 <strong>${details.original_language.toUpperCase()}</strong></div>` : ''}`;

        // Elenco
        (credits.cast || []).slice(0,6).forEach(p => {
            const chip = document.createElement('div');
            chip.className='cast-chip'; chip.textContent=p.name; cast.appendChild(chip);
        });

    } catch(_) {
        overview.textContent = sinopse || 'Sinopse ainda não disponível.';
        // Gêneros do card (fallback)
        const gmap = isTV ? GENRES_TV : GENRES_MOVIE;
        (item.genre_ids||[]).slice(0,3).forEach(id => {
            if(gmap[id]){ const t=document.createElement('span'); t.className='media-tag'; t.textContent=gmap[id]; tags.appendChild(t); }
        });
        const date  = item.release_date || item.first_air_date;
        const dateF = date ? date.split('-').reverse().join('/') : 'Em breve';
        meta.innerHTML = `<div class="media-meta">📆 <strong>${dateF}</strong></div>`;
    }

    // Botão CTA — "em breve" para futuros, "solicitar teste" para disponíveis
    const releaseDate = item.release_date || item.first_air_date || '';
    const today = new Date().toISOString().split('T')[0];
    const isFuture = releaseDate && releaseDate > today;

    if (isFuture) {
        ctaWrap.innerHTML = `<div class="media-soon">🕐 Disponível na VLTV Play após o lançamento</div>`;
    } else {
        ctaWrap.innerHTML = `<button class="btn-cta media-cta" onclick="openModal('Geral'); closeMediaModal()">🎬 Quero Assistir — Teste Grátis</button>`;
    }
}

function closeMediaModal() {
    document.getElementById('mediaModal').classList.remove('active');
    document.body.style.overflow = '';
}
function handleMediaModalClick(e) {
    if (e.target === document.getElementById('mediaModal')) closeMediaModal();
}

// ── FAQ ──
document.querySelectorAll('.faq-item').forEach(item => {
    item.querySelector('.faq-question').addEventListener('click', () => {
        const active = document.querySelector('.faq-item.active');
        if (active && active !== item) active.classList.remove('active');
        item.classList.toggle('active');
    });
});

// ── MODAL DISPOSITIVO ──
function openModal(ctx) {
    currentPlan = ctx;
    document.getElementById('modalTitle').innerText =
        ctx === 'Geral' ? 'Solicitar Teste Grátis' : `Teste — ${ctx}`;
    document.getElementById('testModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeModal() {
    document.getElementById('testModal').classList.remove('active');
    document.body.style.overflow = '';
}
function handleModalClick(e) {
    if (e.target === document.getElementById('testModal')) closeModal();
}
function sendWhatsApp() {
    const device = document.getElementById('deviceSelect').value;
    const text = currentPlan === 'Geral'
        ? `Olá! Gostaria de solicitar um teste gratuito para: ${device}.`
        : `Olá! Tenho interesse no ${currentPlan}. Gostaria de um teste para: ${device}.`;
    window.open(`https://api.whatsapp.com/send?phone=${WHATSAPP}&text=${encodeURIComponent(text)}`, '_blank');
    closeModal();
}

// ── CHAT IA ──
let chatOpen = false;
const chatHistory = [];

function toggleChat() {
    chatOpen = !chatOpen;
    const box  = document.getElementById('chatBox');
    const icon = document.querySelector('.chat-icon');
    const cls  = document.querySelector('.close-icon');
    const bdg  = document.getElementById('chatBadge');
    if (chatOpen) {
        box.style.display = 'flex';
        requestAnimationFrame(() => box.classList.add('open'));
        if(icon) icon.style.display='none';
        if(cls)  cls.style.display='block';
        if(bdg)  bdg.style.display='none';
        scrollChat();
    } else {
        box.classList.remove('open');
        if(icon) icon.style.display='block';
        if(cls)  cls.style.display='none';
        setTimeout(() => { box.style.display='none'; }, 260);
    }
}
function handleChatKey(e) { if(e.key==='Enter') sendChatMessage(); }
function scrollChat() { const m=document.getElementById('chatMessages'); if(m) m.scrollTop=m.scrollHeight; }
function ftime() { const n=new Date(); return String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0'); }
function addMsg(html, sender) {
    const msgs=document.getElementById('chatMessages');
    const d=document.createElement('div'); d.className=`chat-msg ${sender}`;
    d.innerHTML=`<div class="chat-bubble">${html}</div><div class="chat-time">${ftime()}</div>`;
    msgs.appendChild(d); scrollChat();
}
function addTyping() {
    const msgs=document.getElementById('chatMessages');
    const d=document.createElement('div'); d.className='chat-msg bot typing-indicator'; d.id='typingDot';
    d.innerHTML='<div class="chat-bubble"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
    msgs.appendChild(d); scrollChat();
}
function removeTyping() { const t=document.getElementById('typingDot'); if(t) t.remove(); }
async function sendChatMessage() {
    const input=document.getElementById('chatInput');
    const txt=input.value.trim(); if(!txt) return;
    input.value=''; addMsg(txt,'user');
    chatHistory.push({role:'user',parts:[{text:txt}]});
    addTyping();
    try {
        const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({history:chatHistory})});
        const data=await r.json(); removeTyping();
        const reply=data.reply||'Não consegui processar. Fale no WhatsApp! 😊';
        chatHistory.push({role:'model',parts:[{text:reply}]});
        addMsg(reply.replace(/\n/g,'<br>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>'),'bot');
    } catch(e) { removeTyping(); addMsg('Erro de conexão. Fale no WhatsApp! 💬','bot'); }
}

// ── INIT ──
window.addEventListener('DOMContentLoaded', () => {
    loadNowPlaying();
    loadMovies();
    loadSeries();
});
