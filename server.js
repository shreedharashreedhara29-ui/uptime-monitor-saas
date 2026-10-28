const express = require('express');
const session = require('express-session');
const axios = require('axios');
const twilio = require('twilio');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// ================= 1. MongoDB Atlas ಕ್ಲೌಡ್ ಕನೆಕ್ಷನ್ =================
const MONGO_URI = "mongodb+srv://shreedharashreedhara29_db_user:OAGKBGBNu89s0mIU@cluster0.le5ffds.mongodb.net/uptime_saas?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
})
.then(() => console.log('✅ Enterprise MongoDB Atlas Connected!'))
.catch(err => console.error('⚠️ DB Notice:', err.message));

// ಗ್ರಾಹಕರ ಸ್ಕೀಮಾ (ಪ್ರತಿಯೊಬ್ಬರ ಪ್ಲಾನ್ ಮತ್ತು ಫೋನ್ ನಂಬರ್)
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, default: '+918618957072' }, // ಪ್ರತಿ ಯೂಸರ್‌ನ ಸ್ವಂತ WhatsApp ನಂಬರ್
    plan: { type: String, default: 'FREE' }, // FREE, PRO, ULTRA_PRO
    createdAt: { type: Date, default: Date.now }
});

// ವೆಬ್‌ಸೈಟ್ ಸ್ಕೀಮಾ (ಯೂಸರ್ ಐಡಿಗೆ ಲಿಂಕ್ ಆಗಿರುತ್ತದೆ)
const WebsiteSchema = new mongoose.Schema({
    userId: { type: String, required: true }, // ಗ್ರಾಹಕರ ಇಮೇಲ್
    name: { type: String, required: true },
    url: { type: String, required: true },
    status: { type: String, default: 'CHECKING' },
    latency: { type: Number, default: 0 },
    lastCheckedTime: { type: Number, default: 0 },
    lastChecked: { type: String, default: 'Just now' },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Website = mongoose.model('Website', WebsiteSchema);

// ಇನ್-ಮೆಮೊರಿ ಫಾಲ್‌ಬ್ಯಾಕ್ (ಸರ್ವರ್ ಸುರಕ್ಷತೆಗೆ)
let memoryUsers = [
    { email: 'shreedharashreedhara29@gmail.com', password: 'admin', phone: '+918618957072', plan: 'ULTRA_PRO' }
];
let memoryWebsites = [
    { id: '1', userId: 'shreedharashreedhara29@gmail.com', name: 'Google Server', url: 'https://www.google.com', status: 'UP', latency: 45, lastCheckedTime: 0, lastChecked: new Date().toLocaleTimeString() }
];

// ================= 2. Twilio WhatsApp ಅಲರ್ಟ್ ಸಿಸ್ಟಮ್ =================
const TWILIO_ACCOUNT_SID = 'AC05b9523622dc3a689dfed0662ff27582';
const TWILIO_AUTH_TOKEN = 'd4dbe15d686921e4d567d9148b5fe3a3';
const TWILIO_PHONE = 'whatsapp:+17372508034';

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// ನಿರ್ದಿಷ್ಟ ಗ್ರಾಹಕರ ಮೊಬೈಲ್‌ಗೆ ಮಾತ್ರ ಅಲರ್ಟ್ ಕಳುಹಿಸುವ ಫಂಕ್ಷನ್
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

// ================= 3. ಮಿಡಲ್‌ವೇರ್ =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'uptime_saas_multiuser_secure_2026',
    resave: false,
    saveUninitialized: false
}));

// ================= 4. ಹೈ-ಆಕ್ಯುರೆಸಿ ಮಲ್ಟಿ-ಯೂಸರ್ ಮಾನಿಟರಿಂಗ್ ಎಂಜಿನ್ =================
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
        site.lastCheckedTime = Date.now();
        site.lastChecked = new Date().toLocaleTimeString();
        if (site.save) await site.save();
    } catch (error) {
        if (site.status === 'UP' || site.status === 'CHECKING') {
            const alertMsg = `🚨 *UPTIME ALERT: SITE DOWN!*\n\nನಿಮ್ಮ ಸೈಟ್ ಡೌನ್ ಆಗಿದೆ!\n🔗 URL: ${site.url}\n⚠️ ಕಾರಣ: ${error.message}\n⏰ ಸಮಯ: ${new Date().toLocaleTimeString()}`;
            sendUserWhatsAppAlert(userPhone, alertMsg);
        }

        site.status = 'DOWN';
        site.latency = 0;
        site.lastCheckedTime = Date.now();
        site.lastChecked = new Date().toLocaleTimeString();
        if (site.save) await site.save();
    }
}

