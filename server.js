const express = require('express');
const session = require('express-session');
const axios = require('axios');
const twilio = require('twilio');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Razorpay = require('razorpay');

const app = express();
const PORT = process.env.PORT || 3000;

// ================= 1. Razorpay ಪೇಮೆಂಟ್ ಗೇಟ್‌ವೇ ಸೆಟಪ್ =================
// (ಟೆಸ್ಟಿಂಗ್ ಕೀಗಳು - ನೇರವಾಗಿ UPI ಚೆಕ್‌ಔಟ್ ಕೆಲಸ ಮಾಡುತ್ತದೆ)
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_1DP5mmOlF5G5ag',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummySecretKey123'
});

// ================= 2. MongoDB Atlas ಕ್ಲೌಡ್ ಕನೆಕ್ಷನ್ =================
const MONGO_URI = "mongodb+srv://shreedharashreedhara29_db_user:OAGKBGBNu89s0mIU@cluster0.le5ffds.mongodb.net/uptime_saas?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
})
.then(() => console.log('✅ Enterprise MongoDB Atlas Connected!'))
.catch(err => console.error('⚠️ DB Notice:', err.message));

// ಯೂಸರ್ ಸ್ಕೀಮಾ (ಎನ್‌ಕ್ರಿಪ್ಟೆಡ್ ಪಾಸ್‌ವರ್ಡ್ ಸಹಿತ)
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, default: '+918618957072' },
    plan: { type: String, default: 'FREE' }, // FREE, PRO, ULTRA_PRO
    createdAt: { type: Date, default: Date.now }
});

// ವೆಬ್‌ಸೈಟ್ ಸ್ಕೀಮಾ (ಫೇಲ್ ಕೌಂಟ್ ಸಹಿತ ಡಬಲ್-ವೆರಿಫಿಕೇಶನ್‌ಗಾಗಿ)
const WebsiteSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    status: { type: String, default: 'CHECKING' },
    latency: { type: Number, default: 0 },
    failCount: { type: Number, default: 0 },
    lastCheckedTime: { type: Number, default: 0 },
    lastChecked: { type: String, default: 'Just now' },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Website = mongoose.model('Website', WebsiteSchema);

// ಇನ್-ಮೆಮೊರಿ ಫಾಲ್‌ಬ್ಯಾಕ್ ಡೇಟಾ
let memoryUsers = [
    { email: 'shreedharashreedhara29@gmail.com', password: '$2a$10$wT8mQ3xYy87sXwZ8jB9QveG1Z9z1z1z1z1z1z1z1z1z1z1z1z1z1', phone: '+918618957072', plan: 'ULTRA_PRO' }
];
let memoryWebsites = [
    { id: '1', userId: 'shreedharashreedhara29@gmail.com', name: 'Google Server', url: 'https://www.google.com', status: 'UP', latency: 45, failCount: 0, lastCheckedTime: 0, lastChecked: new Date().toLocaleTimeString() }
];

// ================= 3. Twilio WhatsApp ಅಲರ್ಟ್ =================
const TWILIO_ACCOUNT_SID = 'AC05b9523622dc3a689dfed0662ff27582';
const TWILIO_AUTH_TOKEN = 'd4dbe15d686921e4d567d9148b5fe3a3';
const TWILIO_PHONE = 'whatsapp:+17372508034';

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

function sendUserWhatsAppAlert(targetPhone, messageText) {
    if (!targetPhone) return;
    twilioClient.messages.create({
        from: TWILIO_PHONE,
        to: `whatsapp:${targetPhone}`,
        body: messageText
    })
    .then(msg => console.log(`Alert sent to ${targetPhone}, SID: ${msg.sid}`))
    .catch(err => console.error('Twilio Error:', err.message));
}

// ================= 4. ಮಿಡಲ್‌ವೇರ್ =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'uptime_saas_ultra_secure_pro_2026',
    resave: false,
    saveUninitialized: false
}));

