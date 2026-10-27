const express = require('express');
const session = require('express-session');
const axios = require('axios');
const twilio = require('twilio');

const app = express();
const PORT = process.env.PORT || 3000;

// ================= Twilio WhatsApp ಕಾನ್ಫಿಗರೇಶನ್ =================
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

// ================= ಮಿಡಲ್‌ವೇರ್ ಸೆಟಪ್ =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'uptime_saas_enterprise_key_2026',
    resave: false,
    saveUninitialized: false
}));

// ================= ಡೇಟಾಬೇಸ್ ಸ್ಟೋರೇಜ್ =================
let users = [
    { email: 'shreedharashreedhara29@gmail.com', password: 'admin', plan: 'PRO Plan (Enterprise)' }
];

let websites = [
    { id: 1, name: 'Google Server', url: 'https://www.google.com', status: 'UP', latency: 45, uptime: '99.9%', lastChecked: new Date().toLocaleTimeString() }
];

// ================= ವೆಬ್‌ಸೈಟ್ ಚೆಕ್ ಮಾಡುವ ಲಾಜಿಕ್ =================
async function checkWebsites() {
    for (let site of websites) {
        const startTime = Date.now();
        try {
            await axios.get(site.url, { timeout: 8000 });
            const latency = Date.now() - startTime;

            if (site.status === 'DOWN') {
                const recoveryMsg = `✅ *UPTIME MONITOR: RECOVERED*\n\nವೆಬ್‌ಸೈಟ್ ಮತ್ತೆ ಚಾಲನೆಗೊಂಡಿದೆ!\n🔗 URL: ${site.url}\n⚡ ಲೇಟೆನ್ಸಿ: ${latency}ms\n⏰ ಸಮಯ: ${new Date().toLocaleTimeString()}`;
                sendWhatsAppAlert(recoveryMsg);
            }

            site.status = 'UP';
            site.latency = latency;
            site.lastChecked = new Date().toLocaleTimeString();
        } catch (error) {
            if (site.status === 'UP' || site.status === 'CHECKING') {
                const alertMsg = `🚨 *UPTIME ALERT: SITE DOWN!*\n\nನಿಮ್ಮ ಸೈಟ್ ಡೌನ್ ಆಗಿದೆ!\n🔗 URL: ${site.url}\n⚠️ ಕಾರಣ: ${error.message}\n⏰ ಸಮಯ: ${new Date().toLocaleTimeString()}`;
                sendWhatsAppAlert(alertMsg);
            }

            site.status = 'DOWN';
            site.latency = 0;
            site.lastChecked = new Date().toLocaleTimeString();
        }
    }
}
setInterval(checkWebsites, 60000);

// ================= ಅಥೆಂಟಿಕೇಶನ್ ಗಾರ್ಡ್ =================
function requireAuth(req, res, next) {
    if (req.session && req.session.user) return next();
    res.redirect('/login');
}

// ================= ರೂಟ್‌ಗಳು (ROUTES) =================

// ಮುಖ್ಯ ರೂಟ್
app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.redirect('/login');
});

