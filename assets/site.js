/* NextSIM 홍보 사이트 스크립트: 한/영 전환, 모바일 메뉴, 스크롤 등장, 히어로 시뮬레이션 */

// ---------------------------------------------------------------- 한/영 전환
// 사용자 가이드(docs/)와 같은 저장 키를 써서, 사이트와 가이드를 오가도 언어가 유지된다.
(function () {
    const root = document.documentElement;
    const buttons = Array.from(document.querySelectorAll('.lang-switch button[data-lang]'));
    const apply = (lang, persist) => {
        root.setAttribute('data-lang', lang);
        root.setAttribute('lang', lang);
        buttons.forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === lang ? 'true' : 'false'));
        if (persist) {
            try { window.localStorage.setItem('nextsim-doc-lang', lang); } catch (e) { /* 무시 */ }
        }
    };
    // 브라우저 언어로 정해진 경우에도 저장해 둔다. 그래야 사용자 가이드가 같은 언어로 열린다.
    apply(root.getAttribute('data-lang') === 'en' ? 'en' : 'ko', true);
    buttons.forEach(b => b.addEventListener('click', () => {
        apply(b.dataset.lang, true);
        // ?lang= 로 들어왔다면 주소도 맞춰 둔다 (공유 링크가 지금 언어를 가리키도록)
        const url = new URL(window.location.href);
        if (url.searchParams.has('lang')) {
            url.searchParams.set('lang', b.dataset.lang);
            window.history.replaceState(null, '', url);
        }
    }));
})();

