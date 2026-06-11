const STORAGE_KEYS = {
  tasks: 'beeTaskbar.tasks',
  ideas: 'beeTaskbar.ideas',
  nectar: 'beeTaskbar.nectar',
  streak: 'beeTaskbar.streakState',
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const todayKey = () => new Date().toISOString().slice(0, 10);
const weekKey = (date = new Date()) => {
  const start = new Date(date);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  return start.toISOString().slice(0, 10);
};
const dayIndex = (date = new Date()) => (date.getDay() + 6) % 7;

const readJson = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));

let tasks = readJson(STORAGE_KEYS.tasks, []);
let ideas = readJson(STORAGE_KEYS.ideas, []);
let nectar = Number(localStorage.getItem(STORAGE_KEYS.nectar) || 0);
let currentFilter = 'all';
let searchTerm = '';
let timerSeconds = 25 * 60;
let timerTotal = 25 * 60;
let timerInterval = null;
let isTimerRunning = false;
let scrollSeconds = 0;
let scrollInterval = null;
let speechTimeout = null;
let isRouletteSpinning = false;

function getStreakState() {
  const currentWeek = weekKey();
  const state = readJson(STORAGE_KEYS.streak, {
    week: currentWeek,
    loggedDays: [],
    freezes: 0,
    freezeClaimWeek: '',
    lastLoggedDate: '',
  });

  if (state.week !== currentWeek) {
    state.week = currentWeek;
    state.loggedDays = [];
    state.freezeClaimWeek = '';
  }

  const today = todayKey();
  if (state.lastLoggedDate !== today) {
    const index = dayIndex();
    if (!state.loggedDays.includes(index)) state.loggedDays.push(index);
    state.loggedDays.sort((a, b) => a - b);
    state.lastLoggedDate = today;
  }

  writeJson(STORAGE_KEYS.streak, state);
  return state;
}

function saveStreakState(state) {
  writeJson(STORAGE_KEYS.streak, state);
  renderStreakWidget();
}

function renderStreakWidget() {
  const widget = $('#daily-streak-widget-inline');
  if (!widget) return;
  const state = getStreakState();
  const jars = $$('#daily-streak-widget-inline .streak-jar');
  jars.forEach((jar, index) => jar.classList.toggle('logged', state.loggedDays.includes(index)));
  const count = $('#streak-count-inline');
  if (count) count.textContent = `${state.loggedDays.length}/7`;
}

function saveTasks() { writeJson(STORAGE_KEYS.tasks, tasks); }
function saveIdeas() { writeJson(STORAGE_KEYS.ideas, ideas); }
function saveNectar() { localStorage.setItem(STORAGE_KEYS.nectar, String(nectar)); }

function setNectar(value) {
  nectar = Math.max(0, value);
  saveNectar();
  updateNectarDisplays();
}

function updateNectarDisplays() {
  $('#nectar-count').textContent = nectar;
  $('#shop-nectar-count').textContent = nectar;
  $$('.buy-btn').forEach((button) => {
    button.disabled = nectar < Number(button.dataset.cost);
  });
}

function showSpeech(message, duration = 2400) {
  const bubble = $('#speech-bubble');
  $('#speech-text').textContent = message;
  bubble.classList.remove('hidden');
  clearTimeout(speechTimeout);
  speechTimeout = setTimeout(() => bubble.classList.add('hidden'), duration);
}

function celebrateBee() {
  const bee = $('#bee-wrapper');
  bee.classList.add('excited');
  setTimeout(() => bee.classList.remove('excited'), 1800);
}

