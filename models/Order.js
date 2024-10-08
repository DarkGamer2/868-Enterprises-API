const mongoose=require('mongoose');
const Schema=mongoose.Schema;
const dotenv=require('dotenv');
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