const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.API_KEY || 'changeme';
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── Veri depolama ───
let members = loadJson('members.json', []);
let submissions = loadJson('submissions.json', []);

function loadJson(filename, fallback) {
  const p = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return fallback;
}

function saveJson(filename, data) {
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.key;
  if (key !== API_KEY) return res.status(401).json({ error: 'Yetkisiz erişim' });
  next();
}

// ─── API: Üye listesi push (Electron → Servis) ───
app.post('/api/members', requireApiKey, (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Geçersiz veri' });
  members = req.body;
  saveJson('members.json', members);
  res.json({ ok: true, count: members.length });
});

// ─── API: Üye listesi çek (Form sayfası için) ───
app.get('/api/members', (req, res) => {
  res.json(members);
});

// ─── API: Off-day gönder (Üye → Servis) ───
app.post('/api/submit', (req, res) => {
  const { person_id, person_name, date } = req.body;
  if (!person_id || !person_name || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Eksik veya hatalı veri' });
  }

  const member = members.find(m => m.id === person_id);
  if (!member) return res.status(404).json({ error: 'Üye bulunamadı' });

  const submission = {
    id: crypto.randomUUID(),
    person_id,
    person_name,
    date,
    submitted_at: new Date().toISOString(),
    synced: false,
  };

  // Aynı kişi + tarih kombinasyonu varsa replace, yoksa append (geçmiş haftalar korunur)
  const existingIdx = submissions.findIndex(s => s.person_id === person_id && s.date === date);
  if (existingIdx >= 0) submissions[existingIdx] = submission;
  else submissions.push(submission);

  saveJson('submissions.json', submissions);
  res.json({ ok: true });
});

// ─── API: Gönderimleri çek (Servis → Electron) ───
app.get('/api/submissions', requireApiKey, (req, res) => {
  res.json(submissions);
});

// ─── API: Sync edildi işaretle ───
app.post('/api/submissions/mark-synced', requireApiKey, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'Geçersiz veri' });
  submissions = submissions.map(s => ids.includes(s.id) ? { ...s, synced: true } : s);
  saveJson('submissions.json', submissions);
  res.json({ ok: true });
});

// ─── API: Sağlık kontrolü ───
app.get('/api/health', (req, res) => {
  res.json({ ok: true, members: members.length, submissions: submissions.length });
});

// ─── Form Sayfası ───
app.get('/', (req, res) => {
  res.send(renderFormPage());
});

