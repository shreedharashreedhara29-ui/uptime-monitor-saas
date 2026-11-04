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
    free: { name: 'Free', price: 0, maxSites: 1, intervalSec: 600 },
    lite: { name: 'Lite', price: 199, maxSites: 10, intervalSec: 30 },
    pro: { name: 'Pro', price: 349, maxSites: 25, intervalSec: 15 },
    ultra_pro: { name: 'Ultra Pro', price: 599, maxSites: 99999, intervalSec: 5 }
};

let globalState = {
    websites: [],
    userPlan: 'free'
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ನೈಜ SMS ಕಳುಹಿಸುವ ಫಂಕ್ಷನ್ (Fast2SMS Quick Route)
async function sendSmsAlert(phone, messageText) {
    try {
        let cleanPhone = phone.replace(/[^0-9]/g, '');
        // 91 ನೊಂದಿಗೆ ಆರಂಭವಾಗಿದ್ದರೆ ಕೊನೆಯ 10 ಸಂಖ್ಯೆಗಳನ್ನು ತೆಗೆದುಕೊಳ್ಳಿ
        if (cleanPhone.length > 10 && cleanPhone.startsWith('91')) {
            cleanPhone = cleanPhone.slice(2);
        }

        const response = await axios.post('https://www.fast2sms.com/dev/bulkV2', {
            route: 'q',
            message: messageText,
            language: 'english',
            flash: 0,
            numbers: cleanPhone
        }, {
            headers: {
                "authorization": FAST2SMS_API_KEY
            },
            timeout: 8000
        });

        console.log('Fast2SMS Result:', response.data);
    } catch (err) {
        console.error('Fast2SMS Delivery Error:', err.response ? err.response.data : err.message);
    }
}

// ಅಲರ್ಟ್ ವಿತರಣಾ ಎಂಜಿನ್
async function triggerPlanAlerts(site, statusText) {
    const plan = globalState.userPlan || 'free';
    const alertMsg = `Pingbaba Alert: Your website ${site.name} is ${statusText}! Check dashboard.`;
    const cleanPhone = site.phone ? site.phone.replace(/[^0-9]/g, '') : '';

    // 1. WhatsApp Alert (Lite, Pro, Ultra Pro)
    if (['lite', 'pro', 'ultra_pro'].includes(plan) && cleanPhone) {
        try {
            await axios.get(`https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encodeURIComponent(alertMsg)}&apikey=free`, { timeout: 4000 });
        } catch (e) {
            console.log('WhatsApp Trigger Log');
        }
    }

    // 2. Real SMS Alert (Pro ಮತ್ತು Ultra Pro ಗೆ ಮಾತ್ರ)
    if (['pro', 'ultra_pro'].includes(plan) && cleanPhone) {
        await sendSmsAlert(cleanPhone, alertMsg);
    }
}

// ನೈಜ HTTP ವೆಬ್‌ಸೈಟ್ ಚೆಕರ್
async function verifyWebsiteLive(targetUrl) {
    let formattedUrl = targetUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = 'https://' + formattedUrl;
    }

    try {
        await axios.get(formattedUrl, {
            timeout: 5000,
            headers: { 'User-Agent': 'Pingbaba-Uptime-Bot/2.0' },
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
    const currentPlan = PLANS[globalState.userPlan || 'free'];

    if (globalState.websites.length >= currentPlan.maxSites) {
        return res.send(`<script>alert('ಪ್ಲಾನ್ ಮಿತಿ ಮೀರಿದೆ! ದಯವಿಟ್ಟು ಅಪ್‌ಗ್ರೇಡ್ ಮಾಡಿ.'); window.location.href='/';</script>`);
    }

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

    // ವೆಬ್‌ಸೈಟ್ DOWN ಆಗಿದ್ದರೆ ತಕ್ಷಣವೇ SMS / ಅಲರ್ಟ್ ರವಾನೆ
    if (!checkResult.isUp) {
        await triggerPlanAlerts(newSite, 'DOWN');
    }

    res.redirect('/');
});

app.post('/delete-website/:id', (req, res) => {
    globalState.websites = globalState.websites.filter(site => site.id !== req.params.id);
    res.redirect('/');
});

app.post('/api/create-order', async (req, res) => {
    try {
        const { planId } = req.body;
        const plan = PLANS[planId];

        if (!plan || plan.price === 0) {
            return res.status(400).json({ success: false, message: 'Invalid plan' });
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
            return res.status(400).json({ success: false, message: 'Payment verification failed' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Verification Error' });
    }
});

// ನಿಯಮಿತ ತಪಾಸಣಾ ಚಕ್ರ
setInterval(async () => {
    if (!globalState.websites || globalState.websites.length === 0) return;

    for (let site of globalState.websites) {
        const prevStatus = site.status;
        const checkResult = await verifyWebsiteLive(site.url);
        site.status = checkResult.isUp ? 'UP' : 'DOWN';
        site.lastChecked = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

        if (prevStatus === 'UP' && site.status === 'DOWN') {
            await triggerPlanAlerts(site, 'DOWN');
        }
    }
}, 15000);

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Running on port ${PORT}`));
}
module.exports = app;
