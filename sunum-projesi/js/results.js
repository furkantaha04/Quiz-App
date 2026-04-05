import { supabase } from './supabase-client.js';

let currentUser = null;

// ---- Auth Check ----
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

  if (profile) {
    document.getElementById('user-name').textContent = profile.username;
    document.getElementById('user-avatar').textContent = profile.username.charAt(0).toUpperCase();

    if (profile.role === 'admin') {
      const actions = document.querySelector('.user-bar-actions');
      const adminBtn = document.createElement('a');
      adminBtn.href = 'admin.html';
      adminBtn.className = 'btn btn-secondary';
      adminBtn.textContent = 'Admin Paneli';
      actions.insertBefore(adminBtn, document.getElementById('logout-btn'));
    }
  }

  // Check URL params for latest result
  const params = new URLSearchParams(window.location.search);
  if (params.get('session')) {
    showResultHero(params);
  }

  loadLeaderboard();
}
init();

// ---- Logout ----
document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
});

// ---- Show Result Hero ----
function showResultHero(params) {
  const score = parseInt(params.get('score')) || 0;
  const correct = parseInt(params.get('correct')) || 0;
  const total = parseInt(params.get('total')) || 10;

  document.getElementById('final-score').textContent = score;
  document.getElementById('result-subtitle').textContent = `${total} sorudan ${correct} tanesini doğru cevapladın.`;

  let message = '';
  const pct = correct / total;
  if (pct === 1) message = 'Mükemmel! Tam puan! Sunumu anlayarak yapman çok güzel 🎉';
  else if (pct >= 0.8) message = 'Harika performans!  konuya hakim olduğun belli 🌟';
  else if (pct >= 0.6) message = 'İyi gidiyorsun! neredeyse fullicektin!! 💪';
  else if (pct >= 0.4) message = 'Fena değil, kendini biraz daha sunuma ver 📚';
  else message = 'Biraz daha çalışmalısın yetersiz performans 😅';

  document.getElementById('result-message').textContent = message;

  // Animate score circle color
  const circle = document.querySelector('.result-score-circle');
  if (pct >= 0.8) {
    circle.style.borderColor = 'var(--success)';
    circle.style.boxShadow = '0 0 40px rgba(34,197,94,0.3)';
  } else if (pct < 0.4) {
    circle.style.borderColor = 'var(--error)';
    circle.style.boxShadow = '0 0 40px rgba(239,68,68,0.3)';
  }

  document.getElementById('result-hero').style.display = 'block';
}

// ---- Load Leaderboard ----
async function loadLeaderboard() {
  const loading = document.getElementById('leaderboard-loading');
  const container = document.getElementById('leaderboard-container');
  const emptyMsg = document.getElementById('leaderboard-empty');

  // Get all finished sessions with user profiles
  const { data: sessions, error } = await supabase
    .from('quiz_sessions')
    .select('id, score, total_questions, finished_at, user_id, profiles(username)')
    .not('finished_at', 'is', null)
    .order('score', { ascending: false })
    .order('finished_at', { ascending: true })
    .limit(50);

  loading.style.display = 'none';

  if (error || !sessions || sessions.length === 0) {
    emptyMsg.style.display = 'block';
    return;
  }

  const tbody = document.getElementById('leaderboard-body');
  tbody.innerHTML = sessions.map((s, i) => {
    const rank = i + 1;
    const rankClass = rank <= 3 ? `rank-${rank}` : 'rank-other';
    const isCurrentUser = s.user_id === currentUser?.id;
    const rowClass = isCurrentUser ? 'current-user-row' : '';
    const username = s.profiles?.username || 'Anonim';
    const date = new Date(s.finished_at).toLocaleDateString('tr-TR');

    return `
      <tr class="${rowClass}">
        <td><span class="rank-badge ${rankClass}">${rank}</span></td>
        <td style="font-weight:600;">${username}</td>
        <td style="color:var(--accent-light); font-weight:700;">${Math.round(s.score)}</td>
        <td style="color:var(--text-muted);">${date}</td>
      </tr>
    `;
  }).join('');

  container.style.display = 'block';
}
