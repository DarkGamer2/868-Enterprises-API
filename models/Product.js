import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
const Schema=mongoose.Schema;

const productSchema=new Schema({
productName:String,
productPrice:Number,
productDescription:String,
productImage:String,
productCategory:String,
productBrand:String,
})

const Product=mongoose.model('Product',productSchema);
module.exports=Product;