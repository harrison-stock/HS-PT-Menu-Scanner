import { supabase } from './supabase-client.js';

{
  // ── Reference data ─────────────────────────────────────────────
  const GOALS = [
    { id: 'cutting', label: 'CUTTING', sub: 'FAT LOSS', icon: 'graph-descending' },
    { id: 'maintenance', label: 'MAINTAIN', sub: 'HOLD STEADY', icon: 'weight-scales' },
    { id: 'bulking', label: 'BULKING', sub: 'MUSCLE GAIN', icon: 'flexed-bicep' },
  ];
  const RESTRICTIONS = ['None', 'Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Halal'];
  const EG_IDEAS = [
    'chicken katsu curry with edamame and a cocktail',
    'a smash burger, sweet potato fries and a cold beer',
    'grilled seabass, greens and a glass of white',
    'sharing mezze with halloumi and warm flatbreads',
    'a Sunday roast with all the trimmings',
    'pad thai with extra prawns and a lime soda',
    'steak frites, peppercorn sauce and a glass of red',
    'a big brunch, poached eggs and a flat white',
    'margherita pizza with a rocket side salad',
    'fish and chips with mushy peas',
  ];
  const COURSES = [
    { id: 'starter', label: 'STARTERS' },
    { id: 'main', label: 'MAINS' },
    { id: 'sides', label: 'SIDES' },
    { id: 'dessert', label: 'DESSERTS' },
    { id: 'drinks', label: 'DRINKS' },
  ];
  const RESULTS_ORDER = ['drinks', 'starter', 'main', 'sides', 'dessert'];
  // Brand icons (public/icons, from the HS PT app's set).
  const COURSE_ICONS = {
    starter: 'salad',
    main: 'dinner-plate',
    sides: 'fries',
    dessert: 'muffin',
    drinks: 'alcohol',
  };
  const icon = (name, size) => h`<span class="bi bi-${name}" aria-hidden="true"${size ? h` style="width:${size}px;height:${size}px"` : ''}></span>`;
  const CHAIN_CATS = ['All', 'Burgers', 'Chicken', 'Pizza', 'Sandwiches', 'Asian', 'Mexican', 'Coffee'];
  // Placeholder list — swap for the real downloaded chain nutrition data when available.
  const CHAINS = [
    { name: "McDonald's", cat: 'Burgers' },
    { name: 'Burger King', cat: 'Burgers' },
    { name: 'Five Guys', cat: 'Burgers' },
    { name: 'KFC', cat: 'Chicken' },
    { name: "Nando's", cat: 'Chicken' },
    { name: 'Wingstop', cat: 'Chicken' },
    { name: "Domino's", cat: 'Pizza' },
    { name: 'Pizza Express', cat: 'Pizza' },
    { name: 'Subway', cat: 'Sandwiches' },
    { name: 'Pret a Manger', cat: 'Sandwiches' },
    { name: 'Greggs', cat: 'Sandwiches' },
    { name: 'Wagamama', cat: 'Asian' },
    { name: 'Itsu', cat: 'Asian' },
    { name: 'Chipotle', cat: 'Mexican' },
    { name: 'Taco Bell', cat: 'Mexican' },
    { name: 'Starbucks', cat: 'Coffee' },
    { name: 'Costa Coffee', cat: 'Coffee' },
  ];
  const ICON_CHEVRON_RIGHT = 'M9 6l6 6-6 6';
  const ICON_CHECK = 'M4 12.5l5 5 11-11';
  const ICON_CLOSE = 'M6 18L18 6M6 6l12 12';

  // ── Bot check ─────────────────────────────────────────────
  // Cloudflare Turnstile, checked by Supabase Auth on sign-in, sign-up and
  // password reset once CAPTCHA protection is switched on for the scanner's
  // project (Supabase can't do sign-up alone). The site key is public. Left
  // empty, the widget stays away and requests go out without a token - which
  // is right until CAPTCHA is on, and is why the key has to be deployed
  // *before* it is. Same arrangement as Login.jsx in the HS PT app.
  const TURNSTILE_SITE_KEY = '';
  const needCaptcha = !!TURNSTILE_SITE_KEY;

  // ── State ─────────────────────────────────────────────
  // Profile data now lives in Supabase (see supabase-client.js + the
  // `profiles` table) instead of localStorage — auth session persistence
  // (handled by supabase-js itself) is what makes returning users skip
  // straight past sign-in.
  const state = {
    screen: 'boot',
    session: null, profile: null,
    name: '', email: '',
    goal: null, cals: '',
    restrictions: [],
    touchedRestrictions: false,
    theme: 'system',
    menuText: '', photoData: null, photoType: null, photoName: '',
    hasDoc: false, docName: '', chainName: '',
    cravingText: '',
    err: null, saved: false,
    egIndex: 0,
    courses: ['main'], chainCat: 'All', chainQuery: '',
    errKind: null, errCustomBody: null,
    authMode: 'signup', authErr: null, resetMsg: null,
    needsPassword: false, setPwErr: null,
    captchaToken: null, authBusy: false,
  };

  // ── DOM helpers ─────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  function h(strings, ...vals) {
    return strings.reduce((out, s, i) => out + s + (vals[i] !== undefined ? vals[i] : ''), '');
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function go(screen) {
    state.err = null;
    state.screen = screen;
    render();
  }

  // ── Theme ─────────────────────────────────────────────
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  mq.addEventListener('change', () => { if (state.theme === 'system') applyTheme(); });
  function isDark() {
    if (state.theme === 'system') return !mq.matches;
    return state.theme !== 'light';
  }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', isDark() ? 'dark' : 'light');
    // The status bar and home-indicator strip follow the theme picked here,
    // not just the phone's setting.
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.content = isDark() ? '#0a0d0e' : '#ECEFF4'; });
  }

  // ── Derived helpers ─────────────────────────────────────────────
  const GOAL_COLOR = {
    cutting: 'var(--accent)',
    maintenance: '#F39E1F',
    bulking: '#EE6A6A',
  };
  function initialsFor(name) {
    const parts = (name.trim() || 'U').replace(/[^a-zA-Z\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts.map(p => p[0]).slice(0, 2).join('') : (parts[0] || 'U').slice(0, 2)).toUpperCase();
  }
  function goalLabel(goal) { return (GOALS.find(g => g.id === goal) || {}).label || '—'; }

  // ── Goal row / chips (shared between profile + settings) ─────
  function renderGoalRow(containerId) {
    const el = $(containerId);
    el.innerHTML = GOALS.map(g => h`
      <button class="goal-btn" data-goal="${g.id}" data-sel="${state.goal === g.id ? '1' : '0'}" data-action="pick-goal" data-value="${g.id}">
        <div class="icon-slot">${icon(g.icon, 26)}</div>
        <div class="label">${g.label}</div>
        <div class="sub">${g.sub}</div>
      </button>
    `).join('');
  }
  function renderChips(containerId) {
    const el = $(containerId);
    el.innerHTML = RESTRICTIONS.map(label => {
      const isNone = label === 'None';
      const sel = isNone ? (state.restrictions.length === 0 && state.touchedRestrictions) : state.restrictions.includes(label);
      return h`<button class="chip ${sel ? 'is-sel' : ''}" data-action="toggle-restriction" data-value="${label}">${label}</button>`;
    }).join('');
  }

  // ── Screen renderers ─────────────────────────────────────────────
  function renderScanner() {
    $('scanner-name').textContent = (state.name.trim().toUpperCase() || 'YOU');
    const goalEl = $('scanner-goal');
    goalEl.textContent = goalLabel(state.goal);
    goalEl.style.color = GOAL_COLOR[state.goal] || '';
    goalEl.style.fontWeight = '700';
    $('scanner-initials').textContent = initialsFor(state.name);

    const errEl = $('scanner-error');
    if (state.err) { errEl.hidden = false; errEl.textContent = state.err; } else { errEl.hidden = true; }

    renderPhotoSlot();
    renderDocSlot();

    $('eg-line').textContent = '"' + EG_IDEAS[state.egIndex] + '"';
    $('input-menu-text').value = state.menuText;
  }

  const HEX_PATH = 'M194.489,30.721c-3.782,0 -7.574,0.799 -10.995,2.417l-141.142,66.762c-6.877,3.253 -11.356,9.426 -11.356,16.346l0,133.524c0,6.921 4.479,13.093 11.356,16.346l141.142,66.762c6.776,3.205 15.227,3.205 22.002,0l141.136,-66.762c6.876,-3.253 11.362,-9.424 11.362,-16.346l0,-133.524c0,-6.922 -4.486,-13.093 -11.362,-16.346l-141.136,-66.762c-3.418,-1.617 -7.23,-2.417 -11.007,-2.417Z';

  function renderPhotoSlot() {
    const el = $('photo-slot');
    if (!state.photoData) {
      el.innerHTML = h`
        <button class="hex-btn" data-action="attach-photo" style="position:relative;width:216px;height:203px">
          <svg viewBox="0 0 389 365" width="216" height="203" style="position:absolute;inset:0;overflow:visible">
            <path d="${HEX_PATH}" fill="var(--bg-2)" stroke="var(--accent)" stroke-width="7" stroke-linejoin="round" style="filter:drop-shadow(0 0 14px var(--accent-glow))"></path>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:0 34px">
            <span style="color:var(--accent)">${icon('camera', 46)}</span>
            <div style="font-family:var(--font-head);font-weight:700;font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:var(--heading-deep)">TAKE A PHOTO</div>
            <div style="font-size:11px;color:var(--text-3);letter-spacing:0.08em">OF THE MENU</div>
          </div>
        </button>
      `;
    } else {
      el.innerHTML = h`
        <div class="attach-hex-wrap">
          <svg viewBox="0 0 389 365" width="216" height="203" style="position:absolute;inset:0;overflow:visible">
            <path d="${HEX_PATH}" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="7" stroke-linejoin="round" style="filter:drop-shadow(0 0 14px var(--accent-glow))"></path>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;text-align:center;padding:0 34px">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5 11-11"></path></svg>
            <div style="font-family:var(--font-head);font-weight:700;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:var(--accent)">ATTACHED</div>
            <div style="font-size:11px;color:var(--text-3);letter-spacing:0.06em">${escapeHtml(state.photoName || 'menu-photo.jpg')}</div>
          </div>
          <button class="attach-remove" data-action="remove-photo" aria-label="Remove photo">×</button>
        </div>
      `;
    }
  }

  function renderDocSlot() {
    const el = $('doc-slot');
    if (state.hasDoc) {
      el.innerHTML = h`
        <div class="doc-attached">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M4 12.5l5 5 11-11"></path></svg>
          <div class="name">${escapeHtml(state.docName)} <span>· ATTACHED</span></div>
          <button data-action="remove-doc" aria-label="Remove file">×</button>
        </div>
      `;
    } else {
      el.innerHTML = h`
        <div class="doc-buttons">
          <button class="btn-ghost" data-action="attach-doc">
            ${icon('notes', 20)}
            UPLOAD PDF / WORD
          </button>
          <button class="btn-ghost" data-action="go-chains">
            ${icon('burger', 20)}
            BROWSE POPULAR CHAIN MENUS
          </button>
        </div>
      `;
    }
  }

  function renderCourses() {
    const errEl = $('courses-error');
    if (state.err) { errEl.hidden = false; errEl.textContent = state.err; } else { errEl.hidden = true; }

    const allSel = state.courses.length === COURSES.length;
    const btn = $('select-all-btn');
    btn.className = 'select-all-btn' + (allSel ? ' is-all' : '');
    btn.innerHTML = h`
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${allSel ? ICON_CLOSE : ICON_CHECK}"></path></svg>
      ${allSel ? 'CLEAR ALL' : 'SELECT ALL'}
    `;

    $('course-list').innerHTML = COURSES.map(c => {
      const sel = state.courses.includes(c.id);
      return h`
        <button class="course-btn ${sel ? 'is-sel' : ''}" data-action="toggle-course" data-value="${c.id}">
          <div class="icon-slot">${icon(COURSE_ICONS[c.id], 30)}</div>
          <div class="label">${c.label}</div>
        </button>
      `;
    }).join('');
  }

  function renderChains() {
    $('chain-cats').innerHTML = CHAIN_CATS.map(cat => h`
      <button class="chip ${state.chainCat === cat ? 'is-sel' : ''}" data-action="pick-chain-cat" data-value="${cat}">${cat.toUpperCase()}</button>
    `).join('');

    const q = state.chainQuery.trim().toLowerCase();
    const list = CHAINS
      .filter(ch => state.chainCat === 'All' || ch.cat === state.chainCat)
      .filter(ch => !q || ch.name.toLowerCase().includes(q));

    $('chain-list').innerHTML = list.length ? list.map(ch => {
      const initials = ch.name.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
      return h`
        <button class="chain-row" data-action="pick-chain" data-value="${escapeHtml(ch.name)}">
          <div class="hex-init hex">${initials}</div>
          <div class="info">
            <div class="name">${escapeHtml(ch.name)}</div>
            <div class="cat">${ch.cat.toUpperCase()}</div>
          </div>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="${ICON_CHEVRON_RIGHT}"></path></svg>
        </button>
      `;
    }).join('') : h`<div class="empty-note">No chains match that search.</div>`;
  }

  function renderError() {
    const kind = state.errKind;
    const title = kind === 'bugged' ? "THAT FILE WOULDN'T OPEN" : "COULDN'T READ THAT MENU";
    const body = state.errCustomBody || (kind === 'bugged'
      ? "The attachment came through corrupted or in a format we can't read, so there was nothing to scan."
      : "We couldn't make out any real menu items in what came through. The photo may be blurry or the text unclear.");
    const tips = kind === 'bugged'
      ? ["Re-export it as a PDF, JPG or PNG", "Check the file isn't password-protected", "Or just type the menu in by hand"]
      : ["Hold steady and get the whole menu in frame", "Make sure there's enough light", "Or type the items in yourself"];
    $('error-title').textContent = title;
    $('error-body').textContent = body;
    $('error-tips').innerHTML = tips.map(t => h`
      <li><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON_CHEVRON_RIGHT}"></path></svg><span>${escapeHtml(t)}</span></li>
    `).join('');
  }

  // ── Results rendering ─────────────────────────────────────────────
  function dishCardHtml(d, hasTarget, calTarget) {
    const isPick = d.status === 'pick';
    const statusClass = isPick ? 'pick' : 'avoid';
    const pctDay = hasTarget ? Math.round((d.kcal / calTarget) * 100) : null;
    let macrosHtml = '';
    if (d.emptyCalories) {
      macrosHtml = h`
        <div class="macro-bar"><div style="width:100%;background:var(--kcal-blue);box-shadow:0 0 8px rgba(63,132,217,0.5)"></div></div>
        <div class="empty-cal-note">EMPTY CALORIES · NO MACROS</div>
      `;
    } else {
      const pCal = d.protein * 4, cCal = d.carbs * 4, fCal = d.fat * 9;
      const tot = pCal + cCal + fCal || 1;
      const pP = Math.round(pCal / tot * 100), pC = Math.round(cCal / tot * 100), pF = Math.round(fCal / tot * 100);
      macrosHtml = h`
        <div class="macro-bar">
          <div style="width:${pP}%;background:var(--amber)"></div>
          <div style="width:${pC}%;background:var(--accent);box-shadow:0 0 8px var(--accent-glow)"></div>
          <div style="width:${pF}%;background:var(--coral)"></div>
        </div>
        <div class="macro-bar-legend"><span style="color:var(--amber)">PROTEIN</span><span style="color:var(--accent)">CARBS</span><span style="color:var(--coral)">FAT</span></div>
      `;
    }
    return h`
      <div class="dish-card">
        <div class="dish-card-head">
          <div class="status-pill ${statusClass}">${isPick ? 'PICK' : 'HEADS UP'}</div>
          ${hasTarget ? h`<div class="pct-pill ${statusClass}">${pctDay}% OF DAY</div>` : ''}
        </div>
        <div class="dish-name">${escapeHtml(d.name)}</div>
        <div class="dish-note">${escapeHtml(d.note)}</div>
        <div style="margin-top:12px">
          <div class="macro-row">
            <div class="macro-item" style="color:var(--kcal-blue)"><div class="ic">${icon('flame')}</div><div class="lbl">KCAL</div><div class="val">${d.kcal}</div></div>
            <div class="macro-item" style="color:var(--amber)"><div class="ic">${icon('steak')}</div><div class="lbl">PROT</div><div class="val">${d.protein}g</div></div>
            <div class="macro-item" style="color:var(--accent)"><div class="ic">${icon('bread')}</div><div class="lbl">CARB</div><div class="val">${d.carbs}g</div></div>
            <div class="macro-item" style="color:var(--coral)"><div class="ic">${icon('oil')}</div><div class="lbl">FAT</div><div class="val">${d.fat}g</div></div>
          </div>
          ${macrosHtml}
        </div>
      </div>
    `;
  }

  function renderResults(data) {
    const calTarget = parseInt(state.cals, 10);
    const hasTarget = !!calTarget && calTarget > 0;
    $('results-meta').textContent = '// FOR ' + (state.name.trim().toUpperCase() || 'YOU') + ' · ' + goalLabel(state.goal) + ' · ' + (state.cals ? '~' + state.cals + ' KCAL' : 'EST. TARGET');

    const sections = (data.sections || []).slice().sort((a, b) => {
      const ia = RESULTS_ORDER.indexOf(a.course), ib = RESULTS_ORDER.indexOf(b.course);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    const courseLabel = id => (COURSES.find(c => c.id === id) || {}).label || id.toUpperCase();

    $('results-sections').innerHTML = sections.map(sec => {
      if (!sec.dishes || !sec.dishes.length) {
        return h`
          <div>
            <div class="result-section-head">
              <div class="result-section-icon">${icon(COURSE_ICONS[sec.course] || 'dinner-plate', 34)}</div>
              <div class="result-section-label">${courseLabel(sec.course)}</div>
            </div>
            <div class="empty-note">Nothing stood out on the menu for this course.</div>
          </div>
        `;
      }
      return h`
        <div>
          <div class="result-section-head">
            <div class="result-section-icon">${icon(COURSE_ICONS[sec.course] || 'dinner-plate', 34)}</div>
            <div class="result-section-label">${courseLabel(sec.course)}</div>
          </div>
          <div class="dish-list">${sec.dishes.map(d => dishCardHtml(d, hasTarget, calTarget)).join('')}</div>
        </div>
      `;
    }).join('') + h`<div class="results-disclaimer">Calorie and macro figures are rough estimates, not gospel.</div>`;

    $('craving-input').value = '';
    $('craving-result').innerHTML = '';
    $('craving-err').hidden = true;
  }

  // ── Screen switching ─────────────────────────────────────────────
  function render() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const active = document.querySelector(`.screen[data-screen="${state.screen}"]`);
    if (active) active.classList.add('active');
    window.scrollTo(0, 0);

    if (state.screen === 'profile') {
      $('input-cals').value = state.cals;
      renderGoalRow('profile-goal-row');
      renderChips('profile-chips');
      const errEl = $('profile-error');
      if (state.err) { errEl.hidden = false; errEl.textContent = state.err; } else { errEl.hidden = true; }
    } else if (state.screen === 'scanner') {
      renderScanner();
    } else if (state.screen === 'courses') {
      renderCourses();
    } else if (state.screen === 'chains') {
      $('chain-search').value = state.chainQuery;
      renderChains();
    } else if (state.screen === 'error') {
      renderError();
    } else if (state.screen === 'settings') {
      $('settings-input-name').value = state.name;
      $('settings-input-cals').value = state.cals;
      $('settings-initials').textContent = initialsFor(state.name);
      $('settings-name').textContent = state.name.trim().toUpperCase() || 'YOU';
      $('settings-email').textContent = state.email.trim() || '—';
      renderGoalRow('settings-goal-row');
      renderChips('settings-chips');
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('is-sel', b.dataset.theme === state.theme));
      $('btn-save-settings').textContent = state.saved ? 'SAVED' : 'SAVE CHANGES';
    } else if (state.screen === 'auth') {
      renderAuth();
    } else if (state.screen === 'set-password') {
      const errEl = $('set-password-error');
      if (state.setPwErr) { errEl.hidden = false; errEl.textContent = state.setPwErr; } else { errEl.hidden = true; }
    }
  }

  // A token is good for one request. Every attempt spends it, and the widget
  // is reset to fetch the next one.
  let turnstileWidget = null;
  let turnstileLoading = null;

  function loadTurnstile() {
    if (!turnstileLoading) {
      turnstileLoading = new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        el.async = true;
        el.onload = () => resolve(window.turnstile);
        el.onerror = () => { turnstileLoading = null; reject(new Error('turnstile failed to load')); };
        document.head.appendChild(el);
      });
    }
    return turnstileLoading;
  }

  async function mountTurnstile() {
    if (!needCaptcha || turnstileWidget !== null) return;
    $('turnstile-slot').hidden = false;
    turnstileWidget = 'pending';
    try {
      const ts = await loadTurnstile();
      turnstileWidget = ts.render('#turnstile-slot', {
        sitekey: TURNSTILE_SITE_KEY,
        theme: isDark() ? 'dark' : 'light',
        size: 'flexible',
        callback: (token) => { state.captchaToken = token; renderAuth(); },
        'expired-callback': () => { state.captchaToken = null; renderAuth(); },
        'error-callback': () => {
          state.captchaToken = null;
          state.authErr = "The security check didn't load. Check your connection and refresh.";
          renderAuth();
        },
      });
    } catch (e) {
      turnstileWidget = null;
      state.authErr = "The security check didn't load. Check your connection and refresh.";
      renderAuth();
    }
  }

  function spendCaptcha() {
    const token = state.captchaToken || undefined;
    state.captchaToken = null;
    if (window.turnstile && turnstileWidget && turnstileWidget !== 'pending') window.turnstile.reset(turnstileWidget);
    return token;
  }

  const captchaReady = () => !needCaptcha || !!state.captchaToken;
  const CAPTCHA_WAIT = 'One moment, finishing the security check.';

  function renderAuth() {
    mountTurnstile();
    $('auth-submit-btn').disabled = state.authBusy || !captchaReady();
    const isSignup = state.authMode === 'signup';
    $('auth-heading').textContent = isSignup ? 'CREATE ACCOUNT' : 'SIGN IN';
    $('auth-subtext').textContent = isSignup
      ? 'Takes 30 seconds. Get your first picks in a minute.'
      : 'Welcome back. Sign in to keep scanning.';
    $('auth-name-field').hidden = !isSignup;
    $('auth-forgot-row').hidden = isSignup;
    $('auth-submit-btn').textContent = isSignup ? 'CREATE ACCOUNT' : 'SIGN IN';
    const toggleBtn = document.querySelector('[data-action="auth-toggle-mode"]');
    if (toggleBtn) toggleBtn.textContent = isSignup ? 'ALREADY HAVE AN ACCOUNT? SIGN IN' : 'NO ACCOUNT? SIGN UP';
    const errEl = $('auth-error');
    if (state.authErr) { errEl.hidden = false; errEl.textContent = state.authErr; } else { errEl.hidden = true; }
    const resetEl = $('auth-reset-msg');
    if (state.resetMsg) { resetEl.hidden = false; resetEl.textContent = state.resetMsg; } else { resetEl.hidden = true; }
  }

  // ── Carousel ─────────────────────────────────────────────
  setInterval(() => {
    state.egIndex = (state.egIndex + 1) % EG_IDEAS.length;
    if (state.screen === 'scanner') {
      const line = $('eg-line');
      line.style.animation = 'none';
      // eslint-disable-next-line no-unused-expressions
      line.offsetHeight;
      line.style.animation = '';
      line.textContent = '"' + EG_IDEAS[state.egIndex] + '"';
    }
  }, 3600);

  // ── Gibberish / bad-input detection (typed text only) ─────────
  function detectGibberish(text) {
    const words = text.trim().split(/\s+/);
    const wordish = words.filter(w => /^[a-z]{2,}$/i.test(w) && /[aeiou]/i.test(w));
    const ratio = wordish.length / words.length;
    if (words.length >= 3 && ratio < 0.35) return true;
    const longRandom = /[bcdfghjklmnpqrstvwxz]{6,}/i.test(text.replace(/\s/g, ''));
    if (longRandom && ratio < 0.6) return true;
    return false;
  }

  // ── API ─────────────────────────────────────────────
  function buildProfilePayload() {
    return {
      name: state.name.trim(),
      goal: state.goal,
      calorieTarget: state.cals ? parseInt(state.cals, 10) : null,
      restrictions: state.restrictions,
    };
  }

  async function callAnalyse(body) {
    // getSession refreshes the token if it has expired, so a scan after the
    // phone has been in a pocket all evening still goes through.
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/analyse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (session ? session.access_token : ''),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Something went wrong. Try again.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ── Action handlers ─────────────────────────────────────────────
  const actions = {
    'go-auth': () => { state.authMode = 'signup'; state.authErr = null; state.resetMsg = null; go('auth'); },
    'go-settings': () => go('settings'),
    'go-chains': () => go('chains'),
    'back-to-scanner': () => go('scanner'),
    'back-from-settings': () => go('scanner'),

    'attach-photo': () => $('camera-input').click(),
    'remove-photo': () => { state.photoData = null; state.photoType = null; state.photoName = ''; render(); },
    'attach-doc': () => $('doc-input').click(),
    'remove-doc': () => { state.hasDoc = false; state.docName = ''; state.chainName = ''; render(); },

    'pick-goal': (val) => { state.goal = val; state.err = null; render(); },
    'toggle-restriction': (val) => {
      if (val === 'None') { state.restrictions = []; state.touchedRestrictions = true; }
      else {
        state.restrictions = state.restrictions.includes(val)
          ? state.restrictions.filter(x => x !== val)
          : [...state.restrictions, val];
        state.touchedRestrictions = true;
      }
      render();
    },

    'save-profile': async () => {
      state.cals = $('input-cals').value.trim();
      if (!state.goal) { state.err = 'Please select your goal.'; render(); return; }
      const updates = {
        goal: state.goal,
        cals: state.cals ? parseInt(state.cals, 10) : null,
        restrictions: state.restrictions,
      };
      const { error } = await supabase.from('profiles').update(updates).eq('id', state.session.user.id);
      if (error) { state.err = 'Could not save your profile. Try again.'; render(); return; }
      go('scanner');
    },

    'toggle-course': (val) => {
      state.courses = state.courses.includes(val) ? state.courses.filter(x => x !== val) : [...state.courses, val];
      state.err = null;
      render();
    },
    'toggle-all-courses': () => {
      state.courses = state.courses.length === COURSES.length ? [] : COURSES.map(c => c.id);
      state.err = null;
      render();
    },

    'pick-chain-cat': (val) => { state.chainCat = val; render(); },
    'pick-chain': (val) => {
      state.hasDoc = true;
      state.docName = val + ' menu';
      state.chainName = val;
      state.photoData = null; state.photoType = null;
      state.menuText = '';
      go('scanner');
    },

    'analyse': () => runAnalyse(),
    'get-recommendations': () => runRecommendations(),

    'err-retry': () => { resetScan(); go('scanner'); },
    'err-type': () => {
      resetScan();
      go('scanner');
      setTimeout(() => $('input-menu-text').focus(), 300);
    },

    'scan-another': () => {
      state.photoData = null; state.photoType = null; state.photoName = '';
      state.menuText = ''; state.cravingText = ''; state.err = null;
      go('scanner');
    },
    'craving-submit': () => runCraving(),

    'set-theme': async (val) => {
      state.theme = val; applyTheme(); render();
      if (state.session) await supabase.from('profiles').update({ theme: val }).eq('id', state.session.user.id);
    },
    'save-settings': async () => {
      state.name = $('settings-input-name').value.trim();
      state.cals = $('settings-input-cals').value.trim();
      const updates = {
        name: state.name,
        goal: state.goal,
        cals: state.cals ? parseInt(state.cals, 10) : null,
        restrictions: state.restrictions,
        theme: state.theme,
      };
      const { error } = await supabase.from('profiles').update(updates).eq('id', state.session.user.id);
      if (error) { state.err = 'Could not save your changes. Try again.'; render(); return; }
      state.saved = true;
      render();
      setTimeout(() => { state.saved = false; go('scanner'); }, 900);
    },

    'auth-toggle-mode': () => {
      state.authMode = state.authMode === 'signup' ? 'signin' : 'signup';
      state.authErr = null; state.resetMsg = null;
      render();
    },
    'auth-forgot': async () => {
      const email = $('auth-email').value.trim();
      state.resetMsg = null;
      if (!email) { state.authErr = 'Enter your email above, then tap "Forgot password".'; render(); return; }
      if (!captchaReady()) { state.authErr = CAPTCHA_WAIT; render(); return; }
      state.authErr = null;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
        captchaToken: spendCaptcha(),
      });
      if (error) { state.authErr = error.message; render(); return; }
      state.resetMsg = `A password reset link has been sent to ${email}.`;
      render();
    },
    'auth-submit': async () => {
      const email = $('auth-email').value.trim();
      const password = $('auth-password').value;
      state.authErr = null; state.resetMsg = null;
      if (!email || !password) { state.authErr = 'Enter your email and password.'; render(); return; }
      if (!captchaReady()) { state.authErr = CAPTCHA_WAIT; render(); return; }

      const captchaToken = spendCaptcha();
      state.authBusy = true; render();
      try {
        if (state.authMode === 'signin') {
          const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
          if (error) state.authErr = error.message;
        } else {
          const name = $('auth-name').value.trim();
          const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name }, captchaToken } });
          if (error) state.authErr = error.message;
          else if (data.session) { state.authBusy = false; await handleSessionChange(data.session); return; }
        }
      } finally {
        state.authBusy = false;
      }
      render();
    },

    'set-password-submit': async () => {
      const pw = $('new-password').value;
      const pw2 = $('new-password-2').value;
      state.setPwErr = null;
      if (pw.length < 6) { state.setPwErr = 'Password must be at least 6 characters.'; render(); return; }
      if (pw !== pw2) { state.setPwErr = 'Passwords do not match.'; render(); return; }
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) { state.setPwErr = error.message; render(); return; }
      state.needsPassword = false;
      go(state.goal ? 'scanner' : 'profile');
    },

    'sign-out': async () => {
      await supabase.auth.signOut();
      state.authMode = 'signin';
      handleSessionChange(null);
    },
    'boot-retry': () => window.location.reload(),
  };

  function resetScan() {
    state.photoData = null; state.photoType = null; state.photoName = '';
    state.hasDoc = false; state.docName = ''; state.chainName = '';
    state.menuText = ''; state.err = null;
  }

  function showError(kind, customBody) {
    state.errKind = kind;
    state.errCustomBody = customBody || null;
    go('error');
  }

  async function runAnalyse() {
    state.menuText = $('input-menu-text').value;
    if (!state.photoData && !state.hasDoc && !state.menuText.trim()) {
      state.err = "Take a photo, upload a menu, browse a chain, or type in what's on offer before submitting.";
      render();
      return;
    }
    if (!state.photoData && !state.hasDoc && state.menuText.trim() && detectGibberish(state.menuText)) {
      showError('gibberish');
      return;
    }
    go('courses');
  }

  async function runRecommendations() {
    if (!state.courses.length) {
      state.err = "Pick at least one course you'd like help with.";
      render();
      return;
    }
    go('loading');
    try {
      const body = { profile: buildProfilePayload(), courses: state.courses };
      if (state.photoData) { body.image = state.photoData; body.imageType = state.photoType; }
      else if (state.chainName) { body.chainName = state.chainName; }
      else { body.menuText = state.menuText; }

      const data = await callAnalyse(body);
      if (data.ok === false) {
        showError('gibberish', data.message);
        return;
      }
      go('results');
      renderResults(data);
    } catch (e) {
      state.screen = 'courses';
      state.err = e.message || 'Something went wrong. Check your connection and try again.';
      render();
    }
  }

  async function runCraving() {
    const text = $('craving-input').value.trim();
    if (!text) return;
    $('craving-err').hidden = true;
    go('loading');
    try {
      const data = await callAnalyse({ mode: 'craving', profile: buildProfilePayload(), dish: text });
      go('results');
      if (data.ok === false) {
        $('craving-err').hidden = false;
        $('craving-err').textContent = data.message || "Couldn't work that one out. Try describing it differently.";
        return;
      }
      const calTarget = parseInt(state.cals, 10);
      const hasTarget = !!calTarget && calTarget > 0;
      $('craving-result').innerHTML = dishCardHtml(data.dish, hasTarget, calTarget);
    } catch (e) {
      go('results');
      $('craving-err').hidden = false;
      $('craving-err').textContent = e.message || 'Something went wrong. Try again.';
    }
  }

  // ── File handling ─────────────────────────────────────────────
  // Phone cameras produce 3-6MB photos at 4000px+. Sent as-is they break two
  // limits: Vercel rejects request bodies over 4.5MB, and Claude rejects images
  // over 5MB - and base64 adds a third on top. 1600px on the long edge is still
  // plenty to read a menu, and comes out at a few hundred KB as a JPEG.
  // Same approach as src/lib/imageCompress.js in the HS PT app.
  const PHOTO_MAX_EDGE = 1600;
  const PHOTO_QUALITY = 0.85;

  function readAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function shrinkPhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = url;
      });
      const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      // White under the image, so a transparent PNG doesn't turn black as a JPEG.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY));
      if (!blob) throw new Error('encode failed');
      return { blob, type: 'image/jpeg' };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  $('camera-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    state.hasDoc = false; state.docName = ''; state.chainName = '';
    state.err = null;

    // If the browser can't decode it (HEIC on desktop Chrome, say), fall back
    // to the original - fine if it's small, and the size check below catches
    // it if not.
    let out = { blob: file, type: file.type };
    try { out = await shrinkPhoto(file); } catch (err) { /* keep the original */ }

    if (out.blob.size > 3 * 1024 * 1024) {
      state.photoData = null; state.photoType = null; state.photoName = '';
      state.err = "That photo's too large to send. Try a screenshot of it, or type in a few items instead.";
      $('camera-input').value = '';
      render();
      return;
    }

    const dataUrl = await readAsDataUrl(out.blob);
    state.photoType = out.type;
    state.photoName = file.name;
    state.photoData = dataUrl.split(',')[1];
    render();
  });

  $('doc-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    state.photoData = null; state.photoType = null; state.photoName = '';

    const isPdf = file.type === 'application/pdf';
    const isDocx = file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isDoc = file.name.endsWith('.doc') || file.type === 'application/msword';

    if (isPdf) {
      const reader = new FileReader();
      reader.onload = (e2) => {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        pdfjsLib.getDocument({ data: e2.target.result }).promise
          .then(pdf => {
            const pagePromises = [];
            for (let i = 1; i <= pdf.numPages; i++) {
              pagePromises.push(pdf.getPage(i).then(page => page.getTextContent().then(c => c.items.map(it => it.str).join(' '))));
            }
            return Promise.all(pagePromises);
          })
          .then(pages => {
            const text = pages.join('\n').trim();
            if (!text) { showError('bugged', "This PDF doesn't contain selectable text. It's probably a scanned image, so take a photo of the menu instead."); $('doc-input').value = ''; return; }
            state.menuText = text;
            state.hasDoc = true; state.docName = file.name;
            render();
          })
          .catch(() => { showError('bugged'); $('doc-input').value = ''; });
      };
      reader.readAsArrayBuffer(file);
    } else if (isDocx) {
      const reader = new FileReader();
      reader.onload = (e2) => {
        mammoth.extractRawText({ arrayBuffer: e2.target.result })
          .then(result => {
            const text = result.value.trim();
            if (!text) { showError('bugged'); $('doc-input').value = ''; return; }
            state.menuText = text;
            state.hasDoc = true; state.docName = file.name;
            render();
          })
          .catch(() => { showError('bugged'); $('doc-input').value = ''; });
      };
      reader.readAsArrayBuffer(file);
    } else if (isDoc) {
      state.err = 'Older .doc files are not supported. Save the menu as .docx or PDF and try again.';
      render();
      $('doc-input').value = '';
    } else {
      state.err = 'Please upload a PDF or Word document (.pdf, .docx).';
      render();
      $('doc-input').value = '';
    }
  });

  $('input-menu-text').addEventListener('input', (e) => { state.menuText = e.target.value; state.err = null; });
  $('input-cals').addEventListener('input', (e) => { state.cals = e.target.value; });
  $('settings-input-name').addEventListener('input', (e) => { state.name = e.target.value; });
  $('settings-input-cals').addEventListener('input', (e) => { state.cals = e.target.value; });
  $('chain-search').addEventListener('input', (e) => { state.chainQuery = e.target.value; renderChains(); });
  $('craving-input').addEventListener('input', (e) => { state.cravingText = e.target.value; });

  // ── Click delegation for data-action ─────────────────────────
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const value = btn.dataset.value !== undefined ? btn.dataset.value : btn.dataset.theme;
    if (actions[action]) actions[action](value, btn);
  });

  // ── Auth / session boot ─────────────────────────────────────────────
  function fetchProfileWithTimeout(userId) {
    return Promise.race([
      supabase.from('profiles').select('*').eq('id', userId).single()
        .then(({ data, error }) => { if (error) throw error; return data; }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('profile fetch timed out')), 8000)),
    ]);
  }

  let bootWatchdog = null;

  async function handleSessionChange(session) {
    state.session = session;

    if (!session) {
      clearTimeout(bootWatchdog);
      state.profile = null; state.name = ''; state.email = ''; state.goal = null;
      state.cals = ''; state.restrictions = []; state.needsPassword = false;
      state.screen = 'landing';
      render();
      return;
    }

    try {
      const profile = await fetchProfileWithTimeout(session.user.id);
      clearTimeout(bootWatchdog);
      state.profile = profile;
      state.name = profile.name || '';
      state.email = profile.email || session.user.email || '';
      state.goal = profile.goal || null;
      state.cals = profile.cals != null ? String(profile.cals) : '';
      state.restrictions = profile.restrictions || [];
      state.touchedRestrictions = true;
      state.theme = profile.theme || 'system';
      applyTheme();

      if (state.needsPassword) state.screen = 'set-password';
      else if (!state.goal) state.screen = 'profile';
      else state.screen = 'scanner';
      render();
    } catch (e) {
      clearTimeout(bootWatchdog);
      state.screen = 'boot-error';
      render();
    }
  }

  async function boot() {
    bootWatchdog = setTimeout(() => { state.screen = 'boot-error'; render(); }, 10000);

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') state.needsPassword = true;
      handleSessionChange(session);
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      await handleSessionChange(session);
    } catch (e) {
      clearTimeout(bootWatchdog);
      state.screen = 'boot-error';
      render();
    }
  }

  // ── Init ─────────────────────────────────────────────
  applyTheme();
  render();
  boot();
}
