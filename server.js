const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const session = require('express-session');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'saas_secret_key_lingasugur',
  resave: false,
  saveUninitialized: false
}));

const BOT_TOKEN = '8043975430:AAFemNc5czO9Mctg6ti25M4-HM3duKEtO0E';
const CHAT_ID = '8617291565';
const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    return { users: [], websites: [] };
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

async function sendTelegramAlert(url, reason, userEmail) {
  try {
    const text = `🚨 ಎಚ್ಚರಿಕೆ (${userEmail}):\n${url} ಡೌನ್ ಆಗಿದೆ!\nಕಾರಣ: ${reason}`;
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: text
    });
  } catch (err) {
    console.error('Telegram Error:', err.message);
  }
}

async function monitorSites() {
  const db = loadDB();
  for (let site of db.websites) {
    const start = Date.now();
    try {
      await axios.get(site.url, { timeout: 5000 });
      site.status = 'UP';
      site.latency = `${Date.now() - start} ms`;
    } catch (err) {
      if (site.status !== 'DOWN') {
        const owner = db.users.find(u => u.id === site.userId);
        sendTelegramAlert(site.url, err.message, owner ? owner.email : 'Unknown');
      }
      site.status = 'DOWN';
      site.latency = '0 ms';
    }
  }
  saveDB(db);
}

setInterval(monitorSites, 15000);

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}

