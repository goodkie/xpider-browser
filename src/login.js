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

  // ─── 자동 로그인 확인 ─────────────────────────────────
  (async () => {
    const session = await window.authAPI.checkSession();
    if (session) {
      showMsg('자동 로그인 중...', 'info');
      setTimeout(() => window.authAPI.success(), 600);
    }
  })();

  // ─── 탭 전환 ──────────────────────────────────────────
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const t = tab.dataset.tab;
      if (t === currentTab) return;
      currentTab = t;
      tabs.forEach(b => b.classList.remove('active'));
      tab.classList.add('active');
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
    if (!email || !pw) { showMsg('이메일과 비밀번호를 입력하세요.', 'error'); return; }

    setLoading(btnLogin, true);
    hideMsg();

    const res = await window.authAPI.login(email, pw);

    setLoading(btnLogin, false);

    if (res.success) {
      showMsg('로그인 성공! 브라우저를 시작합니다...', 'success');
      setTimeout(() => window.authAPI.success(), 800);
    } else {
      failCount++;
      const remaining = MAX_FAIL - failCount;
      if (remaining <= 0) {
        showMsg('로그인 실패가 3회를 초과했습니다. 앱을 종료합니다.', 'error');
        startCountdown();
      } else {
        showMsg(`오류: ${res.error}`, 'error');
        attBar.classList.remove('hidden');
        attText.textContent = `남은 시도: ${remaining}회`;
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

    if (!username || !email || !pw || !confirm) { showMsg('모든 필드를 입력하세요.', 'error'); return; }
    if (pw.length < 8)   { showMsg('비밀번호는 8자 이상이어야 합니다.', 'error'); return; }
    if (pw !== confirm)  { showMsg('비밀번호가 일치하지 않습니다.', 'error'); return; }

    setLoading(btnSignup, true);
    hideMsg();

    const res = await window.authAPI.signup(email, pw, username);

    setLoading(btnSignup, false);

    if (res.success) {
      showMsg(res.message || '가입 완료! 이메일을 확인해주세요.', 'success');
    } else {
      showMsg(`오류: ${res.error}`, 'error');
    }
  }

  // ─── 카운트다운 후 종료 ───────────────────────────────
  function startCountdown() {
    let sec = 5;
    const interval = setInterval(() => {
      sec--;
      showMsg(`${sec}초 후 앱이 종료됩니다...`, 'error');
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
      label.textContent = '처리 중...';
      icon.innerHTML = '<span class="spinner"></span>';
    } else {
      const isLogin = btn.id === 'btn-login';
      label.textContent = isLogin ? 'Sign In' : 'Create Account';
      icon.textContent  = '→';
    }
  }
})();
