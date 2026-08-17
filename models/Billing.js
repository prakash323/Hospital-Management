require('dotenv').config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');

// Models
const User = require('./models/User');
const PatientDetail = require('./models/PatientDetail');
const Appointment = require('./models/Appointment');
const Prescription = require('./models/Prescription');
const Billing = require('./models/Billing');
const Task = require('./models/Task');
const Feedback = require('./models/Feedback');

const app = express();

// ✅ MongoDB connection (ONLY ONCE)
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('❌ MongoDB error:', err);
    process.exit(1);
  });

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Session config (fixed)
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI
  }),
  cookie: {
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// =========================
// 🔐 AUTH MIDDLEWARE
// =========================
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect('/');
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.session.role !== role) return res.redirect('/');
    next();
  };
}

// =========================
// 🏠 ROUTES
// =========================

// Home
app.get('/', (req, res) => {
  res.render('index', { error: null });
});

// Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase().trim() });

  if (!user) {
    return res.render('index', { error: 'Invalid email or password' });
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);

  if (!validPassword) {
    return res.render('index', { error: 'Invalid email or password' });
  }

  req.session.userId = user._id;
  req.session.role = user.role;
  req.session.userName = user.name;

  if (user.role === 'admin') return res.redirect('/admin');
  if (user.role === 'doctor') return res.redirect('/doctor');
  return res.redirect('/patient');
});

// Signup
app.post('/signup', async (req, res) => {
  const { name, email, password, role, specialization } = req.body;

  if (!name || !email || !password || !role) {
    return res.render('index', { error: 'All fields required' });
  }

  const existing = await User.findOne({ email });

  if (existing) {
    return res.render('index', { error: 'Email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await User.create({
    name,
    email,
    passwordHash,
    role,
    specialization: role === 'doctor' ? specialization : ''
  });

  res.redirect('/');
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// =========================
// 👨‍⚕️ SAMPLE DASHBOARD
// =========================

app.get('/admin', requireLogin, requireRole('admin'), async (req, res) => {
  const users = await User.countDocuments();
  const appointments = await Appointment.countDocuments();

  res.render('admin', {
    user: req.session.userName,
    users,
    appointments
  });
});

// =========================
// ❌ FALLBACK
// =========================
app.get('*', (req, res) => {
  res.redirect('/');
});

// =========================
// 🚀 SERVER
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});