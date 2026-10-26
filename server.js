const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 10000;
const DB_FILE = path.join(__dirname, 'database.json');

// --- ಟೆಲಿಗ್ರಾಂ ಅಲರ್ಟ್ ಸೆಟ್ಟಿಂಗ್ಸ್ (ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಕೆಳಗೆ ಹಾಕಿ) ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''; 
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

function sendTelegramAlert(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(message)}`;
    https.get(url, (res) => {}).on('error', (err) => console.error('Telegram Alert Error:', err.message));
}

// ಡಾಟಾಬೇಸ್ ನಿರ್ವಹಣೆ
function readDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            const initData = { users: [], websites: [] };
            fs.writeFileSync(DB_FILE, JSON.stringify(initData, null, 2));
            return initData;
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed.websites)) parsed.websites = [];
        if (!Array.isArray(parsed.users)) parsed.users = [];
        return parsed;
    } catch (e) {
        return { users: [], websites: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ಮಿಡಲ್‌ವೇರ್ ಸೆಟಪ್
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: 'uptime_saas_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// ದೃಢೀಕರಣ ಚೆಕ್
function checkAuth(req, res, next) {
    if (req.session && req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

// 1. ಲ್ಯಾಂಡಿಂಗ್ ಪೇಜ್ (ಮುಖಪುಟ)
app.get('/', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('index');
});

// 2. ಲಾಗಿನ್ & ಸೈನ್ ಅಪ್ ರೌಟ್‌ಗಳು
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.email === email && u.password === password);
    if (user) {
        req.session.user = user;
        res.redirect('/dashboard');
    } else {
        res.render('login', { error: 'ಇಮೇಲ್ ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್ ತಪ್ಪಾಗಿದೆ!' });
    }
});

app.get('/signup', (req, res) => {
    res.render('signup', { error: null });
});

app.post('/signup', (req, res) => {
    const { email, password } = req.body;
    const db = readDB();
    const existing = db.users.find(u => u.email === email);
    if (existing) {
        return res.render('signup', { error: 'ಈ ಇಮೇಲ್ ಈಗಾಗಲೇ ಬಳಕೆಯಲ್ಲಿದೆ!' });
    }
    const newUser = { email, password, plan: 'FREE' };
    db.users.push(newUser);
    writeDB(db);
    req.session.user = newUser;
    res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// 3. ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ರೌಟ್
app.get('/dashboard', checkAuth, (req, res) => {
    const db = readDB();
    const currentUser = db.users.find(u => u.email === req.session.user.email) || req.session.user;
    const userSites = db.websites.filter(s => s.userEmail === currentUser.email);
    res.render('dashboard', { user: currentUser, websites: userSites });
});

// 4. ವೆಬ್‌ಸೈಟ್ ಸೇರಿಸುವ ರೌಟ್ (ಫ್ರೀಮಿಯಮ್ ಮಿತಿ ಪರಿಶೀಲನೆ)
app.post('/add-website', checkAuth, (req, res) => {
    const { url } = req.body;
    const db = readDB();
    const currentUser = db.users.find(u => u.email === req.session.user.email) || req.session.user;
    const userSites = db.websites.filter(s => s.userEmail === currentUser.email);

    const limit = (currentUser.plan === 'PRO') ? 15 : 1;
    if (userSites.length >= limit) {
        return res.send(`
            <script>
                alert('⚠️ ಮಿತಿ ತಲುಪಿದೆ! ಉಚಿತ ಖಾತೆಯಲ್ಲಿ ಕೇವಲ 1 ವೆಬ್‌ಸೈಟ್ ಮಾತ್ರ ಸಾಧ್ಯ. Pro ಪ್ಲಾನ್‌ಗೆ ಅಪ್‌ಗ್ರೇಡ್ ಮಾಡಿ.');
                window.location.href = '/dashboard';
            </script>
        `);
    }

    const newSite = {
        id: Date.now().toString(),
        userEmail: currentUser.email,
        url: url,
        status: 'Checking...',
        latency: 0,
        lastChecked: new Date().toLocaleTimeString()
    };

    db.websites.push(newSite);
    writeDB(db);
    res.redirect('/dashboard');
});

// 5. ವೆಬ್‌ಸೈಟ್ ಡಿಲೀಟ್ ಮಾಡುವ ರೌಟ್
app.post('/delete-website/:id', checkAuth, (req, res) => {
    const db = readDB();
    db.websites = db.websites.filter(s => !(s.id === req.params.id && s.userEmail === req.session.user.email));
    writeDB(db);
    res.redirect('/dashboard');
});

// --- ಆಟೋಮ್ಯಾಟಿಕ್ ಮಾನಿಟರಿಂಗ್ ಮತ್ತು ಅಲರ್ಟ್ ಇಂಜಿನ್ ---
function checkSingleSite(site) {
    const startTime = Date.now();
    const client = site.url.startsWith('https') ? https : http;

    const request = client.get(site.url, (res) => {
        const latency = Date.now() - startTime;
        const newStatus = (res.statusCode >= 200 && res.statusCode < 400) ? 'UP' : 'DOWN';
        
        // ಸ್ಟೇಟಸ್ ಬದಲಾದಾಗ ಟೆಲಿಗ್ರಾಂ ಅಲರ್ಟ್
        if (site.status !== 'Checking...' && site.status !== newStatus) {
            if (newStatus === 'DOWN') {
                sendTelegramAlert(`🚨 ALERT: ನಿಮ್ಮ ವೆಬ್‌ಸೈಟ್ ಡೌನ್ ಆಗಿದೆ!\nURL: ${site.url}\nStatus: ${res.statusCode}\nTime: ${new Date().toLocaleTimeString()}`);
            } else if (newStatus === 'UP') {
                sendTelegramAlert(`✅ RECOVERED: ನಿಮ್ಮ ವೆಬ್‌ಸೈಟ್ ಮತ್ತೆ ಆನ್‌ಲೈನ್ ಬಂದಿದೆ!\nURL: ${site.url}\nLatency: ${latency}ms`);
            }
        }

        site.status = newStatus;
        site.latency = latency;
        site.lastChecked = new Date().toLocaleTimeString();
    });

    request.on('error', () => {
        if (site.status !== 'DOWN') {
            sendTelegramAlert(`🚨 ALERT: ನಿಮ್ಮ ವೆಬ್‌ಸೈಟ್ ಲಭ್ಯವಿಲ್ಲ (Unreachable)!\nURL: ${site.url}\nTime: ${new Date().toLocaleTimeString()}`);
        }
        site.status = 'DOWN';
        site.latency = 0;
        site.lastChecked = new Date().toLocaleTimeString();
    });

    request.setTimeout(5000, () => {
        request.destroy();
    });
}

// ಪ್ರತಿ 30 ಸೆಕೆಂಡಿಗೆ ರನ್ ಆಗಿ Pro ಮತ್ತು Free ಬಳಕೆದಾರರನ್ನು ಪರಿಶೀಲಿಸುವ ಲೂಪ್
let tickCounter = 0;
setInterval(() => {
    const db = readDB();
    tickCounter++;

    db.websites.forEach(site => {
        const owner = db.users.find(u => u.email === site.userEmail);
        const isPro = owner && owner.plan === 'PRO';

        // Pro ಬಳಕೆದಾರರಿಗೆ ಪ್ರತಿ 30 ಸೆಕೆಂಡಿಗೆ ಚೆಕ್
        if (isPro) {
            checkSingleSite(site);
        } 
        // Free ಬಳಕೆದಾರರಿಗೆ ಪ್ರತಿ 10 ನಿಮಿಷಕ್ಕೆ (20 ticks x 30s = 600s = 10 mins) ಚೆಕ್
        else if (tickCounter % 20 === 0) {
            checkSingleSite(site);
        }
    });

    writeDB(db);
}, 30000);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
