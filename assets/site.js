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
            video.setAttribute('aria-label', 'NextSIM');
            if (box.dataset.poster) video.poster = box.dataset.poster;
            box.replaceChildren(video);
        }
    });
})();
