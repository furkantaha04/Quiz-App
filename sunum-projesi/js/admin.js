import { supabase } from './supabase-client.js';

let currentUser = null;

// ---- Auth Check (Admin Only) ----
async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = session.user;

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, role')
    .eq('id', currentUser.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    alert('Bu sayfaya erişim yetkiniz yok.');
    window.location.href = 'quiz.html';
    return;
  }

  document.getElementById('user-name').textContent = profile.username;
  document.getElementById('user-avatar').textContent = profile.username.charAt(0).toUpperCase();

  loadQuestions();
  loadStats();
  loadUsers();
  loadLeaderboard();
  
  // Canlı Quiz Init
  setupLiveQuizAdmin();
}
init();

// ---- Logout ----
document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
});

// ---- Admin Nav ----
document.querySelectorAll('.admin-nav .btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-nav .btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const sectionId = btn.dataset.section;
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');

    // Tıklanan sekmeye göre verileri arka planda canlı olarak tazele (Sayfa yenilemeden)
    if (sectionId === 'questions-section') loadQuestions();
    else if (sectionId === 'leaderboard-section') loadLeaderboard();
    else if (sectionId === 'stats-section') loadStats();
    else if (sectionId === 'users-section') loadUsers();
    else if (sectionId === 'live-section') {
      supabase.from('live_quiz_state').select('*').eq('id', 1).single().then(({data}) => {
        if(data) {
          adminLiveState = data;
          renderAdminLivePanel();
        }
      });
    }
  });
});

// ============================================================
// QUESTIONS CRUD
// ============================================================

async function loadQuestions() {
  const loading = document.getElementById('questions-loading');
  const list = document.getElementById('questions-list');

  const { data: questions, error } = await supabase
    .from('questions')
    .select('*')
    .order('created_at', { ascending: false });

  loading.style.display = 'none';

  if (error || !questions) {
    list.innerHTML = '<p style="color:var(--error);">Sorular yüklenemedi.</p>';
    return;
  }

  if (questions.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:40px 0;">Henüz soru eklenmemiş.</p>';
    return;
  }

  list.innerHTML = questions.map((q, i) => {
    const letters = ['a', 'b', 'c', 'd', 'e'];
    const optionLabels = ['A', 'B', 'C', 'D', 'E'];
    const optionKeys = ['option_a', 'option_b', 'option_c', 'option_d', 'option_e'];

    return `
      <div class="question-item" data-id="${q.id}">
        <div class="question-item-header">
          <div class="question-item-text">${i + 1}. ${q.question_text}</div>
          <div class="question-item-actions">
            <button class="btn btn-secondary edit-btn" data-id="${q.id}">Düzenle</button>
            <button class="btn btn-danger delete-btn" data-id="${q.id}">Sil</button>
          </div>
        </div>
        <div class="question-item-options">
          ${optionKeys.map((key, idx) => `
            <span class="${q.correct_answer === letters[idx] ? 'correct-option' : ''}">
              ${optionLabels[idx]}) ${q[key]}
              ${q.correct_answer === letters[idx] ? ' ✓' : ''}
            </span>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners
  list.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => editQuestion(btn.dataset.id, questions));
  });

  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteQuestion(btn.dataset.id));
  });
}

// ---- Modal Controls ----
const modal = document.getElementById('question-modal');
const form = document.getElementById('question-form');

document.getElementById('add-question-btn').addEventListener('click', () => {
  document.getElementById('modal-title').textContent = 'Yeni Soru Ekle';
  document.getElementById('edit-question-id').value = '';
  form.reset();
  modal.classList.add('show');
});

document.getElementById('modal-close').addEventListener('click', () => modal.classList.remove('show'));
document.getElementById('modal-cancel').addEventListener('click', () => modal.classList.remove('show'));

modal.addEventListener('click', (e) => {
  if (e.target === modal) modal.classList.remove('show');
});

