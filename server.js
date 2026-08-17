const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');

const User = require('./models/User');
const PatientDetail = require('./models/PatientDetail');
const Appointment = require('./models/Appointment');
const Prescription = require('./models/Prescription');
const Billing = require('./models/Billing');
const Task = require('./models/Task');
const Feedback = require('./models/Feedback');

const app = express();
// const mongoUrl = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hospital';
const mongoUrl = process.env.MONGO_URI || 'mongodb://localhost:27017/hospital';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

app.use(session({
  secret: 'hospital-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl }),
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.session.role !== role) {
      return res.redirect('/');
    }
    next();
  };
}

app.get('/', (req, res) => {
  res.render('index', { error: null });
});

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

app.post('/signup', async (req, res) => {
  const { name, email, password, role, specialization } = req.body;

  if (!name || !email || !password || !role) {
    return res.render('index', { error: 'All required fields must be filled' });
  }

  const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
  if (existingUser) {
    return res.render('index', { error: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    role,
    specialization: role === 'doctor' ? specialization.trim() : ''
  });

  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.get('/profile', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId);
  res.render('profile', { user });
});

app.get('/admin', requireLogin, requireRole('admin'), async (req, res) => {
  const patientCount = await User.countDocuments({ role: 'patient' });
  const doctorCount = await User.countDocuments({ role: 'doctor' });
  const appointmentCount = await Appointment.countDocuments();
  const taskCount = await Task.countDocuments();
  const openTasks = await Task.countDocuments({ status: 'Open' });
  const overdueTasks = await Task.countDocuments({ status: 'Overdue' });
  const doctors = await User.find({ role: 'doctor' });

  const doctorPerformance = await Appointment.aggregate([
    { $group: { _id: '$doctor', total: { $sum: 1 }, approved: { $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] } } } },
    { $sort: { approved: -1 } },
    { $limit: 5 },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'doctorInfo' } },
    { $unwind: { path: '$doctorInfo', preserveNullAndEmptyArrays: true } },
    { $project: { doctorName: '$doctorInfo.name', total: 1, approved: 1 } }
  ]);

  const tasks = await Task.find().populate('assignedTo');
  const totalBilling = await Billing.countDocuments();
  const pendingBilling = await Billing.countDocuments({ status: 'Pending' });
  const paidBilling = await Billing.countDocuments({ status: 'Paid' });
  const billedAmount = await Billing.aggregate([
    { $group: { _id: null, totalAmount: { $sum: '$amount' } } }
  ]);

  res.render('admin', {
    user: req.session.userName,
    patientCount,
    doctorCount,
    appointmentCount,
    taskCount,
    openTasks,
    overdueTasks,
    doctorPerformance,
    tasks,
    doctors,
    totalBilling,
    pendingBilling,
    paidBilling,
    billedAmount: billedAmount[0] ? billedAmount[0].totalAmount : 0
  });
});

app.post('/tasks', requireLogin, requireRole('admin'), async (req, res) => {
  const { title, description, assignedTo, deadline } = req.body;
  await Task.create({ title, description, assignedTo, deadline: new Date(deadline) });
  res.redirect('/admin');
});

app.post('/tasks/:id/status', requireLogin, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  await Task.findByIdAndUpdate(id, { status });
  res.redirect('/admin');
});

app.get('/users', requireLogin, requireRole('admin'), async (req, res) => {
  const users = await User.find();
  res.render('users', { users });
});

app.get('/doctor', requireLogin, requireRole('doctor'), async (req, res) => {
  const patients = await User.find({ role: 'patient' }).limit(6);
  const appointments = await Appointment.find({ doctor: req.session.userId })
    .populate('patient')
    .sort({ appointmentDate: 1 });

  const statusCounts = { pending: 0, approved: 0, rejected: 0 };
  appointments.forEach(app => {
    statusCounts[app.status.toLowerCase()] = (statusCounts[app.status.toLowerCase()] || 0) + 1;
  });

  const upcomingAppointments = appointments.filter(app => new Date(app.appointmentDate) >= new Date()).slice(0, 5);

  const notifications = [
    { title: 'New message', message: 'Patient John Doe sent a new message.', time: '3m ago' },
    { title: 'Lab update', message: 'Blood test completed for Sarah Lee.', time: '18m ago' },
    { title: 'Reminder', message: 'Review the surgery notes for Mark.', time: '1h ago' }
  ];

  const pendingPayments = await Billing.countDocuments({ doctor: req.session.userId, status: 'Pending' });
  const paidPayments = await Billing.countDocuments({ doctor: req.session.userId, status: 'Paid' });
  const totalPatientBillAmount = await Billing.aggregate([
    { $match: { doctor: req.session.userId } },
    { $group: { _id: null, totalAmount: { $sum: '$amount' } } }
  ]);

  res.render('doctor', {
    user: req.session.userName,
    patients,
    upcomingAppointments,
    notifications,
    statusCounts,
    graphData: [statusCounts.approved, statusCounts.pending, statusCounts.rejected],
    pendingPayments,
    paidPayments,
    totalPatientBillAmount: totalPatientBillAmount[0] ? totalPatientBillAmount[0].totalAmount : 0
  });
});