// ================= 5. ಡಬಲ್-ವೆರಿಫಿಕೇಶನ್ ಹೈ-ಆಕ್ಯುರೆಸಿ ಮಾನಿಟರಿಂಗ್ ಎಂಜಿನ್ =================
async function checkWebsiteAccuracy(site, userPhone) {
    const startTime = Date.now();
    try {
        await axios.get(site.url, { timeout: 4000 });
        const latency = Date.now() - startTime;

        if (site.status === 'DOWN') {
            const recoveryMsg = `✅ *UPTIME RECOVERED*\n\nವೆಬ್‌ಸೈಟ್ ಮರಳಿ ಚಾಲನೆಗೊಂಡಿದೆ!\n🔗 URL: ${site.url}\n⚡ ಲೇಟೆನ್ಸಿ: ${latency}ms\n⏰ ಸಮಯ: ${new Date().toLocaleTimeString()}`;
            sendUserWhatsAppAlert(userPhone, recoveryMsg);
        }

        site.status = 'UP';
        site.latency = latency;
        site.failCount = 0; // ಯಶಸ್ವಿಯಾದಾಗ ಫೇಲ್ ಕೌಂಟ್ 0 ಆಗುತ್ತದೆ
        site.lastCheckedTime = Date.now();
        site.lastChecked = new Date().toLocaleTimeString();
        if (site.save) await site.save();
    } catch (error) {
        site.failCount = (site.failCount || 0) + 1;

        // ಸುಳ್ಳು ಅಲರ್ಟ್ ತಡೆಯುವ ನಿಯಮ: ಸತತ 2 ಬಾರಿ ಫೇಲ್ ಆದರೆ ಮಾತ್ರ DOWN ಮತ್ತು WhatsApp ಅಲರ್ಟ್!
        if (site.failCount >= 2) {
            if (site.status === 'UP' || site.status === 'CHECKING') {
                const alertMsg = `🚨 *UPTIME ALERT: SITE DOWN!*\n\nನಿಮ್ಮ ಸೈಟ್ ಡೌನ್ ಆಗಿದೆ (ಖಚಿತಪಡಿಸಲಾಗಿದೆ)!\n🔗 URL: ${site.url}\n⚠️ ಕಾರಣ: ${error.message}\n⏰ ಸಮಯ: ${new Date().toLocaleTimeString()}`;
                sendUserWhatsAppAlert(userPhone, alertMsg);
            }
            site.status = 'DOWN';
            site.latency = 0;
        } else {
            console.log(`⚠️ First failure detected for ${site.url}. Double checking next cycle...`);
        }

        site.lastCheckedTime = Date.now();
        site.lastChecked = new Date().toLocaleTimeString();
        if (site.save) await site.save();
    }
}

async function runEngine() {
    try {
        let sites = [];
        let userDetails = {};

        if (mongoose.connection.readyState === 1) {
            sites = await Website.find();
            const users = await User.find();
            users.forEach(u => {
                userDetails[u.email] = { plan: u.plan, phone: u.phone };
            });
        } else {
            sites = memoryWebsites;
            memoryUsers.forEach(u => {
                userDetails[u.email] = { plan: u.plan, phone: u.phone };
            });
        }

        const now = Date.now();

        for (let site of sites) {
            const user = userDetails[site.userId] || { plan: 'FREE', phone: '+918618957072' };
            
            // ಪ್ಲಾನ್ ಆಧಾರಿತ ತಪಾಸಣಾ ಸಮಯ:
            // ULTRA_PRO = 3 ರಿಂದ 5 ಸೆಕೆಂಡ್ (3,000ms)
            // PRO = 30 ಸೆಕೆಂಡ್ (30,000ms)
            // FREE = 10 ನಿಮಿಷ (600,000ms)
            let checkInterval = 600000;
            if (user.plan === 'ULTRA_PRO') checkInterval = 3000;
            else if (user.plan === 'PRO') checkInterval = 30000;

            const timeSinceLastCheck = now - (site.lastCheckedTime || 0);

            if (timeSinceLastCheck >= checkInterval) {
                checkWebsiteAccuracy(site, user.phone);
            }
        }
    } catch (err) {
        console.error('Engine Loop Error:', err.message);
    }
}
setInterval(runEngine, 3000);

// ================= 6. 24/7 Keep-Alive ಸರ್ವರ್ ಪಿಂಗ್ (Render ಸ್ಲೀಪ್ ತಡೆಗಟ್ಟಲು) =================
setInterval(() => {
    // ಸರ್ವರ್ ತಾನೇ ತನ್ನನ್ನು ಪಿಂಗ್ ಮಾಡಿಕೊಂಡು ಎಚ್ಚರವಾಗಿರಿಸುತ್ತದೆ
    axios.get(`http://localhost:${PORT}/ping`).catch(() => {});
}, 600000); // ಪ್ರತಿ 10 ನಿಮಿಷಕ್ಕೊಮ್ಮೆ

app.get('/ping', (req, res) => res.send('PONG - 24/7 ACTIVE'));

// ಆಥ್ ಗಾರ್ಡ್
function requireAuth(req, res, next) {
    if (req.session && req.session.userEmail) return next();
    res.redirect('/login');
}

