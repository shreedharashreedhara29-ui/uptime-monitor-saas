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

const BOT_TOKEN = '8843971439:AAEemWcScx69MzEg6tiZG84-bMJdwKEfcWc';
const CHAT_ID = '8617291565';
const DB_FILE = path.join(__dirname, 'database.json');

// ಡೇಟಾಬೇಸ್ ಲೋಡ್ ಮಾಡುವ ಫಂಕ್ಷನ್
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('DB Load Error:', err.message);
  }
  return { users: [] };
}

// ಡೇಟಾಬೇಸ್ ಸೇವ್ ಮಾಡುವ ಫಂಕ್ಷನ್
function saveDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('DB Save Error:', err.message);
  }
}

let db = loadDB();

// ಟೆಲಿಗ್ರಾಂ ಅಲರ್ಟ್ ಕಳುಹಿಸುವ ಪ್ರಕ್ರಿಯೆ
async function sendAlert(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message
    });
  } catch (err) {
    console.error('Telegram Error:', err.message);
  }
}

// ಎಲ್ಲಾ ಬಳಕೆದಾರರ ಸೈಟ್‌ಗಳನ್ನು ಹಿನ್ನೆಲೆಯಲ್ಲಿ ಚೆಕ್ ಮಾಡುವ ಪ್ರಕ್ರಿಯೆ
async function checkAllUsersSites() {
  let changed = false;
  for (let user of db.users) {
    for (let site of user.websites) {
      const start = Date.now();
      try {
        await axios.get(site.url, { timeout: 5000 });
        site.latency = Date.now() - start;
        if (site.status !== 'UP') {
          if (site.status === 'DOWN') {
            await sendAlert(`✅ ರಿಕವರಿ (${user.email}): ${site.url} ಮತ್ತೆ ಚಾಲನೆಯಲ್ಲಿದೆ! (${site.latency}ms)`);
          }
          site.status = 'UP';
          changed = true;
        }
      } catch (err) {
        site.latency = 0;
        if (site.status !== 'DOWN') {
          site.status = 'DOWN';
          await sendAlert(`🚨 ಎಚ್ಚರಿಕೆ (${user.email}): ${site.url} ಡೌನ್ ಆಗಿದೆ!\nಕಾರಣ: ${err.message}`);
          changed = true;
        }
      }
    }
  }
  if (changed) saveDB(db);
}

setInterval(checkAllUsersSites, 30000);
checkAllUsersSites();

// ಲಾಗಿನ್ ತಪಾಸಣಾ ಮಿಡಲ್‌ವೇರ್
function requireAuth(req, res, next) {
  if (req.session && req.session.userEmail) {
    next();
  } else {
    res.redirect('/login');
  }
}

// ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಪೇಜ್
app.get('/', requireAuth, (req, res) => {
  const user = db.users.find(u => u.email === req.session.userEmail);
  const websites = user ? user.websites : [];

  let siteRows = websites.map((s, index) => `
    <tr style="border-bottom: 1px solid #edf2f7;">
      <td style="padding: 14px 18px; font-weight: 600; color: #1a202c;">${s.url}</td>
      <td style="padding: 14px 18px;">
        <span style="background: ${s.status === 'UP' ? '#def7ec' : s.status === 'DOWN' ? '#fde8e8' : '#e1effe'}; 
                     color: ${s.status === 'UP' ? '#03543f' : s.status === 'DOWN' ? '#9b1c1c' : '#1e429f'}; 
                     padding: 5px 12px; border-radius: 9999px; font-weight: 700; font-size: 12px; text-transform: uppercase;">
          ${s.status}
        </span>
      </td>
      <td style="padding: 14px 18px; color: #4a5568; font-weight: 500;">${s.latency} ms</td>
      <td style="padding: 14px 18px; text-align: right;">
        <form action="/delete" method="POST" style="margin: 0; display: inline;">
          <input type="hidden" name="index" value="${index}">
          <button type="submit" style="background: #ef4444; color: white; border: none; padding: 7px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">Delete</button>
        </form>
      </td>
    </tr>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Uptime SaaS Cloud Dashboard</title>
      <meta http-equiv="refresh" content="15">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; margin: 0; padding: 40px 20px; }
        .wrapper { max-width: 850px; margin: auto; background: #ffffff; border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3); overflow: hidden; }
        .header { background: #1e293b; padding: 20px 30px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { color: #f8fafc; margin: 0; font-size: 19px; }
        .user-tag { color: #94a3b8; font-size: 13px; }
        .btn-logout { background: #475569; color: white; border: none; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-size: 12px; margin-left: 10px; }
        .content { padding: 30px; }
        .input-group { display: flex; gap: 10px; margin-bottom: 25px; }
        input[type="url"] { flex: 1; padding: 13px 16px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 15px; outline: none; }
        .btn-add { background: #2563eb; color: white; border: none; padding: 13px 24px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; }
        table { width: 100%; border-collapse: collapse; text-align: left; }
        th { background: #f8fafc; padding: 12px 18px; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 700; border-bottom: 2px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <div>
            <h1>⚡ Uptime Monitor SaaS</h1>
            <span class="user-tag">ಲಾಗಿನ್ ಆಗಿದೆ: <b>${req.session.userEmail}</b></span>
          </div>
          <div>
            <span style="background: #22c55e; color: white; font-size: 11px; padding: 4px 10px; border-radius: 9999px; font-weight: bold;">Live 15s</span>
            <a href="/logout" class="btn-logout">Logout</a>
          </div>
        </div>
        <div class="content">
          <form action="/add" method="POST" class="input-group">
            <input type="url" name="url" placeholder="https://example.com" required />
            <button type="submit" class="btn-add">+ Add Website</button>
          </form>
          <table>
            <thead>
              <tr>
                <th>ವೆಬ್‌ಸೈಟ್</th>
                <th>ಸ್ಥಿತಿ (Status)</th>
                <th>ವೇಗ (Latency)</th>
                <th style="text-align: right;">ಕ್ರಮ</th>
              </tr>
            </thead>
            <tbody>
              ${siteRows.length > 0 ? siteRows : '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #94a3b8;">ಇನ್ನೂ ಯಾವುದೇ ವೆಬ್‌ಸೈಟ್ ಸೇರಿಸಲಾಗಿಲ್ಲ. ಮೇಲೆ ವೆಬ್‌ಸೈಟ್ ಲಿಂಕ್ ಹಾಕಿ ಸೇರಿಸಿ!</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </body>
    </html>
  `);
});

// ಲಾಗಿನ್ / ಸೈನ್‌ಅಪ್ UI
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Login - Uptime SaaS</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .auth-card { background: white; padding: 35px; border-radius: 14px; width: 340px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
        h2 { margin-top: 0; color: #1e293b; text-align: center; }
        input { width: 100%; padding: 12px; margin-top: 10px; margin-bottom: 15px; border: 1px solid #cbd5e0; border-radius: 6px; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: #2563eb; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="auth-card">
        <h2>⚡ Uptime SaaS Login</h2>
        <form action="/auth" method="POST">
          <label style="font-size: 13px; font-weight: bold;">ಇಮೇಲ್ (Email):</label>
          <input type="email" name="email" placeholder="user@gmail.com" required />
          <label style="font-size: 13px; font-weight: bold;">ಪಾಸ್‌ವರ್ಡ್ (Password):</label>
          <input type="password" name="password" placeholder="ನಿಮ್ಮ ಪಾಸ್‌ವರ್ಡ್" required />
          <button type="submit">Sign In / Sign Up</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// ಲಾಗಿನ್ & ಆಟೋ-ಸೈನ್‌ಅಪ್ ಲಾಜಿಕ್
app.post('/auth', (req, res) => {
  const { email, password } = req.body;
  let user = db.users.find(u => u.email === email);
  if (!user) {
    user = { email, password, websites: [] };
    db.users.push(user);
    saveDB(db);
  }
  req.session.userEmail = email;
  res.redirect('/');
});

// ಸೈಟ್ ಸೇರ್ಪಡೆ
app.post('/add', requireAuth, (req, res) => {
  const user = db.users.find(u => u.email === req.session.userEmail);
  const newUrl = req.body.url;
  if (user && newUrl && !user.websites.some(s => s.url === newUrl)) {
    user.websites.push({ url: newUrl, status: 'Checking...', latency: 0 });
    saveDB(db);
    checkAllUsersSites();
  }
  res.redirect('/');
});

// ಸೈಟ್ ಡಿಲೀಟ್
app.post('/delete', requireAuth, (req, res) => {
  const user = db.users.find(u => u.email === req.session.userEmail);
  const index = parseInt(req.body.index);
  if (user && !isNaN(index) && index >= 0 && index < user.websites.length) {
    user.websites.splice(index, 1);
    saveDB(db);
  }
  res.redirect('/');
});

// ಲಾಗ್‌ಔಟ್
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});