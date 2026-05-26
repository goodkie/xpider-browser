(() => {
  // ─── 상태 ─────────────────────────────────────────────
  let failCount = 0;
  const MAX_FAIL = 3;
  let currentTab = 'login';

  // ─── 요소 ─────────────────────────────────────────────
  const tabs       = document.querySelectorAll('.auth-tab');
  const slider     = document.getElementById('tab-slider');
  const formLogin  = document.getElementById('form-login');
  const formSignup = document.getElementById('form-signup');
  const msgEl      = document.getElementById('auth-msg');
  const attBar     = document.getElementById('attempts-bar');
  const attText    = document.getElementById('attempts-text');
  const btnLogin   = document.getElementById('btn-login');
  const btnSignup  = document.getElementById('btn-signup');

  // ─── 저장된 이메일/패스워드 복원 (Remember Me) ───────────
  const savedEmail = localStorage.getItem('xpider-saved-email');
  const savedPw    = localStorage.getItem('xpider-saved-pw');
  if (savedEmail) {
    const emailField = document.getElementById('login-email');
    if (emailField) emailField.value = savedEmail;
    const rememberBox = document.getElementById('remember-me');
    if (rememberBox) rememberBox.checked = true;
  }
  if (savedPw) {
    const pwField = document.getElementById('login-password');
    if (pwField) pwField.value = savedPw;
  }

  // ─── 탭 전환 헬퍼 함수 ────────────────────────────────
  function switchTab(t) {
    if (t === currentTab) return;
    currentTab = t;
    tabs.forEach(b => {
      if (b.dataset.tab === t) b.classList.add('active');
      else b.classList.remove('active');
    });
    if (t === 'signup') {
      slider.classList.add('right');
      formLogin.classList.add('hidden');
      formSignup.classList.remove('hidden');
    } else {
      slider.classList.remove('right');
      formSignup.classList.add('hidden');
      formLogin.classList.remove('hidden');
    }
    hideMsg();
  }

  // ─── 자동 로그인 및 시작 제어 ─────────────────────────────
  (async () => {
    const session = await window.authAPI.checkSession();
    if (session) {
      showMsg('Auto-logging in...', 'info');
      setTimeout(() => window.authAPI.success(), 600);
      return;
    }

    // 저장된 이메일+패스워드가 있으면 자동 로그인 시도
    if (savedEmail && savedPw) {
      showMsg('Logging in with saved account...', 'info');
      const res = await window.authAPI.login(savedEmail, savedPw);
      if (res.success) {
        showMsg('Login successful! Starting browser...', 'success');
        setTimeout(() => window.authAPI.success(), 800);
      } else {
        hideMsg();
        // 저장된 패스워드가 잘못된 경우 지움
        localStorage.removeItem('xpider-saved-pw');
        document.getElementById('login-password').value = '';
      }
    }
  })();


  // ─── 탭 전환 ──────────────────────────────────────────
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  // ─── 비밀번호 보기/숨기기 ─────────────────────────────
  document.getElementById('tpw-login').addEventListener('click', () => togglePw('login-password', 'tpw-login'));
  document.getElementById('tpw-signup').addEventListener('click', () => togglePw('signup-password', 'tpw-signup'));

  function togglePw(inputId, btnId) {
    const el = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (el.type === 'password') { el.type = 'text'; btn.textContent = '🙈'; }
    else { el.type = 'password'; btn.textContent = '👁'; }
  }

  // ─── 로그인 ───────────────────────────────────────────
  btnLogin.addEventListener('click', handleLogin);
  document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });

  async function handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const pw    = document.getElementById('login-password').value;
    if (!email || !pw) { showMsg('Please enter your email and password.', 'error'); return; }

    setLoading(btnLogin, true);
    hideMsg();

    const res = await window.authAPI.login(email, pw);

    setLoading(btnLogin, false);

    if (res.success) {
      // Remember Me: 이메일과 패스워드 저장
      const rememberMe = document.getElementById('remember-me')?.checked;
      if (rememberMe) {
        localStorage.setItem('xpider-saved-email', email);
        localStorage.setItem('xpider-saved-pw', pw);
      } else {
        localStorage.removeItem('xpider-saved-email');
        localStorage.removeItem('xpider-saved-pw');
      }
      showMsg('Login successful! Starting browser...', 'success');
      setTimeout(() => window.authAPI.success(), 800);
    } else {
      failCount++;
      const remaining = MAX_FAIL - failCount;
      if (remaining <= 0) {
        showMsg('Login attempts exceeded 3 times. Closing application.', 'error');
        startCountdown();
      } else {
        showMsg(`Error: ${res.error}`, 'error');
        attBar.classList.remove('hidden');
        attText.textContent = `Remaining attempts: ${remaining}`;
      }
    }
  }

  // ─── 사인업 ───────────────────────────────────────────
  btnSignup.addEventListener('click', handleSignup);

  async function handleSignup() {
    const username = document.getElementById('signup-username').value.trim();
    const email    = document.getElementById('signup-email').value.trim();
    const pw       = document.getElementById('signup-password').value;
    const confirm  = document.getElementById('signup-confirm').value;

    if (!username || !email || !pw || !confirm) { showMsg('Please fill in all fields.', 'error'); return; }
    if (pw.length < 8)   { showMsg('Password must be at least 8 characters long.', 'error'); return; }
    if (pw !== confirm)  { showMsg('Passwords do not match.', 'error'); return; }

    setLoading(btnSignup, true);
    hideMsg();

    const res = await window.authAPI.signup(email, pw, username);

    setLoading(btnSignup, false);

    if (res.success) {
      showMsg(res.message || 'Signup successful! Please check your email.', 'success');
    } else {
      showMsg(`Error: ${res.error}`, 'error');
    }
  }

  // ─── 카운트다운 후 종료 ───────────────────────────────
  function startCountdown() {
    let sec = 5;
    const interval = setInterval(() => {
      sec--;
      showMsg(`Closing application in ${sec} seconds...`, 'error');
      if (sec <= 0) {
        clearInterval(interval);
        window.authAPI.closeApp();
      }
    }, 1000);
  }

  // ─── 유틸 ─────────────────────────────────────────────
  function showMsg(text, type = 'error') {
    msgEl.textContent = text;
    msgEl.className = `auth-msg ${type}`;
    msgEl.classList.remove('hidden');
  }
  function hideMsg() { msgEl.classList.add('hidden'); }

  function setLoading(btn, loading) {
    btn.disabled = loading;
    const label = btn.querySelector('.btn-label');
    const icon  = btn.querySelector('.btn-icon');
    if (loading) {
      label.textContent = 'Processing...';
      icon.innerHTML = '<span class="spinner"></span>';
    } else {
      const isLogin = btn.id === 'btn-login';
      label.textContent = isLogin ? 'Sign In' : 'Create Account';
      icon.textContent  = '→';
    }
  }
})();
