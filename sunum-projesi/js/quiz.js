import { supabase } from './supabase-client.js';

// ---- State ----
let currentUser = null;
let profile = null;
let isQuizActive = false; 
let sessionId = null; 

let currentLiveState = null;
let countdownInterval = null;
let answerSubmitted = false;
let currentScore = 0; 
let localSelectedOption = null;

// ---- DOM ----
const lobbyScreen = document.getElementById('lobby-screen');
const quizScreen = document.getElementById('quiz-screen');
const loadingScreen = document.getElementById('loading-screen');
const lobbyCount = document.getElementById('lobby-count');
const lobbyUsers = document.getElementById('lobby-users');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const scoreDisplay = document.getElementById('score-display');
const questionNumber = document.getElementById('question-number');
const questionText = document.getElementById('question-text');
const optionsList = document.getElementById('options-list');
const questionCard = document.getElementById('question-card');
const nextBtn = document.getElementById('next-btn');
const timeDisplay = document.getElementById('time-display');

// ---- Auth & Init ----
async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = session.user;

  // Profil Yükle
  const { data: p } = await supabase
    .from('profiles')
    .select('username, role')
    .eq('id', currentUser.id)
    .single();

  if (p) {
    profile = p;
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
  
  loadingScreen.style.display = 'none';
  lobbyScreen.style.display = 'block';

  setupRealtime();
}
init();

// ---- Realtime Setup ----
function setupRealtime() {
  // 1. Presence (Lobi Kullanıcıları)
  const room = supabase.channel('lobby_room', {
    config: {
      presence: { key: currentUser.id }
    }
  });

  room.on('presence', { event: 'sync' }, () => {
    const newState = room.presenceState();
    renderLobbyUsers(newState);
  }).subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await room.track({ username: profile.username, role: profile.role });
    }
  });

  // 2. State DB Dinleme
  supabase
    .channel('public:live_quiz_state')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_quiz_state' }, payload => {
      handleStateChange(payload.new);
    })
    .subscribe();

  // İlk state i çek
  fetchInitialState();
}

async function fetchInitialState() {
  const { data, error } = await supabase.from('live_quiz_state').select('*').eq('id', 1).single();
  if (!error && data) {
    handleStateChange(data);
  }
}

function renderLobbyUsers(state) {
  const users = [];
  for (const [key, presences] of Object.entries(state)) {
    users.push(presences[0].username);
  }
  lobbyCount.textContent = users.length;
  lobbyUsers.innerHTML = users.map(u => `<span style="background:var(--accent); color:white; padding:4px 10px; border-radius:12px; font-size:0.85rem; font-weight:600;">${u}</span>`).join('');
}

// ---- State Handling ----
async function handleStateChange(state) {
  currentLiveState = state;
  const status = state.status; // waiting, question, reveal, finished

  if (status === 'waiting') {
    isQuizActive = false;
    quizScreen.style.display = 'none';
    lobbyScreen.style.display = 'block';
  } 
  else if (status === 'question') {
    if (!isQuizActive || quizScreen.style.display === 'none') {
      await enterQuizMode();
    }
    showQuestionPhase(state);
  } 
  else if (status === 'reveal') {
    showRevealPhase(state);
  } 
  else if (status === 'finished') {
    finishQuiz(state);
  }
}

async function enterQuizMode() {
  isQuizActive = true;
  lobbyScreen.style.display = 'none';
  quizScreen.style.display = 'block';
  currentScore = 0;
  scoreDisplay.textContent = '0';
  document.querySelectorAll('.user-bar-actions a').forEach(btn => btn.style.display = 'none');

  // Geçmişteki tamamlanmamış veya yeni sessionlar, her yarışma base session'a atılır. 
  const { data: session } = await supabase
    .from('quiz_sessions')
    .insert({
      user_id: currentUser.id,
      total_questions: currentLiveState?.questions?.length || 10
    })
    .select()
    .single();
    
  if (session) sessionId = session.id;
}

function showQuestionPhase(state) {
  answerSubmitted = false;
  localSelectedOption = null;
  nextBtn.style.display = 'none';

  const idx = state.current_question_index;
  const q = state.questions[idx];
  const total = state.questions.length;

  progressFill.style.width = `${((idx) / total) * 100}%`;
  progressText.textContent = `${idx + 1}/${total}`;
  questionNumber.textContent = `Soru ${idx + 1}`;
  questionText.textContent = q.question_text;

  // Build options
  const options = [
    { letter: 'A', text: q.option_a, value: 'a' },
    { letter: 'B', text: q.option_b, value: 'b' },
    { letter: 'C', text: q.option_c, value: 'c' },
    { letter: 'D', text: q.option_d, value: 'd' },
    { letter: 'E', text: q.option_e, value: 'e' }
  ];

  optionsList.innerHTML = options.map(opt => `
    <button class="option-btn" data-value="${opt.value}" id="option-${opt.value}">
      <span class="option-letter">${opt.letter}</span>
      <span class="option-text">${opt.text}</span>
    </button>
  `).join('');

  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', () => handleAnswerClick(btn, q));
  });

  const startTime = new Date(state.question_start_time).getTime();
  startTimer(startTime);
}

