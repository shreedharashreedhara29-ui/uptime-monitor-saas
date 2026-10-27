const express = require('express');
const axios = require('axios');
const twilio = require('twilio');

const app = express();
const PORT = process.env.PORT || 3000;

// Twilio WhatsApp ಸೆಟಪ್
const TWILIO_ACCOUNT_SID = 'AC05b9523622dc3a689dfed0662ff27582';
const TWILIO_AUTH_TOKEN = 'd4dbe15d686921e4d567d9148b5fe3a3';
const TWILIO_PHONE = 'whatsapp:+17372508034';
const ALERT_PHONE = '+918618957072';

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// WhatsApp ಅಲರ್ಟ್ ಕಳುಹಿಸುವ ಫಂಕ್ಷನ್
function sendWhatsAppAlert(messageText) {
    twilioClient.messages.create({
        from: TWILIO_PHONE,
        to: `whatsapp:${ALERT_PHONE}`,
        body: messageText
    })
    .then(msg => console.log('WhatsApp Alert Sent! SID:', msg.sid))
    .catch(err => console.error('Twilio WhatsApp Error:', err.message));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ಮಾನಿಟರ್ ಮಾಡುವ ವೆಬ್‌ಸೈಟ್‌ಗಳ ಪಟ್ಟಿ
let websites = [
    { id: 1, name: 'Google Main Server', url: 'https://www.google.com', status: 'UP', latency: 45, lastChecked: new Date().toLocaleTimeString() }
];

// ವೆಬ್‌ಸೈಟ್ ಚೆಕ್ ಮಾಡುವ ಲಾಜಿಕ್
async function checkWebsites() {
    for (let site of websites) {
        const startTime = Date.now();
        try {
            await axios.get(site.url, { timeout: 8000 });
            const latency = Date.now() - startTime;

            if (site.status === 'DOWN') {
                const recoveryMsg = `✅ *UPTIME MONITOR RECOVERED*\n\nನಿಮ್ಮ ಸೈಟ್ ಮತ್ತೆ ಆನ್‌ಲೈನ್ ಬಂದಿದೆ!\n🔗 URL: ${site.url}\n⚡ Latency: ${latency}ms\n⏰ Time: ${new Date().toLocaleTimeString()}`;
                sendWhatsAppAlert(recoveryMsg);
            }

            site.status = 'UP';
            site.latency = latency;
            site.lastChecked = new Date().toLocaleTimeString();
        } catch (error) {
            if (site.status === 'UP') {
                const alertMsg = `🚨 *UPTIME MONITOR ALERT*\n\nನಿಮ್ಮ ಸೈಟ್ ಡೌನ್ ಆಗಿದೆ!\n🔗 URL: ${site.url}\n⚠️ ಕಾರಣ: ${error.message}\n⏰ Time: ${new Date().toLocaleTimeString()}`;
                sendWhatsAppAlert(alertMsg);
            }

            site.status = 'DOWN';
            site.latency = 0;
            site.lastChecked = new Date().toLocaleTimeString();
        }
    }
}

// ಪ್ರತಿ 60 ಸೆಕೆಂಡಿಗೆ ಒಮ್ಮೆ ಪರಿಶೀಲನೆ
setInterval(checkWebsites, 60000);

// ಮುಖ್ಯ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ HTML (ಯಾವುದೇ EJS ಫೈಲ್‌ನ ಅವಶ್ಯಕತೆ ಇಲ್ಲ)
app.get('/', (req, res) => {
    let rows = websites.map(s => `
        <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 16px; font-weight: 600;">${s.name}</td>
            <td style="padding: 16px;"><a href="${s.url}" target="_blank" style="color: #38bdf8; text-decoration: none;">${s.url}</a></td>
            <td style="padding: 16px;">
                <span style="background: ${s.status === 'UP' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}; color: ${s.status === 'UP' ? '#4ade80' : '#f87171'}; padding: 6px 14px; border-radius: 9999px; font-size: 13px; font-weight: 700; border: 1px solid ${s.status === 'UP' ? '#22c55e' : '#ef4444'};">
                    ● ${s.status}
                </span>
            </td>
            <td style="padding: 16px; color: #94a3b8;">${s.latency} ms</td>
            <td style="padding: 16px; color: #94a3b8;">${s.lastChecked}</td>
        </tr>
    `).join('');

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Uptime SaaS Pro | Live Pulse</title>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
    </head>
    <body style="margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; background-color: #090d16; color: #f8fafc; padding: 30px;">
        <div style="max-width: 1000px; margin: 0 auto;">
            <!-- Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 20px; margin-bottom: 30px;">
                <div>
                    <h1 style="margin: 0; font-size: 26px; background: linear-gradient(135deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">⚡ Uptime SaaS Monitor</h1>
                    <p style="margin: 5px 0 0; color: #94a3b8; font-size: 14px;">ಲೈವ್ WhatsApp ಅಲರ್ಟ್ ಸಂಪರ್ಕಗೊಂಡಿದೆ: <b>+91 8618957072</b></p>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; background: #0f172a; padding: 8px 16px; border-radius: 20px; border: 1px solid #1e293b;">
                    <span style="height: 10px; width: 10px; background: #22c55e; border-radius: 50%; display: inline-block; box-shadow: 0 0 10px #22c55e;"></span>
                    <span style="font-size: 13px; font-weight: 600;">System Active</span>
                </div>
            </div>

            <!-- Add Website Form -->
            <div style="background: #0f172a; padding: 24px; border-radius: 16px; border: 1px solid #1e293b; margin-bottom: 30px;">
                <h3 style="margin-top: 0; font-size: 18px; margin-bottom: 15px;">ಹೊಸ ವೆಬ್‌ಸೈಟ್ ಸೇರಿಸಿ</h3>
                <form action="/add-site" method="POST" style="display: flex; gap: 12px; flex-wrap: wrap;">
                    <input type="text" name="name" placeholder="ಸೈಟ್ ಹೆಸರು (ಉದಾ: My Blog)" required style="flex: 1; min-width: 200px; padding: 12px 16px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; color: #fff; outline: none;">
                    <input type="url" name="url" placeholder="ವೆಬ್‌ಸೈಟ್ ಲಿಂಕ್ (https://...)" required style="flex: 2; min-width: 260px; padding: 12px 16px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; color: #fff; outline: none;">
                    <button type="submit" style="padding: 12px 24px; background: linear-gradient(135deg, #0284c7, #4f46e5); color: #fff; border: none; border-radius: 8px; font-weight: 700; cursor: pointer;">+ Add Site</button>
                </form>
            </div>

            <!-- Websites Table -->
            <div style="background: #0f172a; border-radius: 16px; border: 1px solid #1e293b; overflow: hidden;">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="background: #1e293b; color: #94a3b8; font-size: 13px; text-transform: uppercase;">
                            <th style="padding: 16px;">ಹೆಸರು</th>
                            <th style="padding: 16px;">URL</th>
                            <th style="padding: 16px;">ಸ್ಥಿತಿ</th>
                            <th style="padding: 16px;">ಲೇಟೆನ್ಸಿ</th>
                            <th style="padding: 16px;">ಕೊನೆಯ ತಪಾಸಣೆ</th>
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
    `;
    res.send(html);
});

// ಸೈಟ್ ಸೇರಿಸುವ ಪೋಸ್ಟ್ ರೂಟ್
app.post('/add-site', (req, res) => {
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
    res.redirect('/');
});

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    checkWebsites();
});
