import { supabase } from './supabase-client.js';

// ---- DOM Elements ----
const tabs = document.querySelectorAll('.auth-tab');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const alertBox = document.getElementById('alert-box');

// ---- Check if already logged in ----
async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.href = 'quiz.html';
  }
}
checkSession();

// ---- Tab Switching ----
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const target = tab.dataset.tab;
    loginForm.classList.toggle('active', target === 'login');
    registerForm.classList.toggle('active', target === 'register');
    hideAlert();
  });
});

// ---- Alert Helpers ----
function showAlert(message, type = 'error') {
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type} show`;
}

function hideAlert() {
  alertBox.className = 'alert';
}

function isValidEmail(email) {
  // Regex kontrolü (örn: kullanici@domain.com)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

// ---- Login ----
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');

  if (!isValidEmail(email)) {
    showAlert('Lütfen geçerli bir e-posta adresi girin (örn: isim@domain.com).');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Giriş yapılıyor...';
  hideAlert();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    showAlert(getErrorMessage(error.message));
    btn.disabled = false;
    btn.textContent = 'Giriş Yap';
    return;
  }

  // Check if admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  if (profile?.role === 'admin') {
    window.location.href = 'admin.html';
  } else {
    window.location.href = 'quiz.html';
  }
});

// ---- Register ----
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('register-username').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const btn = document.getElementById('register-btn');

  if (username.length < 2) {
    showAlert('Kullanıcı adı en az 2 karakter olmalı.');
    return;
  }

  if (!isValidEmail(email)) {
    showAlert('Lütfen geçerli bir e-posta adresi girin (örn: isim@domain.com).');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Kontrol ediliyor...';
  hideAlert();

  // Kullanıcı adı daha önce alınmış mı kontrolü
  const { data: existingUsers } = await supabase
    .from('profiles')
    .select('username')
    .ilike('username', username)
    .limit(1);

  if (existingUsers && existingUsers.length > 0) {
    showAlert('Kullanıcı adı zaten var. Lütfen farklı bir kullanıcı adı seçiniz.');
    btn.disabled = false;
    btn.textContent = 'Kayıt Ol';
    return;
  }

  btn.textContent = 'Kayıt olunuyor...';

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username }
    }
  });

  if (error) {
    showAlert(getErrorMessage(error.message));
    btn.disabled = false;
    btn.textContent = 'Kayıt Ol';
    return;
  }

  showAlert('Kayıt başarılı! Giriş yapabilirsiniz.', 'success');
  btn.disabled = false;
  btn.textContent = 'Kayıt Ol';

  // Auto switch to login tab
  setTimeout(() => {
    tabs[0].click();
  }, 1500);
});

// ---- Error Translation ----
function getErrorMessage(msg) {
  if (msg.includes('Invalid login')) return 'E-posta veya şifre hatalı.';
  if (msg.includes('already registered')) return 'Bu e-posta zaten kayıtlı.';
  if (msg.includes('Password')) return 'Şifre en az 6 karakter olmalı.';
  if (msg.includes('valid email')) return 'Geçerli bir e-posta girin.';
  return 'Bir hata oluştu: ' + msg;
}
