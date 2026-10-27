const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const twilio = require('twilio');

const app = express();
const PORT = process.env.PORT || 3000;

// Twilio WhatsApp ಸೆಟಪ್
const TWILIO_ACCOUNT_SID = 'AC05b9523622dc3a689dfed0662ff27582';
const TWILIO_AUTH_TOKEN = 'd4dbe15d686921e4d567d9148b5fe3a3';
const TWILIO_PHONE = 'whatsapp:+17372508034';
const ALERT_PHONE = '+918618957072';

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

function sendWhatsAppAlert(messageText) {
    twilioClient.messages.create({
        from: TWILIO_PHONE,
        to: `whatsapp:${ALERT_PHONE}`,
        body: messageText
    })
    .then(msg => console.log('WhatsApp Alert Sent! SID:', msg.sid))
    .catch(err => console.error('Twilio WhatsApp Error:', err.message));
}

// ಮಿಡಲ್‌ವೇರ್ ಸೆಟಪ್
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
    secret: 'uptime_secure_secret_2026',
    resave: false,
    saveUninitialized: false
}));

// ತಾತ್ಕಾಲಿಕ ಡೇಟಾ ಸಂಗ್ರಹ
let users = [];
let websites = [
    { id: 1, name: 'Google', url: 'https://www.google.com', status: 'UP', latency: 45, lastChecked: new Date() }
];

// ಲಾಗಿನ್ ದೃಢೀಕರಣ ಮಿಡಲ್‌ವೇರ್
function authMiddleware(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
}

// ವೆಬ್‌ಸೈಟ್ ಪರಿಶೀಲನಾ ಲಾಜಿಕ್
async function checkWebsites() {
    for (let site of websites) {
        const startTime = Date.now();
        try {
            const response = await axios.get(site.url, { timeout: 8000 });
            const latency = Date.now() - startTime;

            if (site.status === 'DOWN') {
                const recoveryMsg = `✅ *UPTIME MONITOR RECOVERED*\n\nನಿಮ್ಮ ಸೈಟ್ ಮತ್ತೆ ಆನ್‌ಲೈನ್ ಬಂದಿದೆ!\n🔗 URL: ${site.url}\n⚡ Latency: ${latency}ms\n⏰ Time: ${new Date().toLocaleTimeString()}`;
                sendWhatsAppAlert(recoveryMsg);
            }

            site.status = 'UP';
            site.latency = latency;
            site.lastChecked = new Date();
        } catch (error) {
            if (site.status === 'UP') {
                const alertMsg = `🚨 *UPTIME MONITOR ALERT*\n\nನಿಮ್ಮ ಸೈಟ್ ಡೌನ್ ಆಗಿದೆ!\n🔗 URL: ${site.url}\n⚠️ ಕಾರಣ: ${error.message}\n⏰ Time: ${new Date().toLocaleTimeString()}`;
                sendWhatsAppAlert(alertMsg);
            }

            site.status = 'DOWN';
            site.latency = 0;
            site.lastChecked = new Date();
        }
    }
}

// ಪ್ರತಿ 60 ಸೆಕೆಂಡಿಗೆ ಪರಿಶೀಲನೆ
setInterval(checkWebsites, 60000);

// --- ರೂಟ್ಸ್‌ (Routes) ---

// ಮುಖ್ಯ ಪುಟ (ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ಗೆ ರೀಡೈರೆಕ್ಟ್)
app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/dashboard');
    } else {
        res.redirect('/login');
    }
});

// ಲಾಗಿನ್ ಪೇಜ್
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email && u.password === password);
    if (user || (!users.length && email && password)) {
        req.session.user = { email: email };
        return res.redirect('/dashboard');
    }
    res.render('login', { error: 'ತಪ್ಪಾದ ಇಮೇಲ್ ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್' });
});

// ಸೈನ್-ಅಪ್ / ರಿಜಿಸ್ಟರ್ ಪೇಜ್
app.get('/register', (req, res) => {
    res.render('register', { error: null });
});

app.post('/register', (req, res) => {
    const { email, password } = req.body;
    if (email && password) {
        users.push({ email, password });
        req.session.user = { email };
        return res.redirect('/dashboard');
    }
    res.render('register', { error: 'ದಯವಿಟ್ಟು ಎಲ್ಲ ವಿವರಗಳನ್ನು ಭರ್ತಿ ಮಾಡಿ' });
});

// ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಪೇಜ್
app.get('/dashboard', authMiddleware, (req, res) => {
    res.render('dashboard', { sites: websites, user: req.session.user });
});

// ಹೊಸ ವೆಬ್‌ಸೈಟ್ ಸೇರಿಸುವುದು
app.post('/add-site', authMiddleware, (req, res) => {
    const { name, url } = req.body;
    if (name && url) {
        websites.push({
            id: Date.now(),
            name,
            url,
            status: 'CHECKING',
            latency: 0,
            lastChecked: new Date()
        });
        checkWebsites();
    }
    res.redirect('/dashboard');
});

// ವೆಬ್‌ಸೈಟ್ ಡಿಲೀಟ್ ಮಾಡುವುದು
app.post('/delete-site/:id', authMiddleware, (req, res) => {
    const id = parseInt(req.params.id);
    websites = websites.filter(site => site.id !== id);
    res.redirect('/dashboard');
});

// ಲಾಗ್‌ಔಟ್
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// ಸರ್ವರ್ ಆರಂಭ
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    checkWebsites();
});