// ---------------------------------------------------------------- 모바일 메뉴
(function () {
    const toggle = document.querySelector('.menu-toggle');
    const nav = document.getElementById('siteNav');
    if (!toggle || !nav) return;
    const setOpen = (open) => {
        nav.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
})();

// ---------------------------------------------------------------- 히어로: 하이브리드 도시
// 격자형 가상 도시를 그린다. Micro 구역 밖의 링크는 셀 단위 혼잡도 색(meso),
// 안쪽 링크는 차로 위를 달리며 신호에 멈추는 개별 차량(micro)으로 표현한다.
// 그림 아래 범례(신호 현시, 주행/정지 대수)는 이 시뮬레이션 값을 그대로 보여준다.
(function () {
    const canvas = document.getElementById('heroCanvas');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // site.css 의 --cg-1..5 와 같은 램프
    const RAMP = [[42, 165, 143], [134, 184, 111], [224, 188, 92], [235, 140, 80], [224, 88, 74]];
    const CELL = 16;          // meso 셀 길이 (px)
    const LANE_OFFSET = 4;    // 중앙선에서 차로까지 (px)
    const CYCLE = 16;         // 신호 주기 (s): 앞 절반은 동서 방향 녹색
    const DECEL = 40;         // 제동 감속도 (px/s²)
    const STOPPED = 2;        // 이보다 느리면 '정지'로 센다 (px/s)

    const hud = {};
    document.querySelectorAll('[data-hud]').forEach(el => { hud[el.dataset.hud] = el; });

    let W = 0, H = 0, dpr = 1;
    let links = [], lanes = [], zone = null;
    let t = 0, last = 0, rafId = 0, visible = true, hudAt = 0;

    // 결정론적 난수 (새로고침해도 같은 도시)
    function mulberry32(seed) {
        return function () {
            seed |= 0; seed = seed + 0x6D2B79F5 | 0;
            let r = Math.imul(seed ^ seed >>> 15, 1 | seed);
            r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r;
            return ((r ^ r >>> 14) >>> 0) / 4294967296;
        };
    }

    function rampColor(v, alpha) {
        const x = Math.max(0, Math.min(0.999, v)) * (RAMP.length - 1);
        const i = Math.floor(x), f = x - i;
        const a = RAMP[i], b = RAMP[i + 1];
        const c = a.map((ch, k) => Math.round(ch + (b[k] - ch) * f));
        return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
    }

    // 시간에 따라 흐르는 혼잡도 장 (0..1). 도심(=micro 구역) 쪽이 더 붐빈다.
    function congestion(x, y, time) {
        const dx = x - zone.x, dy = y - zone.y;
        const core = Math.exp(-(dx * dx + dy * dy) / (2 * (zone.r * 1.5) ** 2));
        const wave = 0.5
            + 0.28 * Math.sin(x * 0.009 + time * 0.35) * Math.cos(y * 0.012 - time * 0.22)
            + 0.18 * Math.sin((x + y) * 0.006 - time * 0.5);
        return Math.max(0, Math.min(1, wave * 0.7 + core * 0.45 - 0.12));
    }

    function build() {
        const rand = mulberry32(20190101);
        const rect = canvas.getBoundingClientRect();
        W = Math.max(1, rect.width);
        H = Math.max(1, rect.height);
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const narrow = W < 640;
        zone = { x: W * 0.55, y: H * 0.52, r: Math.min(W, H) * (narrow ? 0.34 : 0.4) };

        // 흔들린 격자 위의 노드
        const sx = narrow ? 84 : 112, sy = narrow ? 78 : 96;
        const cols = Math.ceil(W / sx) + 2, rows = Math.ceil(H / sy) + 2;
        const grid = [];
        for (let r = 0; r < rows; r++) {
            grid.push([]);
            for (let c = 0; c < cols; c++) {
                grid[r].push({
                    x: (c - 0.5) * sx + (rand() - 0.5) * sx * 0.36,
                    y: (r - 0.5) * sy + (rand() - 0.5) * sy * 0.36,
                });
            }
        }

        links = [];
        const addLink = (a, b, horizontal) => {
            const dx = b.x - a.x, dy = b.y - a.y;
            const len = Math.hypot(dx, dy);
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            const micro = Math.hypot(mx - zone.x, my - zone.y) < zone.r;
            links.push({ a, b, len, ux: dx / len, uy: dy / len, horizontal, micro });
        };
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const n = grid[r][c];
                if (c + 1 < cols && rand() > 0.12) addLink(n, grid[r][c + 1], true);
                if (r + 1 < rows && rand() > 0.16) addLink(n, grid[r + 1][c], false);
            }
        }

        // micro 링크마다 양방향 차로 하나씩, 차량을 뿌려 둔다
        lanes = [];
        links.filter(l => l.micro).forEach(l => {
            [1, -1].forEach(dir => {
                const lane = { link: l, dir, vehicles: [] };
                const count = Math.max(1, Math.floor(l.len / 30 * (0.5 + rand() * 0.5)));
                for (let i = 0; i < count; i++) {
                    const bus = rand() < 0.08;
                    lane.vehicles.push({
                        s: (i + rand() * 0.6) / count * l.len,
                        v: 0,
                        vmax: (bus ? 22 : 30) + rand() * 12,
                        len: bus ? 15 : 8,
                        bus,
                    });
                }
                lane.vehicles.sort((p, q) => p.s - q.s);
                lanes.push(lane);
            });
        });
    }

    function greenFor(link, time) {
        const phase = (time % CYCLE) / CYCLE;
        return link.horizontal ? phase < 0.5 : phase >= 0.5;
    }

    function step(dt) {
        lanes.forEach(lane => {
            const L = lane.link.len;
            const green = greenFor(lane.link, t);
            const stopLine = L - 9;
            const vs = lane.vehicles;
            for (let i = vs.length - 1; i >= 0; i--) {
                const veh = vs[i];
                const leader = vs[i + 1];
                let limit = Infinity;
                if (leader) limit = leader.s - leader.len - 4 - veh.s;
                if (!green && veh.s < stopLine) limit = Math.min(limit, stopLine - veh.s);
                // 간단한 추종: 남은 거리 안에 설 수 있는 속도(√2bd)를 넘지 않는다.
                // 제동은 가속보다 빠르게, 앞차나 정지선은 절대 넘지 않게.
                const target = limit <= 0.5 ? 0 : Math.min(veh.vmax, Math.sqrt(2 * DECEL * limit));
                veh.v += (target - veh.v) * Math.min(1, dt * (target < veh.v ? 7 : 1.6));
                if (limit <= 0.5) veh.v = 0;
                veh.s += Math.min(veh.v * dt, Math.max(0, limit));
            }
            // 끝에 닿은 차량은 링크 시작으로 (다른 링크에서 들어오는 흐름처럼 보인다)
            while (vs.length && vs[vs.length - 1].s > L) {
                const veh = vs.pop();
                veh.s = Math.min(veh.s - L, vs.length ? vs[0].s - vs[0].len - 4 : 0);
                vs.unshift(veh);
            }
        });
    }

    function lanePoint(lane, s) {
        const l = lane.link;
        const along = lane.dir === 1 ? s : l.len - s;
        const ox = -l.uy * LANE_OFFSET * lane.dir, oy = l.ux * LANE_OFFSET * lane.dir;
        return { x: l.a.x + l.ux * along + ox, y: l.a.y + l.uy * along + oy };
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#070914';
        ctx.fillRect(0, 0, W, H);

        // micro 구역 바닥의 옅은 빛
        const glow = ctx.createRadialGradient(zone.x, zone.y, 0, zone.x, zone.y, zone.r * 1.1);
        glow.addColorStop(0, 'rgba(152,192,239,.10)');
        glow.addColorStop(1, 'rgba(152,192,239,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);

        // 1) 모든 링크의 바탕 도로
        ctx.lineCap = 'round';
        links.forEach(l => {
            ctx.strokeStyle = l.micro ? '#172238' : '#0f1526';
            ctx.lineWidth = l.micro ? 14 : 6;
            ctx.beginPath();
            ctx.moveTo(l.a.x, l.a.y);
            ctx.lineTo(l.b.x, l.b.y);
            ctx.stroke();
        });

        // 2) meso 링크: 셀 단위 혼잡도 (구역에서 멀수록 옅게)
        ctx.lineCap = 'butt';
        ctx.lineWidth = 3.2;
        links.forEach(l => {
            if (l.micro) return;
            const n = Math.max(1, Math.floor(l.len / CELL));
            const seg = l.len / n;
            for (let i = 0; i < n; i++) {
                const s0 = i * seg + 1.5, s1 = (i + 1) * seg - 1.5;
                const cx = l.a.x + l.ux * (s0 + s1) / 2, cy = l.a.y + l.uy * (s0 + s1) / 2;
                const d = Math.hypot(cx - zone.x, cy - zone.y) / Math.max(W, H);
                ctx.strokeStyle = rampColor(congestion(cx, cy, t), Math.max(0.28, 0.85 - d * 0.9));
                ctx.beginPath();
                ctx.moveTo(l.a.x + l.ux * s0, l.a.y + l.uy * s0);
                ctx.lineTo(l.a.x + l.ux * s1, l.a.y + l.uy * s1);
                ctx.stroke();
            }
        });

        // 3) micro 링크: 중앙선과 정지선 신호
        ctx.setLineDash([4, 5]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(209,228,250,.2)';
        links.forEach(l => {
            if (!l.micro) return;
            ctx.beginPath();
            ctx.moveTo(l.a.x, l.a.y);
            ctx.lineTo(l.b.x, l.b.y);
            ctx.stroke();
        });
        ctx.setLineDash([]);
        lanes.forEach(lane => {
            const p = lanePoint(lane, lane.link.len - 7);
            ctx.fillStyle = greenFor(lane.link, t) ? '#2aa58f' : '#e0584a';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.9, 0, Math.PI * 2);
            ctx.fill();
        });

        // 4) micro 차량: 달리는 차는 밝게, 멈춘 차는 흐리게, 버스는 보라
        let moving = 0, stopped = 0;
        lanes.forEach(lane => {
            const l = lane.link;
            const ang = Math.atan2(l.uy, l.ux) + (lane.dir === 1 ? 0 : Math.PI);
            lane.vehicles.forEach(veh => {
                if (veh.s < 0) return;
                if (veh.v < STOPPED) stopped++; else moving++;
                const p = lanePoint(lane, veh.s - veh.len / 2);
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(ang);
                ctx.fillStyle = veh.bus ? '#f2c443' : (veh.v < STOPPED ? '#7f93b3' : '#d1e4fa');
                ctx.fillRect(-veh.len / 2, -2.1, veh.len, 4.2);
                ctx.restore();
            });
        });

        // 5) micro 구역 경계
        ctx.save();
        ctx.setLineDash([5, 7]);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = 'rgba(182,217,252,.55)';
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        return { moving, stopped };
    }

    function updateHud(counts, now) {
        if (now - hudAt < 200) return;
        hudAt = now;
        const phase = (t % CYCLE) / CYCLE;
        const ew = phase < 0.5;
        const remain = Math.ceil((ew ? 0.5 - phase : 1 - phase) * CYCLE);
        if (hud['phase-ko']) hud['phase-ko'].textContent = ew ? '동서 방향 녹색' : '남북 방향 녹색';
        if (hud['phase-en']) hud['phase-en'].textContent = ew ? 'East–west green' : 'North–south green';
        if (hud.remain) hud.remain.textContent = String(remain).padStart(2, '0');
        if (hud.meter) hud.meter.style.width = `${((ew ? phase : phase - 0.5) / 0.5) * 100}%`;
        if (hud.moving) hud.moving.textContent = counts.moving;
        if (hud.stopped) hud.stopped.textContent = counts.stopped;
    }

    function frame(now) {
        rafId = 0;
        const dt = Math.min(0.05, (now - last) / 1000 || 0);
        last = now;
        t += dt;
        step(dt);
        updateHud(draw(), now);
        schedule();
    }

    function schedule() {
        if (!rafId && visible && !document.hidden && !reduceMotion.matches) {
            rafId = requestAnimationFrame(frame);
        }
    }

    function warmUp(seconds) {
        for (let i = 0; i < seconds / 0.05; i++) { t += 0.05; step(0.05); }
    }

    function start() {
        build();
        t = 0;
        // 움직임을 줄인 설정: 대기행렬이 생긴 장면 한 장만 그린다
        warmUp(reduceMotion.matches ? 6 : 2);
        hudAt = -Infinity;
        updateHud(draw(), performance.now());
        last = performance.now();
        schedule();
    }

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(start, 150);
    });
    document.addEventListener('visibilitychange', () => { last = performance.now(); schedule(); });
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', start);
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
            visible = entries[0].isIntersecting;
            last = performance.now();
            schedule();
        }).observe(canvas);
    }
    start();
})();

// ---------------------------------------------------------------- 홍보 영상 자리
// <div class="video" data-youtube="영상 ID"> 또는 data-src="assets/video/x.mp4" 이면 그 자리에 플레이어를 넣는다.
// 둘 다 비어 있으면 "준비 중" 안내를 그대로 둔다.
(function () {
    document.querySelectorAll('.video').forEach((box) => {
        const id = (box.dataset.youtube || '').trim();
        const src = (box.dataset.src || '').trim();
        if (id) {
            const frame = document.createElement('iframe');
            frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`;
            frame.title = 'NextSIM';
            frame.loading = 'lazy';
            frame.allow = 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen';
            frame.allowFullscreen = true;
            box.replaceChildren(frame);
        } else if (src) {
            const video = document.createElement('video');
            video.src = src;
            video.controls = true;
            video.preload = 'metadata';
            video.playsInline = true;
            if (box.dataset.poster) video.poster = box.dataset.poster;
            box.replaceChildren(video);
        }
    });
})();
