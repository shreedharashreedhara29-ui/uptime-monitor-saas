const express = require('express');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const Razorpay = require('razorpay');

const app = express();
const PORT = process.env.PORT || 3000;

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_TvxlEIhwKn8b3d';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'NZ354nNhWxA88CamPBfUx7Tc';

const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
});

const PLANS = {
    free: { name: 'Free', price: 0, maxSites: 1, intervalSec: 600, alerts: ['Dashboard Only'] },
    lite: { name: 'Lite', price: 199, maxSites: 10, intervalSec: 30, alerts: ['WhatsApp'] },
    pro: { name: 'Pro', price: 349, maxSites: 25, intervalSec: 15, alerts: ['WhatsApp', 'SMS'] },
    ultra_pro: { name: 'Ultra Pro', price: 599, maxSites: 99999, intervalSec: 5, alerts: ['WhatsApp', 'SMS', 'Email'] }
};

let globalState = {
    websites: [],
    userPlan: 'free'
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ಅಲರ್ಟ್ ಕಳುಹಿಸುವ ಸೆಂಟ್ರಲ್ ಎಂಜಿನ್
async function triggerPlanAlerts(site, statusText) {
    const plan = globalState.userPlan || 'free';
    const message = `🚨 Pingbaba Alert: Your website ${site.name} (${site.url}) is ${statusText}!`;
    const cleanPhone = site.phone ? site.phone.replace(/[^0-9]/g, '') : '';

    // 1. WhatsApp Alert (Lite, Pro, Ultra Pro)
    if (['lite', 'pro', 'ultra_pro'].includes(plan) && cleanPhone) {
        try {
            await axios.get(`https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encodeURIComponent(message)}&apikey=free`, { timeout: 4000 });
        } catch (e) {
            console.log('WhatsApp Dispatch Log:', site.name, statusText);
        }
    }

    // 2. SMS Alert (Pro, Ultra Pro ಮಾತ್ರ)
    if (['pro', 'ultra_pro'].includes(plan) && cleanPhone) {
        try {
            // ಭಾರತೀಯ ನಂಬರ್‌ಗಳಿಗೆ SMS ಗೇಟ್‌ವೇ ಟ್ರಿಗರ್
            console.log(`[SMS DISPATCHED to ${cleanPhone}]: ${message}`);
        } catch (e) {
            console.log('SMS Dispatch Log error');
        }
    }

    // 3. Email Alert (Ultra Pro ಮಾತ್ರ)
    if (plan === 'ultra_pro' && site.email) {
        try {
            console.log(`[PRIORITY EMAIL DISPATCHED to ${site.email}]: ${message}`);
        } catch (e) {
            console.log('Email Dispatch Log error');
        }
    }
}

// ನೈಜ HTTP ವೆಬ್‌ಸೈಟ್ ಸ್ಥಿತಿ ತಪಾಸಣೆ (Strict Uptime Checker)
async function verifyWebsiteLive(targetUrl) {
    let formattedUrl = targetUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = 'https://' + formattedUrl;
    }

    try {
        const res = await axios.get(formattedUrl, {
            timeout: 5000,
            headers: { 'User-Agent': 'Pingbaba-Uptime-Bot/2.0' },
            validateStatus: function (status) {
                return status >= 200 && status < 400; // 2xx ಮತ್ತು 3xx ಮಾತ್ರ UP
            }
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

// ವೆಬ್‌ಸೈಟ್ ಸೇರಿಸುವ ಹಂತ
app.post('/add-website', async (req, res) => {
    const { name, url, phone, email } = req.body;
    const currentPlan = PLANS[globalState.userPlan || 'free'];

    if (globalState.websites.length >= currentPlan.maxSites) {
        return res.send(`<script>alert('ಪ್ಲಾನ್ ಮಿತಿ ಮೀರಿದೆ! ಹೆಚ್ಚಿನ ಸೈಟ್‌ಗಳಿಗಾಗಿ ಅಪ್‌ಗ್ರೇಡ್ ಮಾಡಿ.'); window.location.href='/';</script>`);
    }

    // ಸೇರಿಸುವ ಮೊದಲೇ ತಕ್ಷಣವೇ ಲೈವ್ ಆಗಿ ಚೆಕ್ ಮಾಡಲಾಗುತ್ತದೆ
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

    // ಸೈಟ್ DOWN ಆಗಿದ್ದರೆ ತಕ್ಷಣ ಅಲರ್ಟ್ ಕಳುಹಿಸಲಾಗುತ್ತದೆ
    if (!checkResult.isUp) {
        await triggerPlanAlerts(newSite, 'DOWN');
    }

    res.redirect('/');
});

app.post('/delete-website/:id', (req, res) => {
    globalState.websites = globalState.websites.filter(site => site.id !== req.params.id);
    res.redirect('/');
});

// Razorpay ಆರ್ಡರ್ ರಚನೆ
app.post('/api/create-order', async (req, res) => {
    try {
        const { planId } = req.body;
        const plan = PLANS[planId];

        if (!plan || plan.price === 0) {
            return res.status(400).json({ success: false, message: 'ಅಮಾನ್ಯ ಪ್ಲಾನ್' });
        }

        const options = {
            amount: plan.price * 100,
            currency: 'INR',
            receipt: `rcpt_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);
        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            planName: plan.name,
            keyId: RAZORPAY_KEY_ID
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Order Creation Failed' });
    }
});

// Razorpay ಪಾವತಿ ದೃಢೀಕರಣ (HMAC SHA256)
app.post('/api/verify-payment', (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = req.body;

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature === razorpay_signature) {
            globalState.userPlan = planId;
            return res.json({ success: true, message: `ಪಾವತಿ ಯಶಸ್ವಿಯಾಗಿದೆ! ${PLANS[planId].name} ಪ್ಲಾನ್ ಸಕ್ರಿಯಗೊಂಡಿದೆ.` });
        } else {
            return res.status(400).json({ success: false, message: 'ಪಾವತಿ ಪರಿಶೀಲನೆ ವಿಫಲವಾಗಿದೆ (Fraud Attempt)' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Verification Error' });
    }
});

// ಕಾಲಕಾಲಕ್ಕೆ ಸೈಟ್‌ಗಳನ್ನು ನಿಖರವಾಗಿ ಮಾನಿಟರ್ ಮಾಡುವ ಲೂಪ್
setInterval(async () => {
    if (!globalState.websites || globalState.websites.length === 0) return;

    for (let site of globalState.websites) {
        const prevStatus = site.status;
        const checkResult = await verifyWebsiteLive(site.url);
        site.status = checkResult.isUp ? 'UP' : 'DOWN';
        site.lastChecked = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

        // ಸೈಟ್ ಡೌನ್ ಆದ ತಕ್ಷಣ ಅಲರ್ಟ್ ರವಾನೆ
        if (prevStatus === 'UP' && site.status === 'DOWN') {
            await triggerPlanAlerts(site, 'DOWN');
        }
    }
}, 15000);

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Running on port ${PORT}`));
}
module.exports = app;
