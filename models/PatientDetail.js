const mongoose = require('mongoose');

const patientDetailSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  age: { type: Number, required: true },
  gender: { type: String, required: true },
  weight: { type: Number, required: true },
  contact: { type: String, required: true },
  guardianContact: { type: String, required: true }
});

module.exports = mongoose.model('PatientDetail', patientDetailSchema);