// ---- Save Question (Add / Edit) ----
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-question-id').value;
  const saveBtn = document.getElementById('modal-save');

  const questionData = {
    question_text: document.getElementById('q-text').value.trim(),
    option_a: document.getElementById('q-a').value.trim(),
    option_b: document.getElementById('q-b').value.trim(),
    option_c: document.getElementById('q-c').value.trim(),
    option_d: document.getElementById('q-d').value.trim(),
    option_e: document.getElementById('q-e').value.trim(),
    correct_answer: document.getElementById('q-correct').value,
    is_active: true
  };

  saveBtn.disabled = true;
  saveBtn.textContent = 'Kaydediliyor...';

  let error;
  if (id) {
    // Update
    ({ error } = await supabase.from('questions').update(questionData).eq('id', id));
  } else {
    // Insert
    ({ error } = await supabase.from('questions').insert(questionData));
  }

  if (error) {
    alert('Hata: ' + error.message);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Kaydet';
    return;
  }

  modal.classList.remove('show');
  saveBtn.disabled = false;
  saveBtn.textContent = 'Kaydet';
  loadQuestions();
  loadStats();
});

// ---- Edit Question ----
function editQuestion(id, questions) {
  const q = questions.find(q => q.id == id);
  if (!q) return;

  document.getElementById('modal-title').textContent = 'Soruyu Düzenle';
  document.getElementById('edit-question-id').value = q.id;
  document.getElementById('q-text').value = q.question_text;
  document.getElementById('q-a').value = q.option_a;
  document.getElementById('q-b').value = q.option_b;
  document.getElementById('q-c').value = q.option_c;
  document.getElementById('q-d').value = q.option_d;
  document.getElementById('q-e').value = q.option_e;
  document.getElementById('q-correct').value = q.correct_answer;
  modal.classList.add('show');
}

// ---- Delete Question ----
async function deleteQuestion(id) {
  if (!confirm('Bu soruyu silmek istediğinize emin misiniz?')) return;

  const { error } = await supabase.from('questions').delete().eq('id', id);
  if (error) {
    alert('Silinemedi: ' + error.message);
    return;
  }
  loadQuestions();
  loadStats();
}

// ============================================================
// STATS
// ============================================================

async function loadStats() {
  // Total users
  const { count: userCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  // Total quizzes
  const { count: quizCount } = await supabase
    .from('quiz_sessions')
    .select('*', { count: 'exact', head: true })
    .not('finished_at', 'is', null);

  // Average score
  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select('score')
    .not('finished_at', 'is', null);

  let avg = 0;
  if (sessions && sessions.length > 0) {
    avg = Math.round(sessions.reduce((s, r) => s + r.score, 0) / sessions.length);
  }

  // Total questions
  const { count: qCount } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: true });

  document.getElementById('stat-total-users').textContent = userCount ?? 0;
  document.getElementById('stat-total-quizzes').textContent = quizCount ?? 0;
  document.getElementById('stat-avg-score').textContent = avg;
  document.getElementById('stat-total-questions').textContent = qCount ?? 0;
}

// ============================================================
// LEADERBOARD
// ============================================================

async function loadLeaderboard() {
  const loading = document.getElementById('admin-leaderboard-loading');
  const table = document.getElementById('admin-leaderboard-table');
  const tbody = document.getElementById('admin-leaderboard-body');

  const { data: sessions, error } = await supabase
    .from('quiz_sessions')
    .select('id, score, total_questions, finished_at, profiles(username)')
    .not('finished_at', 'is', null)
    .order('score', { ascending: false })
    .order('finished_at', { ascending: true })
    .limit(100);

  loading.style.display = 'none';

  if (error || !sessions || sessions.length === 0) {
    if(!error) table.style.display = 'table';
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Henüz quiz çözen yok.</td></tr>';
    table.style.display = 'table';
    return;
  }

  tbody.innerHTML = sessions.map((s, i) => {
    const rank = i + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';
    const username = s.profiles?.username || 'Anonim';
    const date = new Date(s.finished_at).toLocaleDateString('tr-TR');

    return `
      <tr>
        <td><span class="rank-badge ${rankClass}">${rank}</span></td>
        <td style="font-weight:600;">${username}</td>
        <td style="color:var(--accent-light); font-weight:700;">${Math.round(s.score)}</td>
        <td style="color:var(--text-muted);">${date}</td>
      </tr>
    `;
  }).join('');

  table.style.display = 'table';
}

// ============================================================
// USERS
// ============================================================

