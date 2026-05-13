// Gearnomic � Authentication UI: sign-in/up modal, session management, and password recovery
// ============================================================
// AUTHENTICATION & SYNC UI
// ============================================================

function toggleUserMenu() {
  const menu = document.getElementById('user-menu');
  if (!menu) return;
  const open = menu.style.display === 'block';
  menu.style.display = open ? 'none' : 'block';
}

// Close user menu when clicking anywhere outside it
document.addEventListener('click', e => {
  const btn  = document.getElementById('user-menu-btn');
  const menu = document.getElementById('user-menu');
  if (menu && menu.style.display === 'block' && !btn?.contains(e.target) && !menu.contains(e.target)) {
    menu.style.display = 'none';
  }
});

function setSyncIndicator(status) {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  const states = {
    saving:  '↑ Saving…',
    saved:   'Synced',
    error:   'Sync failed',
    offline: '○ Local only',
    nosync:  '○ Local only',
  };
  el.textContent = states[status] || '';
  el.style.color = status === 'error'  ? 'var(--danger)'
                 : status === 'saved'  ? 'var(--success)'
                 : 'var(--text-3)';
}

function updateHeaderAuth() {
  const userInfo   = document.getElementById('auth-user-info');
  const anonInfo   = document.getElementById('auth-anon-actions');
  const loadingEl  = document.getElementById('auth-loading-indicator');
  const emailEl    = document.getElementById('auth-user-email');
  const nudgeEl    = document.getElementById('sync-upgrade-nudge');
  const tierEl     = document.getElementById('user-menu-tier');
  const footerSignin   = document.getElementById('footer-signin-link');
  const footerSettings = document.getElementById('footer-settings-link');
  if (loadingEl) loadingEl.style.display = 'none';

  if (_user) {
    if (userInfo) userInfo.style.display = 'flex';
    if (anonInfo) anonInfo.style.display = 'none';
    if (emailEl)  emailEl.textContent = _user.email;
    if (footerSignin)   footerSignin.style.display   = 'none';
    if (footerSettings) footerSettings.style.display = '';

    // Sync is free for all signed-in users
    setSyncIndicator('saved');
    if (nudgeEl) nudgeEl.style.display = 'none';

    const badge = typeof tierBadgeHtml === 'function' ? tierBadgeHtml() : '';
    if (_isSupporter || _isAmbassador) {
      if (tierEl) tierEl.innerHTML = `${badge} <span style="color:var(--text-3);font-size:12px">· Sync active</span>`;
    } else {
      if (tierEl) tierEl.innerHTML = `
        <span style="color:var(--text-2)">Free plan</span> <span style="color:var(--text-3)">· Sync active</span>
        <button onclick="openUpgradeModal();toggleUserMenu()" style="display:block;margin-top:6px;width:100%;background:var(--primary);color:#fff;border:none;border-radius:var(--r-md);padding:6px 10px;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;text-align:center">Upgrade — $2/mo or $12/yr</button>`;
    }
  } else {
    if (userInfo) userInfo.style.display = 'none';
    if (anonInfo) anonInfo.style.display = 'flex';
    if (nudgeEl)  nudgeEl.style.display  = 'none';
    if (footerSignin)   footerSignin.style.display   = '';
    if (footerSettings) footerSettings.style.display = 'none';
    setSyncIndicator('offline');
  }
}

// ── Auth modal viewport handling (mobile keyboard) ───────
// When the virtual keyboard opens on iOS/Android, visualViewport shrinks.
// We resize the overlay to match so the modal stays in the visible area.
const _authVP = (() => {
  function update() {
    const el = document.getElementById('auth-modal-overlay');
    if (!el || el.style.display === 'none') return;
    const vv = window.visualViewport;
    el.style.height = vv.height + 'px';
    el.style.top    = (vv.offsetTop || 0) + 'px';
  }
  return {
    start() {
      if (!window.visualViewport) return;
      window.visualViewport.addEventListener('resize', update);
      window.visualViewport.addEventListener('scroll', update);
      update();
    },
    stop() {
      if (!window.visualViewport) return;
      window.visualViewport.removeEventListener('resize', update);
      window.visualViewport.removeEventListener('scroll', update);
      const el = document.getElementById('auth-modal-overlay');
      if (el) { el.style.height = ''; el.style.top = ''; }
    }
  };
})();