function renderFormPage() {
  const DAY_NAMES = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
  const MONTH_NAMES = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

  function getMonday(d) {
    const r = new Date(d);
    const day = r.getDay();
    const diff = r.getDate() - day + (day === 0 ? -6 : 1);
    r.setDate(diff);
    r.setHours(0, 0, 0, 0);
    return r;
  }

  function fmtIso(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  const today = new Date();
  const thisMonday = getMonday(today);

  function buildWeekHtml(weekStart, label) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(d.getDate() + i);
      days.push({ iso: fmtIso(d), dayName: DAY_NAMES[d.getDay()], dayNum: d.getDate(), monthName: MONTH_NAMES[d.getMonth()] });
    }
    const start = days[0]; const end = days[6];
    const rangeLabel = `${start.dayNum} ${start.monthName} – ${end.dayNum} ${end.monthName}`;
    const buttons = days.map(d => `
      <label class="day-label">
        <input type="radio" name="offday" value="${d.iso}" />
        <span class="day-box">
          <span class="day-name">${d.dayName}</span>
          <span class="day-num">${d.dayNum} ${d.monthName}</span>
        </span>
      </label>`).join('');
    return `
      <div class="week-section">
        <div class="week-header">
          <span class="week-title">${label}</span>
          <span class="week-range">${rangeLabel}</span>
        </div>
        <div class="days-grid">${buttons}</div>
      </div>`;
  }

  const dayCheckboxes = buildWeekHtml(thisMonday, 'Bu Hafta');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>YTU Sigma — Off-Day Bildirimi</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0f1117;
      --card: #1a1d27;
      --border: #2a2d3a;
      --primary: #6366f1;
      --primary-hover: #4f52d6;
      --primary-bg: rgba(99,102,241,0.12);
      --text: #e8eaf0;
      --text-muted: #6b7280;
      --text-secondary: #9ca3af;
      --success: #22c55e;
      --success-bg: rgba(34,197,94,0.12);
      --danger: #ef4444;
      --danger-bg: rgba(239,68,68,0.12);
      --radius: 12px;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 16px;
    }

    .header {
      text-align: center;
      margin-bottom: 32px;
    }
    .header h1 {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--text);
    }
    .header p {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 6px;
    }

    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 28px;
      width: 100%;
      max-width: 480px;
    }

    .form-group {
      margin-bottom: 20px;
    }
    label.form-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    select {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 15px;
      padding: 11px 14px;
      outline: none;
      transition: border-color 0.15s;
      appearance: none;
      cursor: pointer;
    }
    select:focus { border-color: var(--primary); }
    option { background: #1a1d27; }

    .week-section {
      margin-bottom: 16px;
    }
    .week-section:last-child {
      margin-bottom: 0;
    }
    .week-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 8px;
      padding: 0 2px;
    }
    .week-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--text);
    }
    .week-range {
      font-size: 11px;
      color: var(--text-muted);
    }

    .days-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .days-grid > .day-label:last-child:nth-child(odd) {
      grid-column: 1 / -1;
      justify-self: center;
      width: calc(50% - 4px);
    }

    .day-label {
      cursor: pointer;
      user-select: none;
    }
    .day-label input[type="radio"], .day-label input[type="checkbox"] {
      display: none;
    }
    .day-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      height: 56px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg);
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      transition: all 0.15s;
    }
    .day-box .day-name {
      font-size: 13px;
      font-weight: 700;
    }
    .day-box .day-num {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted);
    }
    .day-label input:checked + .day-box {
      background: var(--primary-bg);
      border-color: var(--primary);
      color: var(--primary);
    }
    .day-label input:checked + .day-box .day-num {
      color: var(--primary);
    }
    .day-label:hover .day-box {
      border-color: var(--primary);
    }

    .hint {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 8px;
    }

    .divider {
      height: 1px;
      background: var(--border);
      margin: 20px 0;
    }

    .btn-submit {
      width: 100%;
      height: 48px;
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
      letter-spacing: -0.01em;
    }
    .btn-submit:hover { background: var(--primary-hover); }
    .btn-submit:active { transform: scale(0.98); }
    .btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

    .alert {
      display: none;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 16px;
    }
    .alert.error {
      background: var(--danger-bg);
      border: 1px solid var(--danger);
      color: var(--danger);
    }
    .alert.success {
      background: var(--success-bg);
      border: 1px solid var(--success);
      color: var(--success);
    }

    .success-screen {
      display: none;
      text-align: center;
      padding: 16px 0;
    }
    .success-icon {
      width: 56px; height: 56px;
      background: var(--success-bg);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 16px;
      color: var(--success);
    }
    .success-screen h2 {
      font-size: 18px;
      font-weight: 800;
      margin-bottom: 8px;
    }
    .success-screen p {
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .btn-again {
      margin-top: 20px;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 13px;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .btn-again:hover { border-color: var(--primary); color: var(--primary); }

    .empty-state {
      text-align: center;
      padding: 20px 0;
      color: var(--text-muted);
      font-size: 14px;
    }

    .footer {
      margin-top: 32px;
      font-size: 12px;
      color: var(--text-muted);
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>YTU Sigma Aeronautics</h1>
    <p>Off-Day Bildirimi</p>
  </div>

  <div class="card" id="form-card">
    <div class="alert error" id="alert-error"></div>

    <div id="form-body">
      <div class="form-group">
        <label class="form-label" for="person-select">Adınız</label>
        <select id="person-select">
          <option value="">— Adınızı seçin —</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Çalışmadığınız günler</label>
        <div class="days-grid">
          ${dayCheckboxes}
        </div>
        <p class="hint">Yalnızca bir gün seçebilirsiniz.</p>
      </div>

      <div class="divider"></div>

      <button class="btn-submit" id="submit-btn">Gönder</button>
    </div>

    <div class="success-screen" id="success-screen">
      <div class="success-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <h2>Kaydedildi!</h2>
      <p id="success-msg">Off-day bilginiz sisteme iletildi.<br/>Teşekkürler.</p>
      <button class="btn-again" id="again-btn">Tekrar gönder</button>
    </div>
  </div>

  <div class="footer">YTU Sigma Aeronautics &copy; 2026</div>

  <script>
    const selectEl = document.getElementById('person-select');
    const submitBtn = document.getElementById('submit-btn');
    const alertError = document.getElementById('alert-error');
    const formBody = document.getElementById('form-body');
    const successScreen = document.getElementById('success-screen');
    const successMsg = document.getElementById('success-msg');
    const againBtn = document.getElementById('again-btn');

    async function loadMembers() {
      try {
        const res = await fetch('/api/members');
        const members = await res.json();
        if (members.length === 0) {
          selectEl.innerHTML = '<option value="">Henüz üye listesi yüklenmedi</option>';
          return;
        }
        selectEl.innerHTML = '<option value="">— Adınızı seçin —</option>' +
          members.map(m => \`<option value="\${m.id}" data-name="\${m.name}">\${m.name}</option>\`).join('');
      } catch {
        selectEl.innerHTML = '<option value="">Bağlantı hatası</option>';
      }
    }

    function showError(msg) {
      alertError.textContent = msg;
      alertError.style.display = 'block';
    }
    function hideError() {
      alertError.style.display = 'none';
    }

    submitBtn.addEventListener('click', async () => {
      hideError();
      const selectedOpt = selectEl.options[selectEl.selectedIndex];
      if (!selectEl.value) { showError('Lütfen adınızı seçin.'); return; }

      const personId = parseInt(selectEl.value, 10);
      const personName = selectedOpt.dataset.name;
      const checked = document.querySelector('input[name="offday"]:checked');
      if (!checked) { showError('Lütfen bir gün seçin.'); return; }
      const date = checked.value;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Gönderiliyor...';

      try {
        const res = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ person_id: personId, person_name: personName, date }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Sunucu hatası');

        const dayNames = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
        const monthNames = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
        const d = new Date(date + 'T00:00:00');
        const dayStr = \`\${dayNames[d.getDay()]} \${d.getDate()} \${monthNames[d.getMonth()]}\`;
        successMsg.innerHTML = \`<strong>\${personName}</strong> için off-day bilgisi kaydedildi.<br/>Off-day: \${dayStr}\`;

        formBody.style.display = 'none';
        successScreen.style.display = 'block';
      } catch (err) {
        showError('Gönderim başarısız: ' + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Gönder';
      }
    });

    againBtn.addEventListener('click', () => {
      successScreen.style.display = 'none';
      formBody.style.display = 'block';
      hideError();
      selectEl.value = '';
      document.querySelectorAll('input[name="offday"]').forEach(cb => cb.checked = false);
    });

    loadMembers();
  </script>
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log(`Offday service çalışıyor: http://localhost:${PORT}`);
  console.log(`Üye sayısı: ${members.length}, Gönderim sayısı: ${submissions.length}`);
});
