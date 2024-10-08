const mongoose=require('mongoose');
const Schema=mongoose.Schema;
mongoose.connect(`${process.env.MONGO_URI}`);
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