app.get('/search-patients', requireLogin, requireRole('doctor'), async (req, res) => {
  const { name = '' } = req.query;
  const patients = name
    ? await User.find({ role: 'patient', name: new RegExp(name, 'i') })
    : [];
  res.render('search_patients', { patients, name });
});

app.get('/patient', requireLogin, requireRole('patient'), async (req, res) => {
  const upcomingAppointments = await Appointment.find({ patient: req.session.userId, appointmentDate: { $gte: new Date() } })
    .populate('doctor')
    .sort({ appointmentDate: 1 })
    .limit(5);
  const doctors = await User.find({ role: 'doctor' }).limit(4);
  const details = await PatientDetail.findOne({ user: req.session.userId });
  const bills = await Billing.find({ patient: req.session.userId }).sort({ createdAt: -1 });

  const healthMetrics = {
    weight: details ? [details.weight - 4, details.weight - 2, details.weight] : [72, 74, 73],
    bp: details ? [118, 122, 120] : [120, 118, 119]
  };

  const recentFeedback = await Feedback.find({ patient: req.session.userId }).sort({ createdAt: -1 }).limit(3).populate('doctor');
  const pendingBillCount = bills.filter(b => b.status === 'Pending').length;
  const paidBillCount = bills.filter(b => b.status === 'Paid').length;
  const outstandingAmount = bills.filter(b => b.status === 'Pending').reduce((sum, bill) => sum + bill.amount, 0);
  const latestBill = bills[0] || null;

  res.render('patient', {
    user: req.session.userName,
    upcomingAppointments,
    doctors,
    details,
    healthMetrics,
    recentFeedback,
    bills,
    pendingBillCount,
    paidBillCount,
    outstandingAmount,
    latestBill
  });
});

app.post('/feedback', requireLogin, requireRole('patient'), async (req, res) => {
  const { rating, comments, doctorId } = req.body;
  await Feedback.create({
    patient: req.session.userId,
    doctor: doctorId || null,
    rating: Number(rating),
    comments: comments.trim()
  });
  res.redirect('/patient');
});

app.get('/add-bill', requireLogin, requireRole('admin'), async (req, res) => {
  const patients = await User.find({ role: 'patient' });
  res.render('add_bill', { patients });
});

app.post('/add-bill', requireLogin, requireRole('admin'), async (req, res) => {
  const { patientId, amount, status } = req.body;
  const patient = await User.findById(patientId);
  if (!patient) {
    return res.redirect('/add-bill');
  }

  await Billing.create({
    patient: patient._id,
    amount: Number(amount),
    status
  });
  res.redirect('/admin');
});

app.get('/view-billing', requireLogin, requireRole('admin'), async (req, res) => {
  const bills = await Billing.find().populate('patient');
  res.render('view_billing', { bills });
});

app.get('/add-prescription', requireLogin, requireRole('doctor'), async (req, res) => {
  const patients = await User.find({ role: 'patient' });
  res.render('add_prescription', { patients });
});

app.post('/add-prescription', requireLogin, requireRole('doctor'), async (req, res) => {
  const { patientId, medicines, notes, amount } = req.body;
  const patient = await User.findById(patientId);
  const doctor = await User.findById(req.session.userId);
  const billAmount = Number(amount);

  if (!patient || !doctor || Number.isNaN(billAmount) || billAmount < 0) {
    return res.redirect('/add-prescription');
  }

  const prescription = await Prescription.create({
    patient: patient._id,
    doctor: doctor._id,
    medicines: medicines.trim(),
    notes: notes.trim(),
    amount: billAmount
  });

  await Billing.create({
    patient: patient._id,
    doctor: doctor._id,
    amount: billAmount,
    source: 'Prescription'
  });

  res.redirect('/doctor');
});

app.get('/book-appointment', requireLogin, requireRole('patient'), async (req, res) => {
  const doctors = await User.find({ role: 'doctor' });
  res.render('book_appointment', { doctors, patientName: req.session.userName });
});

app.post('/book-appointment', requireLogin, requireRole('patient'), async (req, res) => {
  const { doctorId, appointmentDate } = req.body;
  const patient = await User.findById(req.session.userId);
  const doctor = await User.findById(doctorId);

  if (!patient || !doctor) {
    return res.redirect('/book-appointment');
  }

  await Appointment.create({
    patient: patient._id,
    doctor: doctor._id,
    appointmentDate: new Date(appointmentDate),
    status: 'Pending'
  });

  res.redirect('/patient');
});