function startTimer(startTime) {
  if (countdownInterval) clearInterval(countdownInterval);
  
  // Anında güncelleme için önce çalıştır
  updateTimerUI(startTime);

  countdownInterval = setInterval(() => {
    updateTimerUI(startTime);
  }, 100); // Daha pürüzsüz geri sayım
}

function updateTimerUI(startTime) {
  const now = new Date().getTime();
  const elapsed = Math.floor((now - startTime) / 1000);
  let remaining = 60 - elapsed;
  
  if (remaining <= 0) {
    remaining = 0;
    clearInterval(countdownInterval);
    timeDisplay.textContent = "00:00";
    timeDisplay.style.color = "var(--error)";
    lockOptions();
  } else {
    timeDisplay.textContent = `00:${remaining < 10 ? '0'+remaining : remaining}`;
    timeDisplay.style.color = remaining <= 10 ? "var(--error)" : "var(--accent)";
  }
}

async function handleAnswerClick(btn, q) {
  if (answerSubmitted) return;
  answerSubmitted = true;
  localSelectedOption = btn.dataset.value;

  document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected'); 
  lockOptions();

  // Hesaplama
  const now = new Date().getTime();
  const startTime = new Date(currentLiveState.question_start_time).getTime();
  const responseTimeMs = now - startTime;

  const isCorrect = (localSelectedOption === q.correct_answer.trim().toLowerCase());
  
  if (sessionId) {
    await supabase.from('answers').insert({
      session_id: sessionId,
      question_id: q.id,
      user_answer: localSelectedOption,
      is_correct: isCorrect,
      response_time_ms: responseTimeMs
    });
  }
}

function lockOptions() {
  document.querySelectorAll('.option-btn').forEach(b => {
    b.classList.add('disabled');
    b.style.pointerEvents = 'none';
  });
}

function showRevealPhase(state) {
  if (countdownInterval) clearInterval(countdownInterval);
  timeDisplay.textContent = "SÜRE BİTTİ";
  timeDisplay.style.color = "var(--text-muted)";

  const idx = state.current_question_index;
  const q = state.questions[idx];
  const correct = q.correct_answer.trim().toLowerCase();

  document.querySelectorAll('.option-btn').forEach(b => {
    const val = b.dataset.value;
    if (val === correct) {
      b.classList.add('correct');
    }
    if (val === localSelectedOption && val !== correct) {
      b.classList.add('wrong');
    }
  });

  // UI Score update purely cosmetics for now
  if (localSelectedOption === correct) {
    scoreDisplay.textContent = "Güncelleniyor...";
  }
}

async function finishQuiz(state) {
  isQuizActive = false;
  if (countdownInterval) clearInterval(countdownInterval);

  if (sessionId) {
    // Gerçek zamanlı skor hesaplaması
    const { data: answers } = await supabase
      .from('answers')
      .select('is_correct, response_time_ms')
      .eq('session_id', sessionId);
      
    let finalScore = 0;
    let correctCount = 0;
    if (answers) {
      answers.forEach(a => {
        if (a.is_correct) {
          correctCount++;
          const secondsTook = Math.min(60, a.response_time_ms / 1000);
          const remainder = Math.max(0, 60 - secondsTook);
          finalScore += 1000 + Math.floor(remainder * 10);
        }
      });
    }

    await supabase
      .from('quiz_sessions')
      .update({
        score: finalScore,
        finished_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    window.location.href = `results.html?session=${sessionId}&score=${finalScore}&correct=${correctCount}&total=${state.questions.length}`;
  }
}

const style = document.createElement('style');
style.textContent = `
  .option-btn.selected {
    border-color: var(--accent) !important;
    background-color: rgba(99, 102, 241, 0.1) !important;
  }
`;
document.head.appendChild(style);

document.getElementById('logout-btn').addEventListener('click', async () => {
  if (confirm('Çıkış yapmak istediğinize emin misiniz?')) {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
  }
});

window.addEventListener('beforeunload', (e) => {
  if (isQuizActive) {
    e.preventDefault();
    e.returnValue = ''; 
  }
});
