const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const Razorpay = require('razorpay');

const app = express();
const PORT = process.env.PORT || 3000;

// Razorpay ಕಾನ್ಫಿಗರೇಶನ್ (Vercel Environment Variables ಮೂಲಕ ಬರುತ್ತದೆ)
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'secret_placeholder';

const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
});

// ಪ್ಲಾನ್‌ಗಳ ನಿಖರ ವಿವರ ಮತ್ತು ನಿಯಮಗಳು
const PLANS = {
    free: { name: 'Free', price: 0, maxSites: 1, intervalSec: 600 },
    lite: { name: 'Lite', price: 199, maxSites: 10, intervalSec: 30 },
    pro: { name: 'Pro', price: 349, maxSites: 25, intervalSec: 15 },
    ultra_pro: { name: 'Ultra Pro', price: 599, maxSites: 99999, intervalSec: 5 }
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const DB_FILE = path.join(__dirname, 'database.json');

// ಡೇಟಾಬೇಸ್ ಓದುವ ಫಂಕ್ಷನ್
function getDatabase() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            const initial = { websites: [], userPlan: 'free' };
            fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
            return initial;
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return { websites: [], userPlan: 'free' };
    }
}

// ಡೇಟಾಬೇಸ್ ಸೇವ್ ಮಾಡುವ ಫಂಕ್ಷನ್
function saveDatabase(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Database write error:', e);
    }
}

// ಮುಖ್ಯ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಪೇಜ್
app.get('/', (req, res) => {
    const db = getDatabase();
    res.render('dashboard', {
        websites: db.websites || [],
        userPlan: db.userPlan || 'free',
        plans: PLANS,
        razorpayKeyId: RAZORPAY_KEY_ID
    });
});

// ವೆಬ್‌ಸೈಟ್ ಸೇರಿಸುವ API (ಪ್ಲಾನ್ ಮಿತಿ ತಪಾಸಣೆ ಒಳಗೊಂಡಿದೆ)
app.post('/add-website', (req, res) => {
    const { name, url, phone } = req.body;
    const db = getDatabase();
    const currentPlan = PLANS[db.userPlan || 'free'];

    if (db.websites.length >= currentPlan.maxSites) {
        return res.send(`<script>alert('ಪ್ಲಾನ್ ಮಿತಿ ಮೀರಿದೆ! ದಯವಿಟ್ಟು ಹೆಚ್ಚಿನ ವೆಬ್‌ಸೈಟ್‌ಗಳಿಗಾಗಿ ಪ್ಲಾನ್ ಅಪ್‌ಗ್ರೇಡ್ ಮಾಡಿ.'); window.location.href='/';</script>`);
    }

    const newSite = {
        id: Date.now().toString(),
        name: name.trim(),
        url: url.trim(),
        phone: phone.trim(),
        status: 'PENDING',
        lastChecked: 'Just added'
    };

    db.websites.push(newSite);
    saveDatabase(db);
    res.redirect('/');
});

// ವೆಬ್‌ಸೈಟ್ ಡಿಲೀಟ್ ಮಾಡುವ API
app.post('/delete-website/:id', (req, res) => {
    const db = getDatabase();
    db.websites = db.websites.filter(site => site.id !== req.params.id);
    saveDatabase(db);
    res.redirect('/');
});

// 1. Razorpay ಆರ್ಡರ್ ಕ್ರಿಯೇಟ್ ಮಾಡುವ API
app.post('/api/create-order', async (req, res) => {
    try {
        const { planId } = req.body;
        const plan = PLANS[planId];

        if (!plan || plan.price === 0) {
            return res.status(400).json({ success: false, message: 'Invalid plan' });
        }

        const options = {
            amount: plan.price * 100, // ಪೈಸೆಗಳಲ್ಲಿ (₹199 = 19900)
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
        console.error('Razorpay order creation error:', err);
        res.status(500).json({ success: false, message: 'ಆರ್ಡರ್ ಕ್ರಿಯೇಟ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಿಲ್ಲ' });
    }
});

// 2. Razorpay ಪೇಮೆಂಟ್ ಪರಿಶೀಲನೆ (100% ಫ್ರಾಡ್-ಪ್ರೂಫ್ HMAC SHA256 Verification)
app.post('/api/verify-payment', (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = req.body;

        // Razorpay ಅಧಿಕೃತ ಸಿಗ್ನೇಚರ್ ಚೆಕ್
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature === razorpay_signature) {
            // ಪೇಮೆಂಟ್ ಅಸಲಿ ಎಂದು ದೃಢಪಟ್ಟಿದೆ - ಪ್ಲಾನ್ ಅಪ್‌ಗ್ರೇಡ್ ಮಾಡಿ
            const db = getDatabase();
            db.userPlan = planId;
            saveDatabase(db);
            return res.json({ success: true, message: 'ಪೇಮೆಂಟ್ ಯಶಸ್ವಿಯಾಗಿದೆ ಮತ್ತು ಪ್ಲಾನ್ ಸಕ್ರಿಯಗೊಂಡಿದೆ!' });
        } else {
            // ಫೇಕ್ ಪೇಮೆಂಟ್ ರಿಜೆಕ್ಟ್ ಮಾಡಿ
            return res.status(400).json({ success: false, message: 'ಪೇಮೆಂಟ್ ಪರಿಶೀಲನೆ ವಿಫಲವಾಗಿದೆ (Fraud Attempt)' });
        }
    } catch (err) {
        console.error('Verification error:', err);
        res.status(500).json({ success: false, message: 'Verification Error' });
    }
});

// ಸರ್ವರ್ ಮಾನಿಟರಿಂಗ್ ಬ್ಯಾಕ್‌ಗ್ರೌಂಡ್ ವರ್ಕರ್
setInterval(async () => {
    const db = getDatabase();
    if (!db.websites || db.websites.length === 0) return;

    for (let site of db.websites) {
        try {
            const response = await axios.get(site.url, { timeout: 8000 });
            site.status = (response.status >= 200 && response.status < 400) ? 'UP' : 'DOWN';
        } catch (e) {
            site.status = 'DOWN';
        }
        site.lastChecked = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
    }
    saveDatabase(db);
}, 15000);

app.listen(PORT, () => {
    console.log(`Pingbaba running on port ${PORT}`);
});