async function loadUsers() {
  const loading = document.getElementById('users-loading');
  const table = document.getElementById('users-table');

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, role, created_at')
    .order('created_at', { ascending: false });

  loading.style.display = 'none';

  if (error || !profiles) return;

  // Count quizzes per user
  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select('user_id')
    .not('finished_at', 'is', null);

  const quizCounts = {};
  if (sessions) {
    sessions.forEach(s => {
      quizCounts[s.user_id] = (quizCounts[s.user_id] || 0) + 1;
    });
  }

  const tbody = document.getElementById('users-body');
  tbody.innerHTML = profiles.map(p => `
    <tr>
      <td style="font-weight:600;">${p.username}</td>
      <td><span style="color:${p.role === 'admin' ? 'var(--warning)' : 'var(--text-secondary)'}; font-weight:600;">${p.role === 'admin' ? '⭐ Admin' : 'Kullanıcı'}</span></td>
      <td style="color:var(--text-muted);">${new Date(p.created_at).toLocaleDateString('tr-TR')}</td>
      <td>${quizCounts[p.id] || 0}</td>
    </tr>
  `).join('');

  table.style.display = 'table';
}

// ============================================================
// LIVE QUIZ ADMIN
// ============================================================

let adminLiveState = null;
let adminQuestionsCount = 0;
let adminTimerInterval = null;

async function setupLiveQuizAdmin() {
  const lobbyCount = document.getElementById('admin-lobby-count');
  const lobbyUsers = document.getElementById('admin-lobby-users');
  const liveStatus = document.getElementById('admin-live-status');
  const liveControls = document.getElementById('admin-live-controls');

  // 1. Lobi Dinleme
  const room = supabase.channel('lobby_room');
  room.on('presence', { event: 'sync' }, () => {
    const state = room.presenceState();
    const users = [];
    for (const [key, presences] of Object.entries(state)) {
      if (presences[0].role !== 'admin') {
        users.push(presences[0].username);
      }
    }
    lobbyCount.textContent = users.length;
    if (users.length === 0) {
      lobbyUsers.innerHTML = '<span style="color:var(--text-muted);">Kimse yok...</span>';
    } else {
      lobbyUsers.innerHTML = users.map(u => `<span style="background:var(--success); color:white; padding:4px 10px; border-radius:12px; font-size:0.85rem; font-weight:600;">${u}</span>`).join('');
    }
  }).subscribe();

  // 2. Canlı Durum Dinleme
  supabase
    .channel('admin_live_state')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_quiz_state' }, payload => {
      adminLiveState = payload.new;
      renderAdminLivePanel();
    })
    .subscribe();

  // İlk durumu çek
  const { data } = await supabase.from('live_quiz_state').select('*').eq('id', 1).single();
  if (data) {
    adminLiveState = data;
    renderAdminLivePanel();
  }

  // 3. Quizi Başlat
  document.getElementById('admin-start-quiz')?.addEventListener('click', async () => {
    if(!confirm('Quizi başlatmak istediğinize emin misiniz? Lobideki herkes yayına alınacak!')) return;
    
    // Soruları Çek
    const { data: qData } = await supabase.from('questions').select('*').eq('is_active', true);
    if (!qData || qData.length === 0) {
      alert('Aktif soru bulunamadı!');
      return;
    }
    const shuffled = qData.sort(() => 0.5 - Math.random()).slice(0, 10);
    
    await supabase.from('live_quiz_state').update({
      status: 'question',
      current_question_index: 0,
      questions: shuffled,
      question_start_time: new Date().toISOString()
    }).eq('id', 1);
  });
}