// Scroll focused input into view after keyboard animation settles
document.addEventListener('focusin', e => {
  if (e.target.closest?.('#auth-modal-overlay')) {
    setTimeout(() => e.target.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }), 350);
  }
});

function showAuthModal() {
  const el = document.getElementById('auth-modal-overlay');
  if (el) { el.style.display = 'flex'; }
  _authVP.start();
  setTimeout(() => document.getElementById('auth-email')?.focus(), 100);
}

function hideAuthModal() {
  const el = document.getElementById('auth-modal-overlay');
  if (el) { el.style.display = 'none'; }
  _authVP.stop();
}

function switchAuthTab(tab) {
  const isSignin = tab === 'signin';
  const signinTab = document.getElementById('auth-tab-signin');
  const signupTab = document.getElementById('auth-tab-signup');
  const btn = document.getElementById('auth-submit-btn');
  const pwInput = document.getElementById('auth-password');
  const form = document.getElementById('auth-form');
  if (signinTab) {
    signinTab.style.borderBottomColor = isSignin ? '#2A4032' : 'transparent';
    signinTab.style.color = isSignin ? '#2A4032' : '#888';
    signinTab.style.fontWeight = isSignin ? '500' : '400';
  }
  if (signupTab) {
    signupTab.style.borderBottomColor = !isSignin ? '#2A4032' : 'transparent';
    signupTab.style.color = !isSignin ? '#2A4032' : '#888';
    signupTab.style.fontWeight = !isSignin ? '500' : '400';
  }
  if (btn) btn.textContent = isSignin ? 'Sign in' : 'Create account';
  // Switch autocomplete so password managers save on signup, fill on signin
  if (pwInput) pwInput.autocomplete = isSignin ? 'current-password' : 'new-password';
  if (form) form.autocomplete = 'on';
  const errEl = document.getElementById('auth-error');
  if (errEl) errEl.style.display = 'none';
  document.getElementById('auth-email')?.focus();
}

function setAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.innerHTML = esc(msg);
  el.style.display = msg ? 'block' : 'none';
}

