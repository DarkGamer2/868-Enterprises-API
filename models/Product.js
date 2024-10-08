const mongoose=require('mongoose');
const dotenv=require('dotenv');
dotenv.config();
const Schema=mongoose.Schema;
mongoose.connect(`${process.env.MONGO_URI}`)

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