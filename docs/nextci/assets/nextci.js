(function () {
    const root = document.documentElement;
    const LANG_KEY = 'nextsim-doc-lang';
    const validLang = value => value === 'ko' || value === 'en' ? value : null;
    const queryLang = () => validLang(new URLSearchParams(window.location.search).get('lang'));
    const storedLang = () => { try { return validLang(localStorage.getItem(LANG_KEY)); } catch (e) { return null; } };
    const initialLang = queryLang() || storedLang() || (/^ko\b/i.test(navigator.language || '') ? 'ko' : 'en');
    const buttons = Array.from(document.querySelectorAll('.lang-switch button[data-lang]'));
    const preserveLangInLinks = lang => {
        document.querySelectorAll('a[href]').forEach(link => {
            const raw = link.getAttribute('href');
            if (!raw || raw.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return;
            const hashAt = raw.indexOf('#');
            const hash = hashAt < 0 ? '' : raw.slice(hashAt);
            const withoutHash = hashAt < 0 ? raw : raw.slice(0, hashAt);
            if (!withoutHash) return;
            const qAt = withoutHash.indexOf('?');
            const path = qAt < 0 ? withoutHash : withoutHash.slice(0, qAt);
            const query = new URLSearchParams(qAt < 0 ? '' : withoutHash.slice(qAt + 1));
            query.set('lang', lang);
            const encoded = query.toString();
            link.setAttribute('href', path + (encoded ? '?' + encoded : '') + hash);
        });
    };
    const applyLang = (lang, updateUrl) => {
        lang = validLang(lang) || 'ko';
        root.setAttribute('data-lang', lang);
        root.setAttribute('lang', lang);
        document.querySelectorAll('option[data-ko]').forEach(option => {
            option.textContent = option.dataset[lang];
        });
        buttons.forEach(button => button.setAttribute('aria-pressed', button.dataset.lang === lang ? 'true' : 'false'));
        try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* storage can be unavailable */ }
        if (updateUrl && window.history && window.history.replaceState) {
            const url = new URL(window.location.href);
            url.searchParams.set('lang', lang);
            window.history.replaceState({}, '', url.href);
        }
        preserveLangInLinks(lang);
    };
    applyLang(initialLang, Boolean(queryLang()));
    buttons.forEach(button => button.addEventListener('click', () => applyLang(button.dataset.lang, true)));
    const menu = document.querySelector('.nav-menu');
    const narrow = window.matchMedia('(max-width: 900px)');
    const updateMenu = () => { if (menu) menu.open = !narrow.matches; };
    updateMenu();
    narrow.addEventListener('change', updateMenu);

    const openHash = () => {
        const value = window.location.hash.slice(1);
        if (!value) return;
        let decoded;
        try { decoded = decodeURIComponent(value); } catch (e) { return; }
        const target = document.getElementById(decoded);
        if (!target) return;
        let node = target;
        while (node) {
            if (node.tagName === 'DETAILS') node.open = true;
            node = node.parentElement;
        }
        if (target.classList.contains('method-row')) {
            target.classList.remove('is-hidden');
            const group = target.closest('section[data-group]');
            if (group) group.classList.remove('is-hidden');
        }
        requestAnimationFrame(() => target.scrollIntoView({behavior: 'instant', block: 'start'}));
    };
    window.addEventListener('hashchange', openHash);
    openHash();

    document.querySelectorAll('pre.cmd:not(.sig)').forEach(pre => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'copy-code';
        button.setAttribute('aria-label', 'Copy code / 코드 복사');
        button.textContent = '복사 / Copy';
        button.addEventListener('click', async () => {
            const text = pre.textContent || '';
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
                else throw new Error('clipboard unavailable');
                button.textContent = root.lang === 'ko' ? '복사됨' : 'Copied';
            } catch (e) {
                button.textContent = root.lang === 'ko' ? '복사 실패: 코드를 직접 선택하세요' : 'Copy failed: select the code manually';
            }
            window.setTimeout(() => { button.textContent = '복사 / Copy'; }, 1300);
        });
        pre.parentNode.insertBefore(button, pre);
    });

    const search = document.getElementById('apiSearch');
    const domain = document.getElementById('apiDomain');
    const action = document.getElementById('apiAction');
    const status = document.getElementById('apiStatus');
    if (search && domain && action && status) {
        const rows = Array.from(document.querySelectorAll('.method-row'));
        const groups = Array.from(document.querySelectorAll('#cheatsheet section[data-group]'));
        const ko = status.querySelector('.i18n-ko');
        const en = status.querySelector('.i18n-en');
        const update = () => {
            const needle = search.value.trim().toLowerCase();
            const selectedDomain = domain.value;
            const selectedAction = action.value;
            let count = 0;
            rows.forEach(row => {
                const matches = (!needle || (row.dataset.search || '').includes(needle))
                    && (selectedDomain === 'all' || row.dataset.domain === selectedDomain)
                    && (selectedAction === 'all' || row.dataset.action === selectedAction);
                row.classList.toggle('is-hidden', !matches);
                if (matches) count += 1;
            });
            groups.forEach(group => group.classList.toggle('is-hidden', !group.querySelector('.method-row:not(.is-hidden)')));
            if (ko) ko.textContent = count ? '결과 ' + count + '개' : '일치하는 메서드가 없습니다 (0개)';
            if (en) en.textContent = count ? count + ' result' + (count === 1 ? '' : 's') : 'No matching methods (0 results)';
        };
        [search, domain, action].forEach(control => control.addEventListener('input', update));
        [domain, action].forEach(control => control.addEventListener('change', update));
        update();
    }


})();