async function diagnoseSupabase() {
  // Helper — show in modal error div OR fall back to alert
  function show(html, color) {
    const el = document.getElementById('auth-error');
    if (el) {
      el.style.display = 'block';
      el.style.background = color === 'green' ? '#eaf4ee' : color === 'blue' ? '#e8f4fd' : '#fdeaea';
      el.style.color      = color === 'green' ? '#1c5736' : color === 'blue' ? '#124471' : '#8c2020';
      el.innerHTML = html;
    } else {
      // Modal not visible — use toast + console
      toast('Check browser console (F12) for Supabase diagnostics');
      console.group('Gearnomic — Supabase Diagnostics');
      console.log(html.replace(/<[^>]+>/g, ''));
      console.groupEnd();
    }
  }

  // Step 1 — is config.js loaded at all?
  if (typeof SUPABASE_URL === 'undefined') {
    show('<strong>config.js not loaded.</strong> Make sure <code>js/config.js</code> is in your repo and listed in index.html before app.js.', 'red');
    return;
  }

  // Step 2 — are placeholder values still in place?
  if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_PROJECT_URL') {
    show(`<strong>Project URL not set.</strong> The value currently being read from <code>config.js</code> is:<br>
<code style="word-break:break-all;background:rgba(0,0,0,.06);padding:2px 5px;border-radius:3px">${SUPABASE_URL || '(empty)'}</code><br><br>
If that doesn't match what you put in the file, GitHub Pages is serving a <strong>cached old version</strong> of config.js. Try:<br>
1. Hard refresh: <strong>Ctrl+Shift+R</strong> (Windows) / <strong>Cmd+Shift+R</strong> (Mac)<br>
2. Open an Incognito/Private window and try there<br>
3. Wait 2–5 minutes for GitHub Pages CDN to clear, then retry`, 'red');
    return;
  }
  if (!SUPABASE_ANON || SUPABASE_ANON === 'YOUR_ANON_PUBLIC_KEY') {
    show('<strong>Anon key not set.</strong> Open <code>js/config.js</code> and replace <code>YOUR_ANON_PUBLIC_KEY</code> with your anon key from Supabase → Settings → API.', 'red');
    return;
  }

  // Step 3 — URL format check
  const cleanUrl = SUPABASE_URL.trim().replace(/\/$/, '');
  if (!cleanUrl.startsWith('https://') || !cleanUrl.includes('.supabase.co')) {
    show(`<strong>URL format looks wrong.</strong><br>Expected: <code>https://abc123.supabase.co</code><br>Got: <code>${cleanUrl}</code><br>Copy it fresh from Supabase → Settings → API.`, 'red');
    return;
  }

  // Step 4 — actually try to reach the project
  show('Testing connection…', 'blue');
  try {
    const controller = new AbortController();
    const _fetchTimeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${cleanUrl}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON.trim() },
      signal: controller.signal,
    });
    clearTimeout(_fetchTimeout);

    if (res.status === 200) {
      const body = await res.json().catch(() => ({}));
      const emailEnabled = body?.external?.email !== false;
      if (emailEnabled) {
        show('<strong>Connection OK and Email auth is enabled.</strong> If sign-in still fails, double-check your email/password, or try "Create account" first.', 'green');
      } else {
        show('Connected, but <strong>Email auth is disabled</strong> in your Supabase project.<br>Go to Supabase → Authentication → Providers → Email → enable it.', 'red');
      }
    } else if (res.status === 401 || res.status === 403) {
      show(`<strong>Anon key rejected (${res.status}).</strong> Your key may have extra spaces or be from a different project. Copy it fresh from Supabase → Settings → API → anon public.`, 'red');
    } else {
      show(`<strong>Unexpected response ${res.status}.</strong> Your project may be paused. <a href="${cleanUrl}" target="_blank" style="color:inherit">Open your Supabase dashboard</a> to check — free projects pause after 7 days idle.`, 'red');
    }
  } catch(err) {
    // True network failure
    show(`<strong>Cannot reach Supabase.</strong> Most likely causes:<br>
1. <strong>Project is paused</strong> — free tier pauses after 7 days idle. <a href="https://supabase.com/dashboard" target="_blank" style="color:inherit">Open Supabase dashboard</a> and click "Restore".<br>
2. <strong>URL has a typo</strong> — currently using: <code style="word-break:break-all">${cleanUrl}</code><br>
3. <strong>Network/firewall</strong> blocking the request on this device.<br>
<span style="font-size:11px;opacity:.7">Error: ${err.message}</span>`, 'red');
  }
}

async function submitAuth() {
  const btn = document.getElementById('auth-submit-btn');
  const isSignup = btn?.textContent?.includes('Create');
  const email    = document.getElementById('auth-email')?.value.trim();
  const password = document.getElementById('auth-password')?.value;
  setAuthError('');

  if (!email || !password) { setAuthError('Please enter your email and password.'); return; }

  if (!_supabaseReady()) {
    await diagnoseSupabase();
    return;
  }

  if (btn) { btn.textContent = isSignup ? 'Creating account…' : 'Signing in…'; btn.disabled = true; }

  // Abort after 15 s so the button never stays frozen indefinitely
  const _authAbort = new AbortController();
  const _authTimeout = setTimeout(() => {
    _authAbort.abort();
    if (btn) { btn.textContent = isSignup ? 'Create account' : 'Sign in'; btn.disabled = false; }
    setAuthError('Sign-in is taking too long. Please check your connection and try again.');
  }, 10000);

  try {
    const { data, error } = isSignup
      ? await _sb.auth.signUp({ email, password })
      : await _sb.auth.signInWithPassword({ email, password });
    clearTimeout(_authTimeout);

    if (error) throw error;

    if (isSignup && data?.user && !data.session) {
      // Replace auth modal contents with a clear confirmation screen
      hideAuthModal();
      openModal('Check your inbox', `
        <div style="text-align:center;padding:1rem 0 .5rem">
          <div style="font-size:52px;margin-bottom:1rem"></div>
          <p style="font-size:15px;font-weight:500;margin-bottom:.5rem;color:var(--text-1)">
            Confirmation email sent to:
          </p>
          <p style="font-size:14px;color:var(--primary);font-weight:600;margin-bottom:1.25rem;word-break:break-all">
            ${esc(email)}
          </p>
          <p style="font-size:13px;color:var(--text-2);line-height:1.7;margin-bottom:1rem">
            Click the link in that email to activate your account.<br>
            <span style="color:var(--text-3)">Don't see it? Check your spam folder.</span>
          </p>
          <p style="font-size:12px;color:var(--text-3);line-height:1.6">
            Once confirmed, come back here and sign in.
          </p>
        </div>
        <div class="form-actions" style="justify-content:center">
          <button class="btn btn-primary" onclick="closeModal();showAuthModal()">Sign in</button>
          <button class="btn btn-ghost" onclick="closeModal()">Done</button>
        </div>`);
      return;
    }
    // Auth state change listener handles the rest
  } catch(e) {
    clearTimeout(_authTimeout);
    if (btn) { btn.textContent = isSignup ? 'Create account' : 'Sign in'; btn.disabled = false; }
    const msg = e.message || '';
    if (msg.toLowerCase().includes('networkerror') || msg.toLowerCase().includes('fetch')) {
      setAuthError('Connection error. Please check your internet connection and try again.');
    } else if (msg.includes('Invalid login credentials')) {
      setAuthError('Wrong email or password. Try again, or use "Create account" to register.');
    } else if (msg.includes('Email not confirmed')) {
      setAuthError('Check your inbox — you need to confirm your email before signing in.');
    } else if (msg.includes('User already registered')) {
      setAuthError('An account with this email exists. Switch to "Sign in" instead.');
    } else {
      setAuthError('Something went wrong. Please try again.');
    }
  }
}

