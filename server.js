const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const Razorpay = require('razorpay');

const app = express();
const PORT = process.env.PORT || 10000;
const DB_FILE = path.join(__dirname, 'database.json');

// Razorpay ಸೆಟಪ್
const razorpay = new Razorpay({
    key_id: 'rzp_test_TsyKVhtJy6q6B5',
    key_secret: 'Gj2CQFelbQ7Fe4Tp9q0IcVZ6'
});

// ಡಿಫಾಲ್ಟ್ ಟೆಲಿಗ್ರಾಂ ಸೆಟ್ಟಿಂಗ್ಸ್
const DEFAULT_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

function sendTelegramAlert(chatId, message) {
    const targetChatId = chatId || DEFAULT_CHAT_ID;
    if (!DEFAULT_BOT_TOKEN || !targetChatId) return;
    const url = `https://api.telegram.org/bot${DEFAULT_BOT_TOKEN}/sendMessage?chat_id=${targetChatId}&text=${encodeURIComponent(message)}`;
    https.get(url, (res) => {}).on('error', (err) => console.error('Telegram Alert Error:', err));
}

// ಡೇಟಾಬೇಸ್ ನಿರ್ವಹಣೆ
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

function checkAuth(req, res, next) {
    if (req.session && req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

// 1. ಲ್ಯಾಂಡಿಂಗ್ ಪೇಜ್
app.get('/', (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('index');
});

// 2. ಲಾಗಿನ್ & ಸೈನ್ ಅಪ್
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
    const { name, email, telegramChatId, password, confirmPassword } = req.body;
    const db = readDB();

    if (password !== confirmPassword) {
        return res.render('signup', { error: 'ಪಾಸ್‌ವರ್ಡ್‌ಗಳು ಹೊಂದಿಕೆಯಾಗುತ್ತಿಲ್ಲ!' });
    }

    const existing = db.users.find(u => u.email === email);
    if (existing) {
        return res.render('signup', { error: 'ಈ ಇಮೇಲ್ ಈಗಾಗಲೇ ಬಳಕೆಯಲ್ಲಿದೆ!' });
    }

    const newUser = {
        name: name || 'User',
        email,
        password,
        telegramChatId: telegramChatId ? telegramChatId.trim() : '',
        plan: 'FREE'
    };

    db.users.push(newUser);
    writeDB(db);
    req.session.user = newUser;
    res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// 3. ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ರೂಟ್
app.get('/dashboard', checkAuth, (req, res) => {
    const db = readDB();
    const currentUser = db.users.find(u => u.email === req.session.user.email) || req.session.user;
    const userSites = db.websites.filter(s => s.userEmail === currentUser.email);
    res.render('dashboard', { user: currentUser, websites: userSites });
});

// 4. ಅಪ್‌ಗ್ರೇಡ್ ಪೇಜ್ ರೂಟ್
app.get('/upgrade', checkAuth, (req, res) => {
    const db = readDB();
    const currentUser = db.users.find(u => u.email === req.session.user.email) || req.session.user;
    res.render('upgrade', { user: currentUser });
});

// 5. Razorpay Order ID ರಚಿಸುವ ರೂಟ್ (Pro ಅಥವಾ Ultra Pro)
app.post('/create-order', checkAuth, async (req, res) => {
    try {
        const { planType } = req.body; // 'PRO' ಅಥವಾ 'ULTRA_PRO'
        let amount = 19900; // ಡಿಫಾಲ್ಟ್ PRO ₹199

        if (planType === 'ULTRA_PRO') {
            amount = 49900; // ULTRA PRO ₹499
        }

        const options = {
            amount: amount,
            currency: "INR",
            receipt: "order_rcpt_" + Date.now()
        };
        const order = await razorpay.orders.create(options);
        res.json({ orderId: order.id, amount: amount });
    } catch (error) {
        console.error("Order creation error:", error);
        res.status(500).json({ error: 'Order Creation Failed' });
    }
});

// 6. ಪಾವತಿ ಯಶಸ್ವಿಯಾದಾಗ ಅಪ್‌ಗ್ರೇಡ್ ಮಾಡುವ ರೂಟ್
app.post('/razorpay-success', checkAuth, (req, res) => {
    const { payment_id, order_id, planType } = req.body;
    const db = readDB();
    const currentUser = db.users.find(u => u.email === req.session.user.email);

    const targetPlan = (planType === 'ULTRA_PRO') ? 'ULTRA_PRO' : 'PRO';

    if (currentUser) {
        currentUser.plan = targetPlan;
        currentUser.paymentId = payment_id;
        writeDB(db);
        req.session.user.plan = targetPlan;

        sendTelegramAlert('', `🎉 Razorpay ಮೂಲಕ ಹೊಸ ಪಾವತಿ ಬಂದಿದೆ!\nಬಳಕೆದಾರ: ${currentUser.email}\nಪ್ಲಾನ್: ${targetPlan}\nPayment ID: ${payment_id}`);
    }

    res.json({ success: true, plan: targetPlan });
});

// 7. ವೆಬ್‌ಸೈಟ್ ಸೇರಿಸುವ ರೂಟ್ (ಮಿತಿ ಚೆಕ್)
app.post('/add-website', checkAuth, (req, res) => {
    const { url } = req.body;
    const db = readDB();
    const currentUser = db.users.find(u => u.email === req.session.user.email) || req.session.user;
    const userSites = db.websites.filter(s => s.userEmail === currentUser.email);

    let limit = 1; // FREE
    if (currentUser.plan === 'PRO') limit = 15;
    if (currentUser.plan === 'ULTRA_PRO') limit = 50;

    if (userSites.length >= limit) {
        let msg = `ಮಿತಿ ತಲುಪಿದೆ! ನಿಮ್ಮ ಪ್ಲಾನ್‌ನಲ್ಲಿ ಗರಿಷ್ಠ ${limit} ವೆಬ್‌ಸೈಟ್‌ಗಳನ್ನು ಮಾತ್ರ ಮಾನಿಟರ್ ಮಾಡಬಹುದು. ಹೆಚ್ಚಿನ ಮಿತಿಗಾಗಿ ಅಪ್‌ಗ್ರೇಡ್ ಮಾಡಿ.`;
        return res.send(`<script>alert('${msg}'); window.location.href='/upgrade';</script>`);
    }

    const newSite = {
        id: Date.now().toString(),
        userEmail: currentUser.email,
        url: url,
        status: 'Checking...',
        latency: 0,
        lastCheckedTime: 0,
        lastChecked: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    db.websites.push(newSite);
    writeDB(db);
    checkSingleSite(newSite);
    res.redirect('/dashboard');
});

// 8. ವೆಬ್‌ಸೈಟ್ ಡಿಲೀಟ್ ಮಾಡುವ ರೂಟ್
app.post('/delete-website/:id', checkAuth, (req, res) => {
    const db = readDB();
    db.websites = db.websites.filter(s => !(s.id === req.params.id && s.userEmail === req.session.user.email));
    writeDB(db);
    res.redirect('/dashboard');
});

// ಆಟೋಮ್ಯಾಟಿಕ್ ಮಾನಿಟರಿಂಗ್ ಇಂಜಿನ್
function checkSingleSite(site) {
    const startTime = Date.now();
    const client = site.url.startsWith('https') ? https : http;

    const request = client.get(site.url, (res) => {
        const latency = Date.now() - startTime;
        const newStatus = (res.statusCode >= 200 && res.statusCode < 400) ? 'UP' : 'DOWN';

        if (site.status !== 'Checking...' && site.status !== newStatus) {
            const db = readDB();
            const owner = db.users.find(u => u.email === site.userEmail);
            const userChatId = owner ? owner.telegramChatId : '';

            if (newStatus === 'DOWN') {
                sendTelegramAlert(userChatId, `🚨 ALERT: ನಿಮ್ಮ ವೆಬ್‌ಸೈಟ್ ಡೌನ್ ಆಗಿದೆ!\nURL: ${site.url}\nStatus: ${res.statusCode}`);
            } else if (newStatus === 'UP') {
                sendTelegramAlert(userChatId, `✅ RECOVERED: ನಿಮ್ಮ ವೆಬ್‌ಸೈಟ್ ಮತ್ತೆ ಆನ್‌ಲೈನ್ ಬಂದಿದೆ!\nURL: ${site.url}\nLatency: ${latency}ms`);
            }
        }

        const db = readDB();
        const target = db.websites.find(s => s.id === site.id);
        if (target) {
            target.status = newStatus;
            target.latency = latency;
            target.lastCheckedTime = Date.now();
            target.lastChecked = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            writeDB(db);
        }
    });

    request.on('error', () => {
        if (site.status !== 'DOWN') {
            const db = readDB();
            const owner = db.users.find(u => u.email === site.userEmail);
            const userChatId = owner ? owner.telegramChatId : '';
            sendTelegramAlert(userChatId, `🚨 ALERT: ನಿಮ್ಮ ವೆಬ್‌ಸೈಟ್ ತಲುಪಲು ಸಾಧ್ಯವಾಗುತ್ತಿಲ್ಲ (Unreachable)!\nURL: ${site.url}`);
        }
        const db = readDB();
        const target = db.websites.find(s => s.id === site.id);
        if (target) {
            target.status = 'DOWN';
            target.latency = 0;
            target.lastCheckedTime = Date.now();
            target.lastChecked = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            writeDB(db);
        }
    });

    request.setTimeout(5000, () => {
        request.destroy();
    });
}

// ಸ್ಮಾರ್ಟ್ ಮಾನಿಟರಿಂಗ್ ಲೂಪ್ (ಪ್ರತಿ 3 ಸೆಕೆಂಡಿಗೆ ರನ್ ಆಗಿ ಪ್ಲಾನ್ ಆಧಾರದಲ್ಲಿ ಫಿಲ್ಟರ್ ಮಾಡುತ್ತದೆ)
setInterval(() => {
    const db = readDB();
    const now = Date.now();

    db.websites.forEach(site => {
        const owner = db.users.find(u => u.email === site.userEmail);
        const plan = owner ? owner.plan : 'FREE';

        let intervalMs = 600000; // FREE: 10 ನಿಮಿಷ (600 ಸೆಕೆಂಡ್)
        if (plan === 'PRO') {
            intervalMs = 30000;  // PRO: 30 ಸೆಕೆಂಡ್
        } else if (plan === 'ULTRA_PRO') {
            intervalMs = 3000;   // ULTRA PRO: ಪ್ರತಿ 3 ಸೆಕೆಂಡಿಗೆ (Real-time)
        }

        const lastCheck = site.lastCheckedTime || 0;
        if (now - lastCheck >= intervalMs) {
            checkSingleSite(site);
        }
    });
}, 3000);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