function renderAdminLivePanel() {
  const liveStatus = document.getElementById('admin-live-status');
  const liveControls = document.getElementById('admin-live-controls');

  if (!adminLiveState) return;

  const st = adminLiveState.status;
  const idx = adminLiveState.current_question_index;
  const total = adminLiveState.questions?.length || 0;

  if (st === 'waiting') {
    liveStatus.innerHTML = 'Durum: <span style="color:var(--warning);">Bekleniyor</span>';
    liveControls.innerHTML = '<button class="btn btn-primary" id="admin-start-quiz" style="font-size:1.2rem; padding:15px 40px;">Quizi Başlat 🚀</button>';
    document.getElementById('admin-start-quiz').addEventListener('click', startQuizHandler);
  } 
  else if (st === 'question') {
    liveStatus.innerHTML = `Durum: <span style="color:var(--accent);">Soru ${idx + 1} / ${total} Çözülüyor</span> <br><span id="admin-timer" style="font-weight:bold; font-size:1.5rem; color:var(--error); margin-top:10px; display:inline-block;">60</span>`;
    liveControls.innerHTML = '<button class="btn btn-secondary" id="admin-force-reveal">Süreyi Bitir & Cevabı Göster</button>';
    
    document.getElementById('admin-force-reveal').addEventListener('click', forceRevealHandler);
    
    // Admin sayacı
    if (adminTimerInterval) clearInterval(adminTimerInterval);
    const startTime = new Date(adminLiveState.question_start_time).getTime();
    
    adminTimerInterval = setInterval(() => {
      const now = new Date().getTime();
      const elapsed = Math.floor((now - startTime) / 1000);
      let rem = 60 - elapsed;
      if (rem <= 0) {
        rem = 0;
        clearInterval(adminTimerInterval);
        // Otomatik Reveal yap (Admin panelden tetikle)
        // Eğer admin sayfası açıksa otonom ilerlesin
        forceRevealHandler();
      }
      const tDom = document.getElementById('admin-timer');
      if (tDom) tDom.textContent = rem + ' sn';
    }, 1000);
  }
  else if (st === 'reveal') {
    if (adminTimerInterval) clearInterval(adminTimerInterval);
    liveStatus.innerHTML = `Durum: <span style="color:var(--success);">Soru ${idx + 1} Cevabı Gösteriliyor</span>`;
    
    if (idx < total - 1) {
      liveControls.innerHTML = '<button class="btn btn-primary" id="admin-next-question">Sıradaki Soruya Geç ➡️</button>';
      document.getElementById('admin-next-question').addEventListener('click', nextQuestionHandler);
    } else {
      liveControls.innerHTML = '<button class="btn btn-primary" id="admin-finish-quiz">Quizi Bitir 🏁</button>';
      document.getElementById('admin-finish-quiz').addEventListener('click', finishQuizHandler);
    }
  }
  else if (st === 'finished') {
    liveStatus.innerHTML = 'Durum: <span style="color:var(--text-muted);">Quiz Tamamlandı</span>';
    liveControls.innerHTML = '<button class="btn btn-secondary" id="admin-reset-quiz">Sıfırla & Lobiye Dön</button>';
    document.getElementById('admin-reset-quiz').addEventListener('click', resetQuizHandler);
  }
}

async function startQuizHandler() {
  if(!confirm('Quizi başlatmak istediğinize emin misiniz? Lobideki herkes yayına alınacak ve YENİ bir sıralama için ESKİ PUANLAR SİLİNECEKTİR!')) return;
  
  // Önceki quiz verilerini sıfırla (Answers ve Quiz Sessions)
  // FK hatalarını önlemek için önce cevapları, sonra oturumları siliyoruz.
  await supabase.from('answers').delete().not('session_id', 'is', null);
  await supabase.from('quiz_sessions').delete().not('user_id', 'is', null);

  const { data: qData } = await supabase.from('questions').select('*').eq('is_active', true);
  if (!qData || qData.length === 0) return alert('Aktif soru bulunamadı!');
  
  const shuffled = qData.sort(() => 0.5 - Math.random()).slice(0, 10);
  await supabase.from('live_quiz_state').update({
    status: 'question', current_question_index: 0, questions: shuffled, question_start_time: new Date().toISOString()
  }).eq('id', 1);
  
  // Tablolardaki eski veriler silindiği ve yeni duruma geçildiği için ekranı tamamen güncelliyoruz
  window.location.reload();
}

async function forceRevealHandler() {
  if (adminTimerInterval) clearInterval(adminTimerInterval);
  await supabase.from('live_quiz_state').update({ status: 'reveal' }).eq('id', 1);
  window.location.reload();
}

async function nextQuestionHandler() {
  const nextIdx = adminLiveState.current_question_index + 1;
  await supabase.from('live_quiz_state').update({ 
    status: 'question', 
    current_question_index: nextIdx,
    question_start_time: new Date().toISOString()
  }).eq('id', 1);
  window.location.reload();
}

async function finishQuizHandler() {
  await supabase.from('live_quiz_state').update({ status: 'finished' }).eq('id', 1);
  window.location.reload();
}

async function resetQuizHandler() {
  await supabase.from('live_quiz_state').update({ status: 'waiting', current_question_index: 0, questions: [] }).eq('id', 1);
  window.location.reload();
}