async function signOut() {
  if (_supabaseReady()) await _sb.auth.signOut();
  _user = null;
  _isSupporter = false;
  _isAmbassador = false;
  _supporterSince = null;
  // Clear local data so the next user/session starts fresh
  try { localStorage.removeItem('trailkit_v1'); } catch(e) {}
  // Reset to demo state
  loadState();
  refreshAll();
  updateHeaderAuth();
  toast('Signed out.');
}

async function continueWithoutAccount() {
  hideAuthModal();
  updateHeaderAuth();
}

// ============================================================
// FORGOT PASSWORD & RECOVERY
// ============================================================

function showForgotPassword() {
  document.getElementById('forgot-panel').style.display = 'block';
  document.getElementById('auth-error').style.display = 'none';
  const email = document.getElementById('auth-email')?.value;
  const fp = document.getElementById('forgot-email');
  if (fp && email) fp.value = email;
  setTimeout(() => fp?.focus(), 50);
}

function hideForgotPassword() {
  document.getElementById('forgot-panel').style.display = 'none';
}

async function sendPasswordReset() {
  const email = document.getElementById('forgot-email')?.value.trim();
  if (!email) { document.getElementById('forgot-email')?.focus(); return; }
  if (!_supabaseReady()) { setAuthError('Supabase not configured.'); return; }

  const btn = document.querySelector('#forgot-panel button');
  if (btn) { btn.textContent = 'Sending…'; btn.disabled = true; }

  const { error } = await _sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href.split('#')[0],
  });

  if (btn) { btn.textContent = 'Send reset link'; btn.disabled = false; }

  if (error) {
    setAuthError(error.message);
  } else {
    document.getElementById('forgot-panel').innerHTML = `
      <div style="text-align:center;padding:.5rem 0">
        <div style="font-size:24px;margin-bottom:.5rem"></div>
        <div style="font-size:14px;font-weight:500;margin-bottom:.375rem">Check your inbox</div>
        <p style="font-size:12px;color:#888">A reset link has been sent to <strong>${esc(email)}</strong>. Click it to set a new password.</p>
      </div>`;
  }
}

async function submitNewPassword() {
  const pw = document.getElementById('new-password')?.value;
  if (!pw || pw.length < 6) {
    setAuthError('Password must be at least 6 characters.');
    return;
  }
  if (!_supabaseReady()) return;

  const btn = document.querySelector('#recovery-panel button');
  if (btn) { btn.textContent = 'Updating…'; btn.disabled = true; }

  const { error } = await _sb.auth.updateUser({ password: pw });

  if (btn) { btn.textContent = 'Update password'; btn.disabled = false; }

  if (error) {
    setAuthError(error.message);
  } else {
    document.getElementById('recovery-panel').style.display = 'none';
    hideAuthModal();
    toast('Password updated! You are now signed in.');
  }
}

