import mongoose, { Schema } from "mongoose";
import dotenv from "dotenv";
dotenv.config();
mongoose.connect(`${process.env.MONGO_URI}`)

const orderSchema=new Schema({
    userId:{type:Schema.Types.ObjectId,ref:"User",required:true},
    accountName:String,
    products:Array,
    orderDate:Date.toString()
})

const Order=mongoose.model('Order',orderSchema);
module.exports=Order;