app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Uptime SaaS - Login</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .card { background: #1e293b; padding: 35px; border-radius: 12px; width: 340px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }
        h2 { text-align: center; margin-bottom: 20px; color: #38bdf8; }
        input { width: 100%; padding: 12px; margin: 10px 0; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #fff; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: #0284c7; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; margin-top: 10px; font-size: 15px; }
        button:hover { background: #0369a1; }
        p { text-align: center; font-size: 13px; color: #94a3b8; }
        a { color: #38bdf8; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>⚡ Uptime SaaS Login</h2>
        <form method="POST" action="/login">
          <input type="email" name="email" placeholder="ಇಮೇಲ್ ಅಡ್ರೆಸ್" required />
          <input type="password" name="password" placeholder="ಪಾಸ್‌ವರ್ಡ್" required />
          <button type="submit">ಲಾಗಿನ್</button>
        </form>
        <p>ಹೊಸಬರೇ? <a href="/signup">ಖಾತೆ ರಚಿಸಿ (Sign Up)</a></p>
      </div>
    </body>
    </html>
  `);
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const db = loadDB();
  const user = db.users.find(u => u.email === email && u.password === password);
  if (!user) return res.send('<script>alert("ಇಮೇಲ್ ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್ ತಪ್ಪಾಗಿದೆ!"); window.location="/login";</script>');
  req.session.userId = user.id;
  req.session.email = user.email;
  res.redirect('/dashboard');
});

app.get('/signup', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Uptime SaaS - Sign Up</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .card { background: #1e293b; padding: 35px; border-radius: 12px; width: 340px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }
        h2 { text-align: center; margin-bottom: 20px; color: #10b981; }
        input { width: 100%; padding: 12px; margin: 10px 0; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #fff; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; margin-top: 10px; font-size: 15px; }
        button:hover { background: #059669; }
        p { text-align: center; font-size: 13px; color: #94a3b8; }
        a { color: #10b981; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>🚀 ಹೊಸ ಖಾತೆ ರಚಿಸಿ</h2>
        <form method="POST" action="/signup">
          <input type="email" name="email" placeholder="ಇಮೇಲ್ ಅಡ್ರೆಸ್" required />
          <input type="password" name="password" placeholder="ಪಾಸ್‌ವರ್ಡ್" required />
          <button type="submit">ಉಚಿತವಾಗಿ ನೋಂದಾಯಿಸಿ</button>
        </form>
        <p>ಈಗಾಗಲೇ ಖಾತೆ ಇದೆಯೇ? <a href="/login">ಲಾಗಿನ್ ಆಗಿ</a></p>
      </div>
    </body>
    </html>
  `);
});

app.post('/signup', (req, res) => {
  const { email, password } = req.body;
  const db = loadDB();
  if (db.users.find(u => u.email === email)) {
    return res.send('<script>alert("ಈ ಇಮೇಲ್ ಈಗಾಗಲೇ ನೋಂದಾಯಿತವಾಗಿದೆ!"); window.location="/signup";</script>');
  }
  const newUser = {
    id: 'user_' + Date.now(),
    email,
    password,
    plan: 'free',
    maxLimit: 1
  };
  db.users.push(newUser);
  saveDB(db);
  req.session.userId = newUser.id;
  req.session.email = newUser.email;
  res.redirect('/dashboard');
});

app.get('/dashboard', requireAuth, (req, res) => {
  const db = loadDB();
  const user = db.users.find(u => u.id === req.session.userId) || { plan: 'free', maxLimit: 1 };
  const userSites = db.websites.filter(s => s.userId === req.session.userId);

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Dashboard - Uptime SaaS</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #fff; margin: 0; padding: 25px; }
        .container { max-width: 900px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; border-bottom: 1px solid #334155; padding-bottom: 15px; }
        .badge { padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; }
        .badge-free { background: #475569; color: #fff; }
        .badge-pro { background: #f59e0b; color: #000; }
        .upgrade-btn { background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; text-decoration: none; margin-right: 10px; }
        .card { background: #1e293b; padding: 25px; border-radius: 12px; margin-bottom: 25px; border: 1px solid #334155; }
        .input-group { display: flex; gap: 10px; }
        input[type="text"] { flex: 1; padding: 12px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #fff; }
        button.add-btn { padding: 12px 24px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { text-align: left; padding: 12px; border-bottom: 1px solid #334155; }
        .up { color: #10b981; font-weight: bold; }
        .down { color: #ef4444; font-weight: bold; }
        .delete-btn { background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
        .logout { color: #94a3b8; text-decoration: none; margin-left: 10px; }
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); justify-content: center; align-items: center; }
        .modal-content { background: #1e293b; padding: 35px; border-radius: 12px; max-width: 420px; text-align: center; border: 2px solid #f59e0b; }
      </style>
      <script>
        setTimeout(() => location.reload(), 15000);
        function openUpgrade() { document.getElementById('upgradeModal').style.display = 'flex'; }
        function closeUpgrade() { document.getElementById('upgradeModal').style.display = 'none'; }
      </script>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div>
            <h2 style="margin:0;">⚡ Uptime Monitor SaaS</h2>
            <small style="color:#94a3b8;">${req.session.email} | ಪ್ಲಾನ್: <span class="badge ${user.plan === 'pro' ? 'badge-pro' : 'badge-free'}">${user.plan.toUpperCase()}</span> (ಬಳಕೆ: ${userSites.length}/${user.maxLimit || 1})</small>
          </div>
          <div>
            ${user.plan !== 'pro' ? '<button onclick="openUpgrade()" class="upgrade-btn">👑 Upgrade Pro (₹199)</button>' : ''}
            <a href="/logout" class="logout">Logout</a>
          </div>
        </div>

        <div class="card">
          <form method="POST" action="/add-website" class="input-group">
            <input type="text" name="url" placeholder="https://example.com" required />
            <button type="submit" class="add-btn">+ Add Website</button>
          </form>
        </div>

        <div class="card">
          <table>
            <thead>
              <tr>
                <th>ವೆಬ್‌ಸೈಟ್</th>
                <th>ಸ್ಥಿತಿ (STATUS)</th>
                <th>ವೇಗ (LATENCY)</th>
                <th>ಕ್ರಮ</th>
              </tr>
            </thead>
            <tbody>
              ${userSites.length === 0 ? '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">ಯಾವುದೇ ವೆಬ್‌ಸೈಟ್ ಸೇರಿಸಲಾಗಿಲ್ಲ.</td></tr>' : ''}
              ${userSites.map(s => `
                <tr>
                  <td><b>${s.url}</b></td>
                  <td class="${s.status === 'UP' ? 'up' : 'down'}">${s.status}</td>
                  <td>${s.latency}</td>
                  <td>
                    <form method="POST" action="/delete-website" style="margin:0;">
                      <input type="hidden" name="url" value="${s.url}" />
                      <button type="submit" class="delete-btn">Delete</button>
                    </form>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Upgrade Paywall Modal -->
      <div id="upgradeModal" class="modal">
        <div class="modal-content">
          <h2 style="color:#f59e0b; margin-top:0;">👑 Pro ಪ್ಲಾನ್‌ಗೆ ಅಪ್‌ಗ್ರೇಡ್ ಆಗಿ</h2>
          <p style="color:#cbd5e1;">ಉಚಿತ ಖಾತೆಯಲ್ಲಿ ಕೇವಲ <b>1 ವೆಬ್‌ಸೈಟ್</b> ಮಾತ್ರ ಮಾನಿಟರ್ ಮಾಡಬಹುದು.</p>
          <div style="background:#0f172a; padding:15px; border-radius:8px; text-align:left; margin:20px 0; font-size:14px;">
            <p style="margin:5px 0;">✅ ಗರಿಷ್ಠ <b>15 ವೆಬ್‌ಸೈಟ್‌ಗಳು</b></p>
            <p style="margin:5px 0;">⚡ <b>ಅಲ್ಟ್ರಾ-ಫಾಸ್ಟ್ 30 ಸೆಕೆಂಡ್</b> ಚೆಕಿಂಗ್</p>
            <p style="margin:5px 0;">📱 <b>ಟೆಲಿಗ್ರಾಂ + ತ್ವರಿತ SMS ಅಲರ್ಟ್</b></p>
            <p style="margin:5px 0; font-weight:bold; color:#10b981; font-size:16px;">ಕೇವಲ ₹199 / ತಿಂಗಳಿಗೆ</p>
          </div>
          <button onclick="alert('ಪಾವತಿ ಗೇಟ್‌ವೇ (Razorpay) ಶೀಘ್ರದಲ್ಲೇ ತೆರೆಯಲಿದೆ!');" style="width:100%; padding:12px; background:#10b981; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-size:16px;">ಈಗಲೇ ಪಾವತಿಸಿ (₹199)</button>
          <button onclick="closeUpgrade()" style="width:100%; padding:8px; background:transparent; color:#94a3b8; border:none; margin-top:10px; cursor:pointer;">ಮುಚ್ಚಿ (Cancel)</button>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.post('/add-website', requireAuth, (req, res) => {
  let { url } = req.body;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  const db = loadDB();
  const user = db.users.find(u => u.id === req.session.userId);
  const userSites = db.websites.filter(s => s.userId === req.session.userId);
  const maxAllowed = user && user.plan === 'pro' ? 15 : (user.maxLimit || 1);

  // 1 Website Free Limit Check
  if (userSites.length >= maxAllowed) {
    return res.send(`
      <script>
        alert("⚠️ ಕ್ಷಮಿಸಿ! ಉಚಿತ ಪ್ಲಾನ್‌ನಲ್ಲಿ ಗರಿಷ್ಠ 1 ವೆಬ್‌ಸೈಟ್ ಮಾತ್ರ ಸಾಧ್ಯ.\\nಹೆಚ್ಚಿನ ಸೈಟ್‌ಗಳಿಗಾಗಿ Pro ಪ್ಲಾನ್‌ಗೆ (₹199) ಅಪ್‌ಗ್ರೇಡ್ ಮಾಡಿ!");
        window.location = '/dashboard';
      </script>
    `);
  }

  if (!db.websites.find(s => s.url === url && s.userId === req.session.userId)) {
    db.websites.push({
      userId: req.session.userId,
      url,
      status: 'CHECKING...',
      latency: '...'
    });
    saveDB(db);
  }
  res.redirect('/dashboard');
});

app.post('/delete-website', requireAuth, (req, res) => {
  const { url } = req.body;
  const db = loadDB();
  db.websites = db.websites.filter(s => !(s.url === url && s.userId === req.session.userId));
  saveDB(db);
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});