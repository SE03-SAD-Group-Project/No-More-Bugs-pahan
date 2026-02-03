const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// Gmail API Dependencies
const nodemailer = require('nodemailer'); // ✅ Defines nodemailer once here
const { google } = require('googleapis');
const multer = require('multer');

const app = express();
app.use(express.json());
app.use(cors());

// Configure Multer for file uploads (Attachments)
const upload = multer({ storage: multer.memoryStorage() });

// --- 1. DATABASE CONNECTION ---
mongoose.connect('mongodb+srv://amodamendis:amodamendis@nomorebugsfulldb.juucjmo.mongodb.net/nomorebugsfulldb?appName=nomorebugsfulldb')
.then(() => console.log("✅ Connected to MongoDB"))
.catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- 2. USER MODEL (For Admins) ---
const UserSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true } 
});

const UserModel = mongoose.model("admin_details", UserSchema);

// --- 3. REGISTER ROUTE ---
app.post('/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        const existingUser = await UserModel.findOne({ email });
        if (existingUser) {
            return res.json({ status: 'error', message: 'Email already exists' });
        }
        await UserModel.create({ fullName, email, password });
        res.json({ status: 'ok', message: 'Registration Successful' });
    } catch (err) {
        res.json({ status: 'error', message: 'Database Error' });
    }
});

// --- 4. LOGIN ROUTE ---
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await UserModel.findOne({ email });
        
        if (user) {
            if (user.password === password) {
                res.json({ status: 'ok', name: user.fullName });
            } else {
                res.json({ status: 'error', message: 'Wrong Password' });
            }
        } else {
            res.json({ status: 'error', message: 'User not found' });
        }
    } catch (err) {
        res.json({ status: 'error', message: 'Database Error' });
    }
});

// ======================================================
// 👇 REQUEST MODEL (Matches your DB Screenshot) 👇
// ======================================================

// --- 5. REQUEST MODEL ---
const RequestSchema = new mongoose.Schema({
    username: String,       
    email: String,
    contactNo: String,
    businessName: String,
    address: String,
    city: String,           
    postalcode: String, // Lowercase matches your DB
    bugType: String,       
    paymentStatus: { type: String, default: "Unpaid" },
    status: { type: String, default: "Pending" } 
});

const RequestModel = mongoose.model("reports", RequestSchema);

// --- 6. GET REPORTS ROUTE ---
app.get('/get-reports', async (req, res) => {
    try {
        const allRequests = await RequestModel.find({});
        res.json(allRequests);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ==========================================
//  PART 3: WORKER MODEL 
// ==========================================

const WorkerSchema = new mongoose.Schema({
    fullName: String,
    address: String,
    sex: String,
    birthday: String,
    mobile: String,       
    email: String,
    password: String,     
    jobPosition: String,  
    skills: Array,
    status: { type: String, default: "pending" },
    registeredAt: Date
});

const WorkerModel = mongoose.model("worker_details", WorkerSchema);

// --- API ENDPOINTS FOR WORKERS ---

app.get('/get-workers', async (req, res) => {
    try {
        const workers = await WorkerModel.find({});
        res.json(workers);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.put('/verify-worker/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await WorkerModel.findByIdAndUpdate(id, { status: "Verified" });
        res.json({ status: "ok" });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.delete('/delete-worker/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await WorkerModel.findByIdAndDelete(id);
        res.json({ status: "ok" });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ==========================================
//  PART 4: GMAIL API INTEGRATION
// ==========================================

// We use standard Nodemailer now (No complex OAuth2 needed)
// ⚠️ DELETED DUPLICATE REQUIRE HERE TO PREVENT CRASH

app.post('/send-email', upload.single('attachment'), async (req, res) => {
    try {
        const { to, subject, text } = req.body;
        const file = req.file; 

        // 1. Configure the Transporter (The Login)
        const transport = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                // 👇 PUT YOUR NEW EMAIL HERE
                user: 'nomorebugsmails@gmail.com', 
                
                // 👇 PUT THE 16-LETTER APP PASSWORD HERE
                pass: 'rrzr jvmd mzqh vqrt'    
            }
        });

        // 2. Configure the Email Details
        const mailOptions = {
            // This makes it look professional even from a bot account
            from: 'No More Bugs Team <nomorebugsmails@gmail.com>', 
            to: to,
            subject: subject,
            text: text,
            attachments: file ? [
                {
                    filename: file.originalname,
                    content: file.buffer
                }
            ] : []
        };

        // 3. Send It!
        const result = await transport.sendMail(mailOptions);
        console.log("✅ Email sent successfully:", result.messageId);
        res.json({ status: 'ok', result });

    } catch (error) {
        console.error("❌ Email Error:", error);
        res.json({ status: 'error', message: error.message });
    }
});

// ==========================================
//  PART 5: PAID CUSTOMERS (From 'Done' Button)
// ==========================================

const PaidCustomerSchema = new mongoose.Schema({
    customerName: String,
    email: String,
    paymentStatus: String,
    savedAt: { type: Date, default: Date.now }
});

// ✅ UPDATED to 'payed_customers_for_services' (Plural, matches your screenshot)
const PaidCustomerModel = mongoose.model("payed_customers_for_services", PaidCustomerSchema);

// A. Save Customer (Done Button)
app.post('/add-to-paid', async (req, res) => {
    try {
        const { customerName, email, paymentStatus } = req.body;
        await PaidCustomerModel.create({ customerName, email, paymentStatus });
        res.json({ status: 'ok', message: 'Saved successfully!' });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
});

// B. ✅ NEW: Get All Paid Customers (For Payments Tab)
app.get('/get-paid-customers', async (req, res) => {
    try {
        const customers = await PaidCustomerModel.find({});
        res.json(customers);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ==========================================
//  ✅ PART 6: APPROVED PAYMENTS (New Collection)
// ==========================================

const ApprovedPaymentSchema = new mongoose.Schema({
    slipId: String,
    customerName: String,
    email: String,
    amount: String,
    paymentStatus: String,
    approvedAt: { type: Date, default: Date.now }
});

// Creates 'Service_approved_payments' collection in MongoDB
const ApprovedPaymentModel = mongoose.model("Service_approved_payments", ApprovedPaymentSchema);

app.post('/approve-payment', async (req, res) => {
    try {
        const { slipId, customerName, email, amount, paymentStatus } = req.body;
        await ApprovedPaymentModel.create({ slipId, customerName, email, amount, paymentStatus });
        res.json({ status: 'ok', message: 'Payment Approved and Saved!' });
    } catch (err) {
        res.json({ status: 'error', message: err.message });
    }
});



// ... existing code ...

// ==========================================
//  🟢 PART 7: CUSTOMERS (Users Collection)
// ==========================================

// 1. Define Schema matches your 'users' collection
const CustomerUserSchema = new mongoose.Schema({
    name: String,
    email: String,
    password: String,
    // Default status if missing in DB
    status: { type: String, default: "Active" } 
});

// 2. Connect to the 'users' collection
const CustomerUserModel = mongoose.model("users", CustomerUserSchema);

// --- API: Get All Customers ---
app.get('/get-customers', async (req, res) => {
    try {
        const customers = await CustomerUserModel.find({});
        res.json(customers);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// --- API: Toggle Ban Status ---
app.put('/toggle-customer-status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // Expecting "Active" or "Banned"
        await CustomerUserModel.findByIdAndUpdate(id, { status: status });
        res.json({ status: "ok" });
    } catch (err) {
        res.json({ error: err.message });
    }
});




// --- 7. START SERVER ---
app.listen(3001, () => {
    console.log("🚀 Server is running on port 3001");
});