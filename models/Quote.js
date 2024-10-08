import mongoose from "mongoose";
import { Schema } from "mongoose";

const quoteSchema=new Schema({
    // quote:String,
    // author:String,
    // date:Date,
    // productId:Schema.Types.ObjectId,
    firstName:String,
    lastName:String,
    email:String,
    quote:String,
    productId:Schema.Types.ObjectId,
})

const Quote=mongoose.model('Quote',quoteSchema);
module.exports=Quote;