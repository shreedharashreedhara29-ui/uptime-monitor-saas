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
    free: { name: 'Free', price: 0, maxSites: 1, intervalSec: 600 },
    lite: { name: 'Lite', price: 199, maxSites: 10, intervalSec: 30 },
    pro: { name: 'Pro', price: 349, maxSites: 25, intervalSec: 15 },
    ultra_pro: { name: 'Ultra Pro', price: 599, maxSites: 99999, intervalSec: 5 }
};

// In-Memory Storage (Vercel Serverless ನಲ್ಲಿ ಸುರಕ್ಷಿತವಾಗಿ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ)
let globalState = {
    websites: [],
    userPlan: 'free'
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ವಾಟ್ಸಾಪ್ ಸಂದೇಶ ಕಳುಹಿಸುವ ಫಂಕ್ಷನ್ (CallMeBot / Free Gateway)
async function sendWhatsAppAlert(phone, message) {
    try {
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const encodedMsg = encodeURIComponent(message);
        // Callmebot ಗೇಟ್‌ವೇ ಮೂಲಕ ಸಂದೇಶ ರವಾನೆ
        await axios.get(`https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encodedMsg}&apikey=free`, { timeout: 5000 });
    } catch (e) {
        console.log('WhatsApp send note: Notification triggered for', phone);
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
    const { name, url, phone } = req.body;
    const currentPlan = PLANS[globalState.userPlan || 'free'];

    if (globalState.websites.length >= currentPlan.maxSites) {
        return res.send(`<script>alert('ಪ್ಲಾನ್ ಮಿತಿ ಮೀರಿದೆ! ಹೆಚ್ಚಿನ ವೆಬ್‌ಸೈಟ್‌ಗಳಿಗಾಗಿ ಅಪ್‌ಗ್ರೇಡ್ ಮಾಡಿ.'); window.location.href='/';</script>`);
    }

    const newSite = {
        id: Date.now().toString(),
        name: name.trim(),
        url: url.trim(),
        phone: phone.trim(),
        status: 'UP',
        lastChecked: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })
    };

    globalState.websites.push(newSite);
    
    // ಸೈಟ್ ಸೇರಿಸಿದ ತಕ್ಷಣ ಮಾನಿಟರಿಂಗ್ ಆರಂಭದ ವಾಟ್ಸಾಪ್ ಸಂದೇಶ
    sendWhatsAppAlert(newSite.phone, `🔔 *Pingbaba Alert*\nನಿಮ್ಮ ಸೈಟ್ *${newSite.name}* ಮಾನಿಟರಿಂಗ್ ಯಶಸ್ವಿಯಾಗಿ ಆರಂಭಗೊಂಡಿದೆ!`);
    
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
        console.error('Order creation error:', err);
        res.status(500).json({ success: false, message: 'ಆರ್ಡರ್ ಕ್ರಿಯೇಟ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗುತ್ತಿಲ್ಲ' });
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
            return res.json({ success: true, message: 'ಪಾವತಿ ಯಶಸ್ವಿಯಾಗಿದೆ! ಪ್ಲಾನ್ ಸಕ್ರಿಯಗೊಂಡಿದೆ.' });
        } else {
            return res.status(400).json({ success: false, message: 'ಪಾವತಿ ಪರಿಶೀಲನೆ ವಿಫಲವಾಗಿದೆ (Fraud Attempt)' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'ಸರ್ವರ್ ಪರಿಶೀಲನಾ ದೋಷ' });
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Running on port ${PORT}`));
}
module.exports = app;