app.get('/view-appointments', requireLogin, async (req, res) => {
  const query = req.session.role === 'doctor'
    ? { doctor: req.session.userId }
    : {};

  const appointments = await Appointment.find(query)
    .populate('patient')
    .populate('doctor');

  res.render('appointments', { appointments });
});

app.get('/appointments', requireLogin, requireRole('doctor'), async (req, res) => {
  const appointments = await Appointment.find({ doctor: req.session.userId })
    .populate('patient')
    .populate('doctor');
  res.render('appointments', { appointments });
});

app.get('/update-status/:id/:status', requireLogin, async (req, res) => {
  const { id, status } = req.params;
  const appointment = await Appointment.findById(id).populate('doctor');

  if (!appointment) {
    return res.redirect('/appointments');
  }

  if (req.session.role !== 'doctor' && req.session.role !== 'admin') {
    return res.redirect('/');
  }

  if (req.session.role === 'doctor' && !appointment.doctor._id.equals(req.session.userId)) {
    return res.redirect('/');
  }

  appointment.status = status;
  await appointment.save();
  res.redirect('/appointments');
});

app.get('/patient-info/:patientId', requireLogin, async (req, res) => {
  const patient = await User.findById(req.params.patientId);
  if (!patient) {
    return res.redirect('/');
  }

  const patientDetails = await PatientDetail.findOne({ user: patient._id });
  const appointments = await Appointment.find({ patient: patient._id });
  const prescriptions = await Prescription.find({ patient: patient._id }).populate('doctor');
  const billing = await Billing.find({ patient: patient._id });

  res.render('patient_info', {
    patient,
    patientDetails,
    appointments,
    prescriptions,
    billing
  });
});

app.get('/my-appointments', requireLogin, requireRole('patient'), async (req, res) => {
  const appointments = await Appointment.find({ patient: req.session.userId }).populate('doctor');
  res.render('my_appointments', { appointments });
});

app.get('/view-prescription', requireLogin, requireRole('patient'), async (req, res) => {
  const prescriptions = await Prescription.find({ patient: req.session.userId }).populate('doctor');
  res.render('view_prescription', { prescriptions });
});

app.get('/view-patient-details', requireLogin, requireRole('doctor'), async (req, res) => {
  const details = await PatientDetail.find().populate('user');
  res.render('view_patient_details', { details });
});

app.get('/add-patient-details', requireLogin, requireRole('patient'), (req, res) => {
  res.render('add_patient_details');
});

app.post('/add-patient-details', requireLogin, requireRole('patient'), async (req, res) => {
  const { age, gender, weight, contact, guardian } = req.body;
  await PatientDetail.findOneAndUpdate(
    { user: req.session.userId },
    {
      age: Number(age),
      gender,
      weight: Number(weight),
      contact: contact.trim(),
      guardianContact: guardian.trim(),
      user: req.session.userId
    },
    { upsert: true, new: true }
  );
  res.redirect('/patient');
});

app.get('/my-details', requireLogin, requireRole('patient'), async (req, res) => {
  const details = await PatientDetail.findOne({ user: req.session.userId });
  res.render('my_details', { details });
});

app.get('/pay-bill', requireLogin, requireRole('patient'), async (req, res) => {
  const bills = await Billing.find({ patient: req.session.userId }).sort({ createdAt: -1 }).populate('doctor', 'name');
  res.render('pay_bill', { bills });
});

app.get('/payment-page/:id', requireLogin, requireRole('patient'), async (req, res) => {
  const bill = await Billing.findOne({ _id: req.params.id, patient: req.session.userId });
  if (!bill || bill.status !== 'Pending') {
    return res.redirect('/pay-bill');
  }
  res.render('payment_page', { bill });
});

app.post('/pay-now/:id', requireLogin, requireRole('patient'), async (req, res) => {
  const bill = await Billing.findOne({ _id: req.params.id, patient: req.session.userId });
  if (!bill || bill.status !== 'Pending') {
    return res.redirect('/pay-bill');
  }

  bill.status = 'Paid';
  bill.transactionId = `TXN${Math.floor(10000 + Math.random() * 90000)}`;
  await bill.save();

  res.redirect(`/payment-success/${bill._id}?txn=${bill.transactionId}`);
});

app.get('/payment-success/:id', requireLogin, requireRole('patient'), async (req, res) => {
  const bill = await Billing.findOne({ _id: req.params.id, patient: req.session.userId });
  if (!bill) {
    return res.redirect('/pay-bill');
  }

  res.render('payment_success', { bill, txn: req.query.txn });
});

app.get('/receipt/:id', requireLogin, requireRole('patient'), async (req, res) => {
  const bill = await Billing.findOne({ _id: req.params.id, patient: req.session.userId }).populate('patient');
  if (!bill) {
    return res.redirect('/pay-bill');
  }

  res.render('receipt', { bill, txn: req.query.txn });
});

app.get('*', (req, res) => {
  res.redirect('/');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
