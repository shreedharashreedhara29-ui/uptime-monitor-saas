const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const twilio = require('twilio');

const app = express();
const PORT = process.env.PORT || 3000;

// Twilio WhatsApp ಕ್ರೆಡೆನ್ಶಿಯಲ್ಸ್
const TWILIO_ACCOUNT_SID = 'AC05b9523622dc3a689dfed0662ff27582';
const TWILIO_AUTH_TOKEN = 'd4dbe15d686921e4d567d9148b5fe3a3';
const TWILIO_PHONE = 'whatsapp:+17372508034';
const ALERT_PHONE = '+918618957072'; // ನಿಮ್ಮ ಮೊಬೈಲ್ ನಂಬರ್

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

// ಮಿಡಲ್‌ವೇರ್ ಸೆಟಪ್
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
    secret: 'uptime_secret_key_2026',
    resave: false,
    saveUninitialized: true
}));

// ಮಾನಿಟರ್ ಮಾಡುವ ವೆಬ್‌ಸೈಟ್‌ಗಳ ಲಿಸ್ಟ್
let websites = [
    { id: 1, name: 'Google', url: 'https://www.google.com', status: 'UP', latency: 45, lastChecked: new Date() },
    { id: 2, name: 'My Website', url: 'https://example.com', status: 'UP', latency: 120, lastChecked: new Date() }
];

// ವೆಬ್‌ಸೈಟ್ ಚೆಕ್ ಮಾಡುವ ಮುಖ್ಯ ಲಾಜಿಕ್
async function checkWebsites() {
    for (let site of websites) {
        const startTime = Date.now();
        try {
            const response = await axios.get(site.url, { timeout: 8000 });
            const latency = Date.now() - startTime;
            
            // ಮೊದಲಿಗೆ ಡೌನ್ ಇದ್ದು ಈಗ ಆನ್‌ಲೈನ್ ಬಂದರೆ
            if (site.status === 'DOWN') {
                const recoveryMsg = `✅ *UPTIME MONITOR RECOVERED*\n\nನಿಮ್ಮ ಸೈಟ್ ಮತ್ತೆ ಆನ್‌ಲೈನ್ ಬಂದಿದೆ!\n🔗 URL: ${site.url}\n⚡ Latency: ${latency}ms\n⏰ Time: ${new Date().toLocaleTimeString()}`;
                sendWhatsAppAlert(recoveryMsg);
            }

            site.status = 'UP';
            site.latency = latency;
            site.lastChecked = new Date();
        } catch (error) {
            // ಮೊದಲಿಗೆ ಆನ್‌ಲೈನ್ ಇದ್ದು ಈಗ ಡೌನ್ ಆದರೆ
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

// ಪ್ರತಿ 60 ಸೆಕೆಂಡಿಗೆ (1 ನಿಮಿಷ) ಆಟೋಮ್ಯಾಟಿಕ್ ಆಗಿ ಚೆಕ್ ಮಾಡುತ್ತದೆ
setInterval(checkWebsites, 60000);

// ರೂಟ್ಸ್ (Routes)
app.get('/', (req, res) => {
    res.render('dashboard', { sites: websites });
});

// ಹೊಸ ಸೈಟ್ ಆಡ್ ಮಾಡಲು
app.post('/add-site', (req, res) => {
    const { name, url } = req.body;
    if (name && url) {
        const newSite = {
            id: Date.now(),
            name,
            url,
            status: 'CHECKING',
            latency: 0,
            lastChecked: new Date()
        };
        websites.push(newSite);
    }
    res.redirect('/');
});

// ಸರ್ವರ್ ಆರಂಭ
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    checkWebsites(); // ಸರ್ವರ್ ಆರಂಭವಾದ ತಕ್ಷಣ ಮೊದಲ ಚೆಕ್
});
