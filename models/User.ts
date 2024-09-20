import mongoose, { Document, Schema } from "mongoose";
import { UserInterface } from "../interface/interface";
import dotenv from "dotenv";
dotenv.config();
type UserDocument = UserInterface & Document;
mongoose.connect(`${process.env.MONGO_URI}`, {
  serverSelectionTimeoutMS: 30000, // Increase timeout to 30 seconds
});
const UserSchema: Schema = new Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  id: { type: String },
});

const User = mongoose.model<UserDocument>("User", UserSchema);

export default User;