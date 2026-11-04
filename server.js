const express = require('express');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const Razorpay = require('razorpay');

const app = express();
const PORT = process.env.PORT || 3000;

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_TvxlEIhwKn8b3d';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'NZ354nNhWxA88CamPBfUx7Tc';
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || 'wAqANnU9F5SnTiOFzFDem4RtDNY41dXnCnSZh7YdOX8SMHctsY3Xql8xv2ZzATI9jCKEWjlUD36o01Jc';

const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
});

const PLANS = {
    free: { name: 'Free', price: 0, maxSites: 10, intervalSec: 600 },
    lite: { name: 'Lite', price: 199, maxSites: 10, intervalSec: 30 },
    pro: { name: 'Pro', price: 349, maxSites: 25, intervalSec: 15 },
    ultra_pro: { name: 'Ultra Pro', price: 599, maxSites: 99999, intervalSec: 5 }
};

let globalState = {
    websites: [],
    userPlan: 'pro' // ಟೆಸ್ಟಿಂಗ್ ಮುಗಿಯುವವರೆಗೆ Pro ನಲ್ಲೇ ಇರುತ್ತದೆ
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Fast2SMS ಮೂಲಕ ಭಾರತೀಯ ನಂಬರ್‌ಗೆ ನೇರ SMS ಕಳುಹಿಸುವ ಫಂಕ್ಷನ್
async function sendSmsAlert(rawPhone, siteName, statusText) {
    try {
        let cleanPhone = rawPhone.toString().replace(/[^0-9]/g, '');
        // 91 ತೆಗೆದು ಕೊನೆಯ 10 ಅಂಕಿಗಳನ್ನು ಮಾತ್ರ ತೆಗೆದುಕೊಳ್ಳಿ
        if (cleanPhone.length > 10) {
            cleanPhone = cleanPhone.slice(-10);
        }

        if (cleanPhone.length !== 10) {
            console.log('ಅಮಾನ್ಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ:', rawPhone);
            return;
        }

        console.log(`[SMS ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ...] ಸಂಖ್ಯೆ: ${cleanPhone}`);

        // Fast2SMS Quick Message API
        const payload = {
            route: "q",
            message: `Pingbaba Alert: Your website ${siteName} is ${statusText}! Check dashboard immediately.`,
            language: "english",
            flash: 0,
            numbers: cleanPhone
        };

        const res = await axios.post('https://www.fast2sms.com/dev/bulkV2', payload, {
            headers: {
                "authorization": FAST2SMS_API_KEY,
                "Content-Type": "application/json"
            },
            timeout: 10000
        });

        console.log('Fast2SMS ಯಶಸ್ವಿ ವರದಿ:', res.data);
    } catch (err) {
        console.error('Fast2SMS ಕಳುಹಿಸುವಾಗ ದೋಷ:', err.response ? err.response.data : err.message);
    }
}

// ವೆಬ್‌ಸೈಟ್ ಲೈವ್ ತಪಾಸಣೆ (Live Checker)
async function verifyWebsiteLive(targetUrl) {
    let formattedUrl = targetUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = 'https://' + formattedUrl;
    }

    try {
        await axios.get(formattedUrl, {
            timeout: 6000,
            headers: { 'User-Agent': 'Pingbaba-Uptime-Bot/3.0' },
            validateStatus: (status) => status >= 200 && status < 400
        });
        return { isUp: true, finalUrl: formattedUrl };
    } catch (err) {
        return { isUp: false, finalUrl: formattedUrl };
    }
}

app.get('/', (req, res) => {
    res.render('dashboard', {
        websites: globalState.websites,
        userPlan: globalState.userPlan,
        plans: PLANS,
        razorpayKeyId: RAZORPAY_KEY_ID
    });
});

app.post('/add-website', async (req, res) => {
    const { name, url, phone, email } = req.body;

    const checkResult = await verifyWebsiteLive(url);

    const newSite = {
        id: Date.now().toString(),
        name: name.trim(),
        url: checkResult.finalUrl,
        phone: phone ? phone.trim() : '',
        email: email ? email.trim() : '',
        status: checkResult.isUp ? 'UP' : 'DOWN',
        lastChecked: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })
    };

    globalState.websites.push(newSite);

    // ಸೈಟ್ DOWN ಆಗಿದ್ದರೆ ತಕ್ಷಣವೇ SMS ರವಾನೆ!
    if (!checkResult.isUp && newSite.phone) {
        await sendSmsAlert(newSite.phone, newSite.name, 'DOWN');
    }

    res.redirect('/');
});

app.post('/delete-website/:id', (req, res) => {
    globalState.websites = globalState.websites.filter(site => site.id !== req.params.id);
    res.redirect('/');
});

// ಕಾಲಕಾಲಕ್ಕೆ ಸೈಟ್‌ಗಳನ್ನು ಚೆಕ್ ಮಾಡುವ ಪ್ರಕ್ರಿಯೆ
setInterval(async () => {
    if (!globalState.websites || globalState.websites.length === 0) return;

    for (let site of globalState.websites) {
        const prevStatus = site.status;
        const checkResult = await verifyWebsiteLive(site.url);
        site.status = checkResult.isUp ? 'UP' : 'DOWN';
        site.lastChecked = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

        // UP ಇದ್ದದ್ದು DOWN ಆದರೆ SMS ಕಳುಹಿಸು
        if (prevStatus === 'UP' && site.status === 'DOWN') {
            await sendSmsAlert(site.phone, site.name, 'DOWN');
        }
    }
}, 20000);

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Running on port ${PORT}`));
}
module.exports = app;