function renderTasks() {
  const list = $('#tasks-list');
  const empty = $('#empty-state');
  const filtered = tasks.filter((task) => {
    const matchesFilter = currentFilter === 'all' || (currentFilter === 'completed' ? task.done : !task.done);
    const matchesSearch = task.text.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  list.innerHTML = '';
  filtered.forEach((task) => {
    const li = document.createElement('li');
    li.className = `task-item${task.done ? ' completed' : ''}`;
    li.innerHTML = `
      <input class="task-checkbox" type="checkbox" ${task.done ? 'checked' : ''} aria-label="Mark task done">
      <span class="task-text"></span>
      <button class="delete-task" aria-label="Delete task">×</button>
    `;
    li.querySelector('.task-text').textContent = task.text;
    li.querySelector('.task-checkbox').addEventListener('change', (event) => toggleTask(task.id, event.target.checked));
    li.querySelector('.delete-task').addEventListener('click', () => deleteTask(task.id));
    list.appendChild(li);
  });

  const total = tasks.length;
  const done = tasks.filter((task) => task.done).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  $('#progress-percent').textContent = `${percent}%`;
  $('#progress-bar-fill').style.width = `${percent}%`;
  $('#tasks-count').textContent = `${done} of ${total} done`;
  empty.classList.toggle('hidden', filtered.length > 0);
  $('#empty-title').textContent = tasks.length ? 'Nothing here!' : 'All clear!';
  $('#empty-subtitle').textContent = tasks.length ? 'Try another filter or search.' : 'Add a task below to get started.';
}

function addTask(text) {
  tasks.unshift({ id: crypto.randomUUID(), text, done: false });
  saveTasks();
  renderTasks();
}

function toggleTask(id, done) {
  const task = tasks.find((item) => item.id === id);
  if (!task || task.done === done) return;
  task.done = done;
  if (done) {
    setNectar(nectar + 1);
    celebrateBee();
    showSpeech('Task complete! +1 nectar 🍯');
  } else {
    setNectar(nectar - 1);
    showSpeech('No worries — nectar adjusted.');
  }
  saveTasks();
  renderTasks();
}

function deleteTask(id) {
  tasks = tasks.filter((task) => task.id !== id);
  saveTasks();
  renderTasks();
}

function renderIdeas() {
  const list = $('#ideas-list');
  if (!list) return;
list.innerHTML = '';
  ideas.forEach((idea) => {
    const li = document.createElement('li');
    li.className = 'idea-item';
    li.innerHTML = '<span class="idea-text"></span><button class="delete-idea" aria-label="Delete idea">×</button>';
    li.querySelector('.idea-text').textContent = idea.text;
    li.querySelector('.delete-idea').addEventListener('click', () => {
      ideas = ideas.filter((item) => item.id !== idea.id);
      saveIdeas();
      renderIdeas();
    });
    list.appendChild(li);
  });
  $('#ideas-empty').classList.toggle('hidden', ideas.length > 0);
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${secs}`;
}

function renderTimer() {
  $('#timer-display').textContent = formatTime(timerSeconds);
  const elapsed = 1 - timerSeconds / timerTotal;
  $('#hg-sand-top').setAttribute('height', Math.max(0, 36 * (1 - elapsed)));
  $('#hg-sand-bottom').setAttribute('height', Math.max(0, 36 * elapsed));
  $('#hg-sand-bottom').setAttribute('y', 88 - Math.max(0, 36 * elapsed));
  $('#hg-trickle').setAttribute('y2', isTimerRunning ? 88 : 52);
  $('#timer-start-pause').textContent = isTimerRunning ? 'Pause' : 'Start';
}

function startPauseTimer() {
  isTimerRunning = !isTimerRunning;
  if (isTimerRunning) {
    timerInterval = setInterval(() => {
      timerSeconds = Math.max(0, timerSeconds - 1);
      renderTimer();
      if (timerSeconds === 0) {
        clearInterval(timerInterval);
        isTimerRunning = false;
        showSpeech('Focus session complete! 🌿');
        renderTimer();
      }
    }, 1000);
  } else {
    clearInterval(timerInterval);
  }
  renderTimer();
}

function setTimerPreset(minutes) {
  clearInterval(timerInterval);
  isTimerRunning = false;
  timerTotal = minutes * 60;
  timerSeconds = timerTotal;
  $$('.preset-btn').forEach((button) => button.classList.toggle('active', Number(button.dataset.minutes) === minutes));
  renderTimer();
}

function openShop() {
  $('#shop-overlay').classList.remove('hidden');
  updateNectarDisplays();
}

function closeShop() {
  $('#shop-overlay').classList.add('hidden');
}

function startScrollReward() {
  clearInterval(scrollInterval);
  scrollSeconds = 15 * 60;
  $('#prop-phone').classList.remove('hidden');
  $('#scroll-timer-display').classList.remove('hidden');
  showSpeech('Enjoy 15 minutes of scrolling! 📱');
  const tick = () => {
    $('#scroll-time-left').textContent = formatTime(scrollSeconds);
    $('#scroll-timer-label').textContent = formatTime(scrollSeconds);
    if (scrollSeconds <= 0) {
      clearInterval(scrollInterval);
      $('#prop-phone').classList.add('hidden');
      $('#scroll-timer-display').classList.add('hidden');
      showSpeech('Scroll break finished. Welcome back!');
    }
    scrollSeconds -= 1;
  };
  tick();
  scrollInterval = setInterval(tick, 1000);
}

function showTemporaryProp(selector, message, duration = 3600) {
  const prop = $(selector);
  prop.classList.remove('hidden');
  showSpeech(message);
  celebrateBee();
  setTimeout(() => prop.classList.add('hidden'), duration);
}

function buyItem(item, cost) {
  if (nectar < cost) {
    showSpeech('Not enough nectar yet — finish a task!');
    return;
  }
  setNectar(nectar - cost);
  closeShop();

  if (item === 'scroll') startScrollReward();
  if (item === 'snack') showTemporaryProp('#prop-food', 'Snack time! You earned it 🍪');
  if (item === 'gift') {
    $('#gift-phase-box').classList.remove('hidden');
    $('#gift-phase-honey').classList.add('hidden');
    $('#prop-gift').classList.remove('hidden');
    showSpeech('Opening your gift... 🎁');
    setTimeout(() => {
      $('#gift-phase-box').classList.add('hidden');
      $('#gift-phase-honey').classList.remove('hidden');
      showSpeech('A honey surprise for you! 🍯');
      celebrateBee();
    }, 1200);
    setTimeout(() => $('#prop-gift').classList.add('hidden'), 5200);
  }
}



// 2. The corrected function to OPEN the popup window
function openRoulette() {
  if (isRouletteSpinning) return;
  
  // Grab your list of tasks safely
  const taskList = (typeof tasks !== 'undefined') ? tasks : [];
  const activeTasks = taskList.filter(t => !t.done);
  
  // If you have NO tasks, show the empty hive message
  if (activeTasks.length === 0) {
    const segments = document.getElementById('roulette-segments');
    if (segments) {
      segments.innerHTML = '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; width: 80%; color: var(--muted); font-size: 1.1rem;"><div class="roulette-empty-message-emoji">🍯</div><div class="roulette-empty-message">No tasks in the hive yet! 🍯</div></div>';
    }
    const spinBtn = document.getElementById('roulette-spin-btn');
    if (spinBtn) spinBtn.disabled = true;
    
    const overlay = document.getElementById('roulette-overlay');
    if (overlay) overlay.classList.remove('hidden');
    return;
  }

  // If you DO have tasks, build the wheel and show the window!
  createRouletteWheel(activeTasks);
  
  const overlay = document.getElementById('roulette-overlay');
  if (overlay) overlay.classList.remove('hidden');
  
  const spinBtn = document.getElementById('roulette-spin-btn');
  if (spinBtn) spinBtn.disabled = false;
}

function closeRoulette() {
  $('#roulette-overlay').classList.add('hidden');
  $('#roulette-segments').innerHTML = '';
}

function createRouletteWheel(taskList) {
  const segments = $('#roulette-segments');
  segments.innerHTML = '';
  const count = taskList.length;
  const anglePerSegment = 360 / count;

  taskList.forEach((task, i) => {
    const segment = document.createElement('div');
    segment.className = 'roulette-segment';
    segment.style.transform = `rotate(${i * anglePerSegment}deg)`;
    
    const isLightSegment = i % 2 === 0;
    segment.style.backgroundColor = isLightSegment ? 'rgba(111, 143, 86, 0.15)' : '#6f8f56';
    segment.style.color = isLightSegment ? '#2f3328' : 'white';
    segment.style.clip = `polygon(0% 0%, 100% ${50 - anglePerSegment / 2}%, 100% ${50 + anglePerSegment / 2}%, 0% 100%)`;
    
    const text = document.createElement('span');
    text.textContent = task.text.substring(0, 20);
    text.style.transform = `rotate(${anglePerSegment / 2}deg)`;
    segment.appendChild(text);
    
    segments.appendChild(segment);
  });
}

// 3. The corrected function to SPIN the wheel
function spinRoulette() {
  if (isRouletteSpinning) return;
  
  const taskList = (typeof tasks !== 'undefined') ? tasks : [];
  const activeTasks = taskList.filter(t => !t.done);
  if (activeTasks.length === 0) return;

  isRouletteSpinning = true;
  
  const spinBtn = document.getElementById('roulette-spin-btn');
  if (spinBtn) spinBtn.disabled = true; // Lock button during spin
  
  const wheel = document.getElementById('roulette-wheel');
  if (!wheel) return;

  // Calculate the physics of the spin
  const spins = 5 + Math.random() * 3;
  const randomIndex = Math.floor(Math.random() * activeTasks.length);
  const anglePerSegment = 360 / activeTasks.length;
  const finalAngle = spins * 360 + (randomIndex * anglePerSegment);

  // Reset the wheel to 0 degrees first
  wheel.style.transition = 'none';
  wheel.style.transform = 'rotate(0deg)';

  // Start the beautiful spinning animation
  setTimeout(() => {
    wheel.style.transition = `transform ${2.5 + Math.random() * 0.5}s cubic-bezier(0.17, 0.67, 0.12, 0.98)`;
    wheel.style.transform = `rotate(${finalAngle}deg)`;

    // Wait 3 seconds for the wheel to stop spinning
    setTimeout(() => {
      // FIX: Grab just the TEXT of the winning task instead of the whole object package!
      const winningTaskText = activeTasks[randomIndex].text || "A mystery bee task! 🐝";
      
      if (typeof showPlankAnimation === 'function') {
        showPlankAnimation(winningTaskText);
      }
      
      isRouletteSpinning = false;
      if (spinBtn) spinBtn.disabled = false; // Unlock button
    }, 3000);
  }, 50);
}

function showPlankAnimation(task) {
  const plank = $('#prop-plank');
  $('#plank-text').textContent = task.text;
  plank.classList.remove('hidden');
  plank.classList.add('show-animation');
  showSpeech(`Bzzle picked: ${task.text} 🎡`);
  celebrateBee();

  setTimeout(() => {
    plank.classList.remove('show-animation');
    plank.classList.add('hidden');
  }, 7000);
}

function wireMainPage() {
  if (!$('#task-form')) return;

  $('#task-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#task-input');
    const text = input.value.trim();
    if (text) addTask(text);
    input.value = '';
  });
  $('#search-input').addEventListener('input', (event) => {
    searchTerm = event.target.value;
    $('#clear-search-btn').style.display = searchTerm ? 'block' : 'none';
    renderTasks();
  });
  $('#clear-search-btn').addEventListener('click', () => {
    searchTerm = '';
    $('#search-input').value = '';
    $('#clear-search-btn').style.display = 'none';
    renderTasks();
  });
  $$('.filter-tab').forEach((button) => button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;
    $$('.filter-tab').forEach((tab) => tab.classList.toggle('active', tab === button));
    renderTasks();
  }));
  $('#clear-completed-btn').addEventListener('click', () => {
    tasks = tasks.filter((task) => !task.done);
    saveTasks();
    renderTasks();
  });

  $('#idea-add-btn').addEventListener('click', addIdeaFromInput);
  $('#idea-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addIdeaFromInput();
  });

  $('#timer-start-pause').addEventListener('click', startPauseTimer);
  $('#hourglass-wrapper').addEventListener('click', startPauseTimer);
  $('#timer-reset').addEventListener('click', () => setTimerPreset(timerTotal / 60));
  $$('.preset-btn').forEach((button) => button.addEventListener('click', () => setTimerPreset(Number(button.dataset.minutes))));

  $('#shop-btn').addEventListener('click', openShop);
  $('#shop-close-btn').addEventListener('click', closeShop);
  $('#shop-overlay').addEventListener('click', (event) => {
    if (event.target.id === 'shop-overlay') closeShop();
  });
  $$('.buy-btn').forEach((button) => button.addEventListener('click', () => buyItem(button.dataset.item, Number(button.dataset.cost))));

  // Roulette button
  $('#roulette-btn').addEventListener('click', openRoulette);
  $('#roulette-close').addEventListener('click', closeRoulette);
  $('#roulette-spin-btn').addEventListener('click', spinRoulette);
  $('#roulette-overlay').addEventListener('click', (event) => {
    if (event.target.id === 'roulette-overlay') closeRoulette();
  });

  // Calendar button
  $('#calendar-btn').addEventListener('click', () => {
    window.location.href = 'calendar.html';
  });

  renderTasks();
  renderIdeas();
  renderTimer();
  updateNectarDisplays();
  showSpeech('Hello! I am Bzzle 🐝', 1800);
}

function addIdeaFromInput() {
  const input = $('#idea-input');
  const text = input.value.trim();
  if (!text) return;
  ideas.unshift({ id: crypto.randomUUID(), text });
  input.value = '';
  saveIdeas();
  renderIdeas();
}

function wireFreezePage() {
  if (!$('#freeze-claim-btn')) return;
  const status = $('#freeze-status');
  const count = $('#freeze-count');
  const claimButton = $('#freeze-claim-btn');
  const beehive = $('#beehive-btn');

  const render = () => {
    const state = getStreakState();
    const claimed = state.freezeClaimWeek === weekKey();
    count.textContent = state.freezes;
    claimButton.disabled = claimed;
    beehive.disabled = claimed;
    status.textContent = claimed ? 'You already opened the beehive this week. Come back next week!' : "Open the beehive to claim this week's streak freeze.";
  };

  const claim = () => {
    const state = getStreakState();
    if (state.freezeClaimWeek === weekKey()) return;
    state.freezes += 1;
    state.freezeClaimWeek = weekKey();
    saveStreakState(state);
    status.textContent = 'Buzz buzz! You claimed one streak freeze for this week. ❄️';
    render();
  };

  claimButton.addEventListener('click', claim);
  beehive.addEventListener('click', claim);
  render();
}

getStreakState();
renderStreakWidget();
wireMainPage();
wireFreezePage();