// ================= 7. ರೂಟ್‌ಗಳು (Routes) =================

app.get('/', (req, res) => {
    if (req.session && req.session.userEmail) return res.redirect('/dashboard');
    res.redirect('/login');
});

// ಲಾಗಿನ್ ಪೇಜ್
app.get('/login', (req, res) => {
    const errorMsg = req.query.error ? `<div style="background: rgba(239,68,68,0.15); border: 1px solid #ef4444; color: #f87171; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 18px;">${req.query.error}</div>` : '';
    const successMsg = req.query.success ? `<div style="background: rgba(34,197,94,0.15); border: 1px solid #22c55e; color: #4ade80; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 18px;">${req.query.success}</div>` : '';

    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Login | Uptime SaaS Pro</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            * { box-sizing: border-box; }
            body { margin: 0; background: #070a13; font-family: 'Plus Jakarta Sans', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; color: #fff; }
            .card { background: #0f172a; padding: 40px; border-radius: 20px; border: 1px solid #1e293b; width: 400px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
            h2 { margin: 0 0 8px; font-size: 24px; background: linear-gradient(135deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            p { color: #94a3b8; font-size: 14px; margin-bottom: 20px; }
            input { width: 100%; padding: 14px 16px; margin-bottom: 16px; background: #1e293b; border: 1px solid #334155; border-radius: 10px; color: #fff; outline: none; }
            button { width: 100%; padding: 14px; background: linear-gradient(135deg, #0284c7, #6366f1); color: #fff; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; }
            .extra-links { display: flex; justify-content: space-between; margin-top: 18px; font-size: 13px; }
            .extra-links a { color: #38bdf8; text-decoration: none; font-weight: 600; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>⚡ Uptime SaaS Pro</h2>
            <p>ಕ್ಲೌಡ್ ಡೇಟಾಬೇಸ್ ಸಂರಕ್ಷಿತ ಲಾಗಿನ್</p>
            ${errorMsg}
            ${successMsg}
            <form action="/login" method="POST">
                <input type="email" name="email" placeholder="ಇಮೇಲ್ ವಿಳಾಸ" required>
                <input type="password" name="password" placeholder="ಪಾಸ್‌ವರ್ಡ್" required>
                <button type="submit">ಲಾಗಿನ್ ಆಗಿ (Sign In)</button>
            </form>
            <div class="extra-links">
                <a href="/forgot-password">ಪಾಸ್‌ವರ್ಡ್ ಮರೆತಿರಾ?</a>
                <a href="/register">ಹೊಸ ಖಾತೆ ರಚಿಸಿ</a>
            </div>
        </div>
    </body>
    </html>
    `);
});

// ಸೈನ್-ಅಪ್ (Bcrypt ಪಾಸ್‌ವರ್ಡ್ ಎನ್‌ಕ್ರಿಪ್ಶನ್ ಸಹಿತ)
app.get('/register', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Register | Uptime SaaS Pro</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            * { box-sizing: border-box; }
            body { margin: 0; background: #070a13; font-family: 'Plus Jakarta Sans', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; color: #fff; }
            .card { background: #0f172a; padding: 40px; border-radius: 20px; border: 1px solid #1e293b; width: 400px; }
            h2 { margin: 0 0 8px; font-size: 24px; color: #38bdf8; }
            p { color: #94a3b8; font-size: 14px; margin-bottom: 20px; }
            input { width: 100%; padding: 14px 16px; margin-bottom: 16px; background: #1e293b; border: 1px solid #334155; border-radius: 10px; color: #fff; outline: none; }
            button { width: 100%; padding: 14px; background: linear-gradient(135deg, #0284c7, #6366f1); color: #fff; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; }
            .extra-links { text-align: center; margin-top: 18px; font-size: 13px; color: #94a3b8; }
            .extra-links a { color: #38bdf8; text-decoration: none; font-weight: 600; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>ಹೊಸ ಖಾತೆ ರಚಿಸಿ</h2>
            <p>ಪಾಸ್‌ವರ್ಡ್ ಎನ್‌ಕ್ರಿಪ್ಟ್ ಆದ ಉಚಿತ ನೋಂದಣಿ</p>
            <form action="/register" method="POST">
                <input type="email" name="email" placeholder="ಇಮೇಲ್ ವಿಳಾಸ" required>
                <input type="password" name="password" placeholder="ಪಾಸ್‌ವರ್ಡ್" required>
                <input type="text" name="phone" placeholder="WhatsApp ನಂಬರ್ (+91...)" value="+91" required>
                <button type="submit">ಖಾತೆ ರಚಿಸಿ (Register Free)</button>
            </form>
            <div class="extra-links">
                ಖಾತೆ ಹೊಂದಿದ್ದೀರಾ? <a href="/login">ಲಾಗಿನ್ ಆಗಿ</a>
            </div>
        </div>
    </body>
    </html>
    `);
});

app.post('/register', async (req, res) => {
    const { email, password, phone } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        if (mongoose.connection.readyState === 1) {
            const existing = await User.findOne({ email });
            if (existing) return res.redirect('/login?error=ಈ ಇಮೇಲ್ ಈಗಾಗಲೇ ನೋಂದಾಯಿತವಾಗಿದೆ! ಲಾಗಿನ್ ಆಗಿ.');
            await User.create({ email, password: hashedPassword, phone, plan: 'FREE' });
        } else {
            const existing = memoryUsers.find(u => u.email === email);
            if (existing) return res.redirect('/login?error=ಈ ಇಮೇಲ್ ಈಗಾಗಲೇ ಬಳಕೆಯಲ್ಲಿದೆ.');
            memoryUsers.push({ email, password: hashedPassword, phone, plan: 'FREE' });
        }
        res.redirect('/login?success=ಖಾತೆ ಯಶಸ್ವಿಯಾಗಿ ರಚನೆಯಾಗಿದೆ! ಈಗ ಲಾಗಿನ್ ಆಗಿ.');
    } catch (e) {
        res.redirect('/login?error=ನೋಂದಣಿಯಲ್ಲಿ ದೋಷ ಸಂಭವಿಸಿದೆ.');
    }
});

// ಲಾಗಿನ್ ಪರಿಶೀಲನೆ (Bcrypt Verify)
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    let user = null;

    if (mongoose.connection.readyState === 1) {
        user = await User.findOne({ email });
        // ಅಡ್ಮಿನ್ ಖಾತೆ ಇದ್ದರೆ Ultra Pro ಆಟೋ-ಸೆಟಪ್
        if (email === 'shreedharashreedhara29@gmail.com' && !user) {
            const hashed = await bcrypt.hash(password, 10);
            user = await User.create({ email, password: hashed, phone: '+918618957072', plan: 'ULTRA_PRO' });
        }
    } else {
        user = memoryUsers.find(u => u.email === email);
    }

    if (!user) {
        return res.redirect('/login?error=ಈ ಇಮೇಲ್ ವಿಳಾಸದ ಖಾತೆ ಕಂಡುಬಂದಿಲ್ಲ. ದಯವಿಟ್ಟು ನೋಂದಾಯಿಸಿ.');
    }

    // ಹಳೆಯ ಪಾಸ್‌ವರ್ಡ್ ನೇರವಾಗಿದ್ದರೆ ಅಥವಾ bcrypt ಆಗಿದ್ದರೆ ಎರಡನ್ನೂ ಸುರಕ್ಷಿತವಾಗಿ ಹೋಲಿಸುತ್ತದೆ
    let isMatch = false;
    if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
        isMatch = await bcrypt.compare(password, user.password);
    } else {
        isMatch = (user.password === password);
    }

    if (!isMatch) {
        return res.redirect('/login?error=ತಪ್ಪಾದ ಪಾಸ್‌ವರ್ಡ್! ಸರಿಯಾದ ಪಾಸ್‌ವರ್ಡ್ ಹಾಕಿ ಅಥವಾ Forgot Password ಬಳಸಿ.');
    }

    req.session.userEmail = user.email;
    req.session.userPlan = user.plan;
    req.session.userPhone = user.phone;
    res.redirect('/dashboard');
});

// Forgot Password
app.get('/forgot-password', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Reset Password | Uptime SaaS Pro</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            * { box-sizing: border-box; }
            body { margin: 0; background: #070a13; font-family: 'Plus Jakarta Sans', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; color: #fff; }
            .card { background: #0f172a; padding: 40px; border-radius: 20px; border: 1px solid #1e293b; width: 400px; }
            h2 { margin: 0 0 8px; font-size: 24px; color: #38bdf8; }
            p { color: #94a3b8; font-size: 14px; margin-bottom: 20px; }
            input { width: 100%; padding: 14px 16px; margin-bottom: 16px; background: #1e293b; border: 1px solid #334155; border-radius: 10px; color: #fff; outline: none; }
            button { width: 100%; padding: 14px; background: linear-gradient(135deg, #0284c7, #6366f1); color: #fff; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; }
            .extra-links { text-align: center; margin-top: 18px; font-size: 13px; }
            .extra-links a { color: #38bdf8; text-decoration: none; font-weight: 600; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>ಪಾಸ್‌ವರ್ಡ್ ರೀಸೆಟ್</h2>
            <p>ನಿಮ್ಮ ಖಾತೆಗೆ ಹೊಸ ಪಾಸ್‌ವರ್ಡ್ ಸೆಟ್ ಮಾಡಿ</p>
            <form action="/forgot-password" method="POST">
                <input type="email" name="email" placeholder="ನೋಂದಾಯಿತ ಇಮೇಲ್" required>
                <input type="password" name="newPassword" placeholder="ಹೊಸ ಪಾಸ್‌ವರ್ಡ್" required>
                <button type="submit">ಹೊಸ ಪಾಸ್‌ವರ್ಡ್ ನವೀಕರಿಸಿ</button>
            </form>
            <div class="extra-links">
                <a href="/login">ಲಾಗಿನ್ ಪುಟಕ್ಕೆ ಹಿಂತಿರುಗಿ</a>
            </div>
        </div>
    </body>
    </html>
    `);
});

app.post('/forgot-password', async (req, res) => {
    const { email, newPassword } = req.body;
    try {
        const hashed = await bcrypt.hash(newPassword, 10);
        let updated = false;

        if (mongoose.connection.readyState === 1) {
            const user = await User.findOne({ email });
            if (user) {
                user.password = hashed;
                await user.save();
                updated = true;
                sendUserWhatsAppAlert(user.phone, `🔐 *Uptime SaaS Alert:*\nನಿಮ್ಮ ಖಾತೆಯ ಪಾಸ್‌ವರ್ಡ್ ಅನ್ನು ಯಶಸ್ವಿಯಾಗಿ ಬದಲಾಯಿಸಲಾಗಿದೆ!`);
            }
        } else {
            const user = memoryUsers.find(u => u.email === email);
            if (user) {
                user.password = hashed;
                updated = true;
            }
        }

        if (updated) {
            res.redirect('/login?success=ಹೊಸ ಪಾಸ್‌ವರ್ಡ್ ಯಶಸ್ವಿಯಾಗಿ ಅಪ್‌ಡೇಟ್ ಆಗಿದೆ! ಈಗ ಲಾಗಿನ್ ಆಗಿ.');
        } else {
            res.redirect('/login?error=ಈ ಇಮೇಲ್ ವಿಳಾಸದ ಖಾತೆ ಕಂಡುಬಂದಿಲ್ಲ.');
        }
    } catch (e) {
        res.redirect('/login?error=ಪಾಸ್‌ವರ್ಡ್ ಮರುಹೊಂದಿಸುವಲ್ಲಿ ದೋಷ ಉಂಟಾಗಿದೆ.');
    }
});

// ================= 8. Pricing & Razorpay UPI ಚೆಕ್‌ಔಟ್ =================
app.get('/pricing', requireAuth, (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Upgrade Plans | Razorpay UPI</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
        <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
        <style>
            * { box-sizing: border-box; }
            body { margin: 0; background: #070a13; font-family: 'Plus Jakarta Sans', sans-serif; color: #fff; padding: 40px 20px; }
            .container { max-width: 1050px; margin: 0 auto; text-align: center; }
            h1 { font-size: 32px; margin-bottom: 8px; background: linear-gradient(135deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            p { color: #94a3b8; font-size: 15px; margin-bottom: 40px; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; text-align: left; }
            .plan-card { background: #0f172a; border-radius: 20px; border: 1px solid #1e293b; padding: 32px; display: flex; flex-direction: column; justify-content: space-between; }
            .plan-card.featured { border-color: #8b5cf6; box-shadow: 0 0 30px rgba(139, 92, 246, 0.2); }
            .plan-card h3 { margin: 0 0 10px; font-size: 20px; }
            .price { font-size: 32px; font-weight: 800; margin: 15px 0 20px; }
            .price span { font-size: 14px; font-weight: 400; color: #94a3b8; }
            ul { list-style: none; padding: 0; margin: 0 0 30px; font-size: 14px; color: #cbd5e1; }
            ul li { margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
            button { width: 100%; padding: 14px; border-radius: 10px; font-weight: 700; cursor: pointer; border: none; font-size: 14px; }
            .btn-free { background: #1e293b; color: #94a3b8; cursor: not-allowed; }
            .btn-pro { background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; }
            .btn-ultra { background: linear-gradient(135deg, #ec4899, #8b5cf6); color: #fff; }
           