// ಪ್ರತಿಯೊಬ್ಬ ಗ್ರಾಹಕರ ಪ್ಲಾನ್ ಪರಿಶೀಲಿಸಿ ನಿಖರ ಸಮಯದಲ್ಲಿ ರನ್ ಆಗುವ ಎಂಜಿನ್
async function runEngine() {
    try {
        let sites = [];
        let userDetails = {}; // email -> { plan, phone }

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
            
            // ನಿಖರ ತಪಾಸಣಾ ಸಮಯ:
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

// ಸರ್ವರ್ ನಿರಂತರವಾಗಿ ಪ್ರತಿ 3 ಸೆಕೆಂಡಿಗೆ ನಿಖರತೆ ಪರಿಶೀಲಿಸುತ್ತದೆ
setInterval(runEngine, 3000);

// ಆಥ್ ಗಾರ್ಡ್
function requireAuth(req, res, next) {
    if (req.session && req.session.userEmail) return next();
    res.redirect('/login');
}

// ================= 5. ರೂಟ್‌ಗಳು (Routes) =================

app.get('/', (req, res) => {
    if (req.session && req.session.userEmail) return res.redirect('/dashboard');
    res.redirect('/login');
});

// ಲಾಗಿನ್ ಪೇಜ್
app.get('/login', (req, res) => {
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
            p { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
            input { width: 100%; padding: 14px 16px; margin-bottom: 16px; background: #1e293b; border: 1px solid #334155; border-radius: 10px; color: #fff; outline: none; }
            button { width: 100%; padding: 14px; background: linear-gradient(135deg, #0284c7, #6366f1); color: #fff; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; }
            .links { margin-top: 18px; text-align: center; font-size: 13px; color: #94a3b8; }
            .links a { color: #38bdf8; text-decoration: none; font-weight: 600; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>⚡ Uptime SaaS Pro</h2>
            <p>ಡೇಟಾಬೇಸ್ ಸಂರಕ್ಷಿತ ಲಾಗಿನ್</p>
            <form action="/login" method="POST">
                <input type="email" name="email" placeholder="ಇಮೇಲ್ ವಿಳಾಸ" required>
                <input type="password" name="password" placeholder="ಪಾಸ್‌ವರ್ಡ್" required>
                <button type="submit">ಲಾಗಿನ್ ಆಗಿ (Sign In)</button>
            </form>
            <div class="links">
                ಹೊಸ ಗ್ರಾಹಕರೇ? <a href="/register">ಹೊಸ ಖಾತೆ ರಚಿಸಿ</a>
            </div>
        </div>
    </body>
    </html>
    `);
});

// ಸೈನ್ ಅಪ್ ಪೇಜ್ (ಹೊಸ ಗ್ರಾಹಕರು ತಮ್ಮ ನಂಬರ್ ಹಾಕಿ ರಿಜಿಸ್ಟರ್ ಮಾಡಲು)
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
            p { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
            input { width: 100%; padding: 14px 16px; margin-bottom: 16px; background: #1e293b; border: 1px solid #334155; border-radius: 10px; color: #fff; outline: none; }
            button { width: 100%; padding: 14px; background: linear-gradient(135deg, #0284c7, #6366f1); color: #fff; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; }
            .links { margin-top: 18px; text-align: center; font-size: 13px; color: #94a3b8; }
            .links a { color: #38bdf8; text-decoration: none; font-weight: 600; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>ಹೊಸ ಖಾತೆ ತೆರೆಯಿರಿ</h2>
            <p>100% ಸುರಕ್ಷಿತ ನೋಂದಣಿ</p>
            <form action="/register" method="POST">
                <input type="email" name="email" placeholder="ಇಮೇಲ್ ವಿಳಾಸ" required>
                <input type="password" name="password" placeholder="ಪಾಸ್‌ವರ್ಡ್" required>
                <input type="text" name="phone" placeholder="WhatsApp ಮೊಬೈಲ್ ಸಂಖ್ಯೆ (+91...)" value="+91" required>
                <button type="submit">ಖಾತೆ ರಚಿಸಿ (Register Free)</button>
            </form>
            <div class="links">
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
        if (mongoose.connection.readyState === 1) {
            await User.create({ email, password, phone, plan: 'FREE' });
        } else {
            memoryUsers.push({ email, password, phone, plan: 'FREE' });
        }
        res.redirect('/login');
    } catch (e) {
        res.send("<script>alert('ಈ ಇಮೇಲ್ ಈಗಾಗಲೇ ಬಳಕೆಯಲ್ಲಿದೆ!'); window.location.href='/register';</script>");
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    let user = null;

    if (mongoose.connection.readyState === 1) {
        user = await User.findOne({ email });
        // ಅಡ್ಮಿನ್ ಖಾತೆ ಇದ್ದರೆ Ultra Pro ಮಾಡುವುದು
        if (email === 'shreedharashreedhara29@gmail.com' && !user) {
            user = await User.create({ email, password, phone: '+918618957072', plan: 'ULTRA_PRO' });
        }
    } else {
        user = memoryUsers.find(u => u.email === email);
    }

    if (user && user.password === password) {
        req.session.userEmail = user.email;
        req.session.userPlan = user.plan;
        req.session.userPhone = user.phone;
        res.redirect('/dashboard');
    } else {
        res.send("<script>alert('ತಪ್ಪಾದ ಇಮೇಲ್ ಅಥವಾ ಪಾಸ್‌ವರ್ಡ್!'); window.location.href='/login';</script>");
    }
});

// ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ (ಪ್ರತಿಯೊಬ್ಬರಿಗೂ ಅವರದ್ದೇ ಆದ ಖಾಸಗಿ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್)
app.get('/dashboard', requireAuth, async (req, res) => {
    let sites = [];
    let currentPlan = req.session.userPlan || 'FREE';
    let currentPhone = req.session.userPhone || '+918618957072';

    try {
        if (mongoose.connection.readyState === 1) {
            sites = await Website.find({ userId: req.session.userEmail });
            const u = await User.findOne({ email: req.session.userEmail });
            if (u) {
                currentPlan = u.plan;
                currentPhone = u.phone;
            }
        } else {
            sites = memoryWebsites.filter(s => s.userId === req.session.userEmail);
        }
    } catch (e) {
        sites = memoryWebsites.filter(s => s.userId === req.session.userEmail);
    }

    let badgeText = "🌱 FREE (10 ನಿಮಿಷ ಚೆಕ್)";
    let badgeBg = "#334155";
    let speedText = "10 ನಿಮಿಷಕ್ಕೊಮ್ಮೆ";

    if (currentPlan === 'ULTRA_PRO') {
        badgeText = "⚡ ULTRA PRO (3-5 ಸೆಕೆಂಡ್ ಚೆಕ್)";
        badgeBg = "linear-gradient(135deg, #ec4899, #8b5cf6)";
        speedText = "3 ರಿಂದ 5 ಸೆಕೆಂಡಿಗೆ";
    } else if (currentPlan === 'PRO') {
        badgeText = "👑 PRO (30 ಸೆಕೆಂಡ್ ಚೆಕ್)";
        badgeBg = "linear-gradient(135deg, #f59e0b, #d97706)";
        speedText = "30 ಸೆಕೆಂಡಿಗೆ";
    }

    let rows = sites.map(s => `
        <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 16px; font-weight: 600;">${s.name}</td>
            <td style="padding: 16px;"><a href="${s.url}" target="_blank" style="color: #38bdf8; text-decoration: none;">${s.url}</a></td>
            <td style="padding: 16px;">
                <span style="background: ${s.status === 'UP' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}; color: ${s.status === 'UP' ? '#4ade80' : '#f87171'}; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; border: 1px solid ${s.status === 'UP' ? '#22c55e' : '#ef4444'};">
                    ● ${s.status}
                </span>
            </td>
            <td style="padding: 16px; color: #94a3b8;">${s.latency} ms</td>
            <td style="padding: 16px; color: #94a3b8;">${s.lastChecked}</td>
            <td style="padding: 16px;">
                <form action="/delete-site/${s._id || s.id}" method="POST" style="margin: 0;">
                    <button type="submit" style="background: rgba(239,68,68,0.15); border: 1px solid #ef4444; color: #f87171; border-radius: 8px; padding: 6px 14px; cursor: pointer; font-size: 12px; font-weight: 600;">Delete</button>
                </form>
            </td>
        </tr>
    `).join('');

    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Dashboard | Uptime SaaS Pro</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
    </head>
    <body style="margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; background-color: #070a13; color: #f8fafc; padding: 30px;">
        <div style="max-width: 1100px; margin: 0 auto;">
            
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 20px; margin-bottom: 25px;">
                <div>
                    <h1 style="margin: 0; font-size: 26px; background: linear-gradient(135deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">⚡ Uptime SaaS Monitor</h1>
                    <p style="margin: 5px 0 0; color: #94a3b8; font-size: 13px;">ನಿಖರತೆ: <b style="color: #38bdf8;">${speedText}</b> • ಎಂಟರ್‌ಪ್ರೈಸ್ ಕ್ಲೌಡ್ ಎಂಜಿನ್</p>
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span style="background: ${badgeBg}; color: #fff; font-weight: 800; font-size: 12px; padding: 6px 14px; border-radius: 8px;">${badgeText}</span>
                    <span style="color: #cbd5e1; font-size: 14px; font-weight: 600;">${req.session.userEmail}</span>
                    <a href="/logout" style="color: #ef4444; text-decoration: none; font-size: 13px; font-weight: 600; padding: 6px 14px; border: 1px solid #ef4444; border-radius: 8px;">Logout</a>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px; margin-bottom: 30px;">
                <div style="background: #0f172a; border: 1px solid #1e293b; padding: 20px; border-radius: 14px;">
                    <span style="color: #94a3b8; font-size: 13px;">ಮಾನಿಟರ್ ಆಗುತ್ತಿರುವ ಸೈಟ್‌ಗಳು</span>
                    <h2 style="margin: 8px 0 0; font-size: 26px;">${sites.length} <span style="font-size: 13px; color: #4ade80;">/ Active</span></h2>
                </div>
                <div style="background: #0f172a; border: 1px solid #1e293b; padding: 20px; border-radius: 14px;">
                    <span style="color: #94a3b8; font-size: 13px;">ತಪಾಸಣಾ ವೇಗ</span>
                    <h2 style="margin: 8px 0 0; font-size: 18px; color: #38bdf8;">${speedText}</h2>
                </div>
                <div style="background: #0f172a; border: 1px solid #1e293b; padding: 20px; border-radius: 14px;">
                    <span style="color: #94a3b8; font-size: 13px;">WhatsApp ಅಲರ್ಟ್‌ಗಳು</span>
                    <h2 style="margin: 8px 0 0; font-size: 18px; color: #22c55e;">ಸಕ್ರಿಯವಾಗಿದೆ</h2>
                </div>
                <div style="background: #0f172a; border: 1px solid #1e293b; padding: 20px; border-radius: 14px;">
                    <span style="color: #94a3b8; font-size: 13px;">ಅಲರ್ಟ್ ಬರುವ ಮೊಬೈಲ್</span>
                    <h2 style="margin: 8px 0 0; font-size: 16px; color: #f1f5f9;">${currentPhone}</h2>
                </div>
            </div>

            <!-- ಹೊಸ ವೆಬ್‌ಸೈಟ್ ಸೇರ್ಪಡೆ -->
            <div style="background: #0f172a; padding: 22px; border-radius: 16px; border: 1px solid #1e293b; margin-bottom: 30px;">
                <h3 style="margin: 0 0 15px; font-size: 17px;">+ ಹೊಸ ವೆಬ್‌ಸೈಟ್ ಸೇರಿಸಿ</h3>
                <form action="/add-site" method="POST" style="display: flex; gap: 12px; flex-wrap: wrap;">
                    <input type="text" name="name" placeholder="ಸೈಟ್ ಹೆಸರು (ಉದಾ: My Website)" required style="flex: 1; min-width: 200px; padding: 12px 16px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; color: #fff; outline: none;">
                    <input type="url" name="url" placeholder="ವೆಬ್‌ಸೈಟ್ URL (https://...)" required style="flex: 2; min-width: 260px; padding: 12px 16px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; color: #fff; outline: none;">
                    <button type="submit" style="padding: 12px 24px; background: linear-gradient(135deg, #0284c7, #4f46e5); color: #fff; border: none; border-radius: 8px; font-weight: 700; cursor: pointer;">Add Website</button>
                </form>
            </div>

            <!-- ಸೈಟ್‌ಗಳ ಪಟ್ಟಿ -->
            <div style="background: #0f172a; border-radius: 16px; border: 1px solid #1e293b; overflow: hidden;">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="background: #1e293b; color: #94a3b8; font-size: 12px; text-transform: uppercase;">
                            <th style="padding: 16px;">ವೆಬ್‌ಸೈಟ್ ಹೆಸರು</th>
                            <th style="padding: 16px;">URL</th>
                            <th style="padding: 16px;">ಸ್ಥಿತಿ</th>
                            <th style="padding: 16px;">ಲೇಟೆನ್ಸಿ</th>
                            <th style="padding: 16px;">ಕೊನೆಯ ತಪಾಸಣೆ</th>
                            <th style="padding: 16px;">ಕ್ರಿಯೆ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.length ? rows : '<tr><td colspan="6" style="padding: 24px; text-align: center; color: #64748b;">ಡೇಟಾಬೇಸ್‌ನಲ್ಲಿ ಇನ್ನೂ ವೆಬ್‌ಸೈಟ್‌ಗಳಿಲ್ಲ. ಮೇಲೆ ಹೊಸದಾಗಿ ಸೇರಿಸಿ!</td></tr>'}
                    </tbody>
                </table>
            </div>

        </div>
    </body>
    </html>
    `);
});

// ವೆಬ್‌ಸೈಟ್ ಸೇರಿಸುವ ರೂಟ್
app.post('/add-site', requireAuth, async (req, res) => {
    const { name, url } = req.body;
    const plan = req.session.userPlan || 'FREE';
    const email = req.session.userEmail;

    let count = 0;
    if (mongoose.connection.readyState === 1) {
        count = await Website.countDocuments({ userId: email });
    } else {
        count = memoryWebsites.filter(s => s.userId === email).length;
    }

    if (plan === 'FREE' && count >= 1) {
        return res.send("<script>alert('ಉಚಿತ ಪ್ಲಾನ್‌ನಲ್ಲಿ ಕೇವಲ 1 ವೆಬ್‌ಸೈಟ್ ಮಾತ್ರ ಮಾನಿಟರ್ ಮಾಡಬಹುದು! Pro ಅಥವಾ Ultra Pro ಗೆ ಅಪ್‌ಗ್ರೇಡ್ ಮಾಡಿ.'); window.location.href='/dashboard';</script>");
    }

    if (name && url) {
        const siteData = {
            userId: email,
            name,
            url,
            status: 'CHECKING',
            latency: 0,
            lastCheckedTime: 0,
            lastChecked: new Date().toLocaleTimeString()
        };

        if (mongoose.connection.readyState === 1) {
            const created = await Website.create(siteData);
            checkWebsiteAccuracy(created, req.session.userPhone);
        } else {
            const mem = { id: Date.now().toString(), ...siteData };
            memoryWebsites.push(mem);
            checkWebsiteAccuracy(mem, req.session.userPhone);
        }
    }
    res.redirect('/dashboard');
});

// ಸೈಟ್ ಅಳಿಸುವ ರೂಟ್
app.post('/delete-site/:id', requireAuth, async (req, res) => {
    const id = req.params.id;
    if (mongoose.connection.readyState === 1) {
        try {
            await Website.findOneAndDelete({ _id: id, userId: req.session.userEmail });
        } catch (e) {
            memoryWebsites = memoryWebsites.filter(s => s.id !== id);
        }
    } else {
        memoryWebsites = memoryWebsites.filter(s => s.id !== id);
    }
    res.redirect('/dashboard');
});

// ಲಾಗ್‌ಔಟ್
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.listen(PORT, () => {
    console.log(`Enterprise SaaS Uptime Server Live on port ${PORT}`);
    runEngine();
});