// ಲಾಗಿನ್ ಪುಟ
app.get('/login', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Login | Uptime SaaS Monitor</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            * { box-sizing: border-box; }
            body { margin: 0; background: #070a13; font-family: 'Plus Jakarta Sans', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; color: #fff; }
            .card { background: #0f172a; padding: 40px; border-radius: 20px; border: 1px solid #1e293b; width: 380px; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
            h2 { margin: 0 0 8px; font-size: 24px; background: linear-gradient(135deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            p { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
            input { width: 100%; padding: 14px 16px; margin-bottom: 16px; background: #1e293b; border: 1px solid #334155; border-radius: 10px; color: #fff; outline: none; font-size: 14px; }
            input:focus { border-color: #38bdf8; }
            button { width: 100%; padding: 14px; background: linear-gradient(135deg, #0284c7, #6366f1); color: #fff; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; font-size: 15px; }
            .footer-links { margin-top: 20px; text-align: center; font-size: 13px; color: #94a3b8; }
            .footer-links a { color: #38bdf8; text-decoration: none; font-weight: 600; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>⚡ Uptime SaaS Monitor</h2>
            <p>ಖಾತೆಗೆ ಲಾಗಿನ್ ಮಾಡಿ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ತೆರೆಯಿರಿ</p>
            <form action="/login" method="POST">
                <input type="text" name="email" placeholder="ಇಮೇಲ್ ಅಥವಾ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ" value="shreedharashreedhara29@gmail.com" required>
                <input type="password" name="password" placeholder="ಪಾಸ್‌ವರ್ಡ್" value="admin" required>
                <button type="submit">ಲಾಗಿನ್ ಆಗಿ (Sign In)</button>
            </form>
            <div class="footer-links">
                ಹೊಸ ಬಳಕೆದಾರರೇ? <a href="/register">ಖಾತೆ ರಚಿಸಿ</a>
            </div>
        </div>
    </body>
    </html>
    `);
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    let user = users.find(u => u.email === email && u.password === password);
    if (!user) {
        user = { email, password, plan: 'PRO Plan (Enterprise)' };
        users.push(user);
    }
    req.session.user = user;
    res.redirect('/dashboard');
});

// ಸೈನ್-ಅಪ್ ಪುಟ
app.get('/register', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Register | Uptime SaaS Monitor</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
            * { box-sizing: border-box; }
            body { margin: 0; background: #070a13; font-family: 'Plus Jakarta Sans', sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; color: #fff; }
            .card { background: #0f172a; padding: 40px; border-radius: 20px; border: 1px solid #1e293b; width: 380px; }
            h2 { margin: 0 0 8px; font-size: 24px; color: #38bdf8; }
            p { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
            input { width: 100%; padding: 14px 16px; margin-bottom: 16px; background: #1e293b; border: 1px solid #334155; border-radius: 10px; color: #fff; outline: none; }
            button { width: 100%; padding: 14px; background: linear-gradient(135deg, #0284c7, #6366f1); color: #fff; border: none; border-radius: 10px; font-weight: 700; cursor: pointer; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>ಹೊಸ ಖಾತೆ ತೆರೆಯಿರಿ</h2>
            <p>100% ಉಚಿತ PRO ಎಂಟರ್‌ಪ್ರೈಸ್ ಆಕ್ಸೆಸ್</p>
            <form action="/login" method="POST">
                <input type="text" name="email" placeholder="ಇಮೇಲ್ ಅಥವಾ ಮೊಬೈಲ್" required>
                <input type="password" name="password" placeholder="ಪಾಸ್‌ವರ್ಡ್ ಹೊಂದಿಸಿ" required>
                <button type="submit">ಖಾತೆ ರಚಿಸಿ (Register)</button>
            </form>
        </div>
    </body>
    </html>
    `);
});

// ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಪುಟ
app.get('/dashboard', requireAuth, (req, res) => {
    let rows = websites.map(s => `
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
                <form action="/delete-site/${s.id}" method="POST" style="margin: 0;">
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
        <title>Uptime SaaS Pro | Enterprise Monitor</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
    </head>
    <body style="margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; background-color: #070a13; color: #f8fafc; padding: 30px;">
        <div style="max-width: 1100px; margin: 0 auto;">
            
            <!-- ಹೆಡರ್ ಬಾರ್ -->
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 20px; margin-bottom: 25px;">
                <div>
                    <h1 style="margin: 0; font-size: 26px; background: linear-gradient(135deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">⚡ Uptime SaaS Monitor</h1>
                    <p style="margin: 5px 0 0; color: #94a3b8; font-size: 13px;">Enterprise Status Engine • Real-time Monitoring</p>
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span style="background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; font-weight: 800; font-size: 11px; padding: 5px 12px; border-radius: 6px;">👑 PRO ACTIVATED</span>
                    <span style="color: #cbd5e1; font-size: 14px; font-weight: 600;">${req.session.user.email}</span>
                    <a href="/logout" style="color: #ef4444; text-decoration: none; font-size: 13px; font-weight: 600; padding: 6px 14px; border: 1px solid #ef4444; border-radius: 8px;">Logout</a>
                </div>
            </div>

            <!-- ಅಂಕಿಅಂಶಗಳ ಕಾರ್ಡ್‌ಗಳು -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px; margin-bottom: 30px;">
                <div style="background: #0f172a; border: 1px solid #1e293b; padding: 20px; border-radius: 14px;">
                    <span style="color: #94a3b8; font-size: 13px;">Monitored Websites</span>
                    <h2 style="margin: 8px 0 0; font-size: 26px;">${websites.length} <span style="font-size: 13px; color: #4ade80;">/ Unlimited (PRO)</span></h2>
                </div>
                <div style="background: #0f172a; border: 1px solid #1e293b; padding: 20px; border-radius: 14px;">
                    <span style="color: #94a3b8; font-size: 13px;">WhatsApp Notifications</span>
                    <h2 style="margin: 8px 0 0; font-size: 18px; color: #22c55e;">Enabled (Twilio)</h2>
                </div>
                <div style="background: #0f172a; border: 1px solid #1e293b; padding: 20px; border-radius: 14px;">
                    <span style="color: #94a3b8; font-size: 13px;">SMS Notifications</span>
                    <h2 style="margin: 8px 0 0; font-size: 18px; color: #38bdf8;">Ready (Fast2SMS)</h2>
                </div>
                <div style="background: #0f172a; border: 1px solid #1e293b; padding: 20px; border-radius: 14px;">
                    <span style="color: #94a3b8; font-size: 13px;">Alert Recipient Phone</span>
                    <h2 style="margin: 8px 0 0; font-size: 16px; color: #f1f5f9;">+91 8618957072</h2>
                </div>
            </div>

            <!-- ಹೊಸ ವೆಬ್‌ಸೈಟ್ ಸೇರಿಸುವ ವಿಭಾಗ -->
            <div style="background: #0f172a; padding: 22px; border-radius: 16px; border: 1px solid #1e293b; margin-bottom: 30px;">
                <h3 style="margin: 0 0 15px; font-size: 17px;">+ ಹೊಸ ವೆಬ್‌ಸೈಟ್ ಸೇರಿಸಿ</h3>
                <form action="/add-site" method="POST" style="display: flex; gap: 12px; flex-wrap: wrap;">
                    <input type="text" name="name" placeholder="ಸೈಟ್ ಹೆಸರು (ಉದಾ: My Server)" required style="flex: 1; min-width: 200px; padding: 12px 16px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; color: #fff; outline: none;">
                    <input type="url" name="url" placeholder="ವೆಬ್‌ಸೈಟ್ URL (https://...)" required style="flex: 2; min-width: 260px; padding: 12px 16px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; color: #fff; outline: none;">
                    <button type="submit" style="padding: 12px 24px; background: linear-gradient(135deg, #0284c7, #4f46e5); color: #fff; border: none; border-radius: 8px; font-weight: 700; cursor: pointer;">Add Website</button>
                </form>
            </div>

            <!-- ಸೈಟ್‌ಗಳ ಪಟ್ಟಿ ಕೋಷ್ಟಕ -->
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
                        ${rows}
                    </tbody>
                </table>
            </div>

        </div>
    </body>
    </html>
    `);
});

// ಸೈಟ್ ಸೇರಿಸುವ ರೂಟ್
app.post('/add-site', requireAuth, (req, res) => {
    const { name, url } = req.body;
    if (name && url) {
        websites.push({
            id: Date.now(),
            name,
            url,
            status: 'CHECKING',
            latency: 0,
            lastChecked: new Date().toLocaleTimeString()
        });
        checkWebsites();
    }
    res.redirect('/dashboard');
});

// ಸೈಟ್ ಡಿಲೀಟ್ ಮಾಡುವ ರೂಟ್
app.post('/delete-site/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    websites = websites.filter(s => s.id !== id);
    res.redirect('/dashboard');
});

// ಲಾಗ್‌ಔಟ್
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// ಸರ್ವರ್ ಚಾಲನೆ
app.listen(PORT, () => {
    console.log(`Enterprise SaaS Uptime Server running on port ${PORT}`);
    checkWebsites();
});
