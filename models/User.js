const mongoose = require("mongoose");
const { Schema } = mongoose;
const dotenv = require("dotenv");
dotenv.config();

mongoose.connect(`${process.env.MONGO_URI}`, {
  serverSelectionTimeoutMS: 30000, // Increase timeout to 30 seconds
});

const UserSchema = new Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  id: { type: String },
});

const User = mongoose.model("User", UserSchema);

module.exports = User;