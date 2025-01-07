const express = require("express");
const passport = require("passport");
const cors = require("cors");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const User = require("./models/User");
const configurePassport = require("./auth/passportConfig");
const Product = require("./models/Product");
const multer = require("multer");
const Grid = require("gridfs-stream");
const { GridFsStorage } = require("multer-gridfs-storage");
const mongoose = require("mongoose");
const { GridFSBucket } = require("mongodb");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const Quote = require("./models/Quote");
const Stripe = require("stripe");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandlers");
const csurf = require("csurf");
const { v4: uuidv4 } = require("uuid");
dotenv.config(); // Load environment variables from .env file

const app = express();
const stripe = new Stripe(process.env.STRIPE_KEY);
const stripeWebSecret=process.env.STRIPE_WEBHOOK_SECRET;
// CORS configuration
const corsOptions = {
  origin: ['https://mewzaline.up.railway.app', 'http://localhost:5173'], // Allow both production and localhost origins
  credentials: true, // Allow credentials (cookies, authorization headers, etc.)
  allowedHeaders: ["authorization", "Content-Type","x-csrf-token"], // Specify allowed headers
  exposedHeaders: ["authorization"], // Specify exposed headers
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE", // Specify allowed methods
  preflightContinue: false,
};

app.use(cors(corsOptions));
app.use(cookieParser()); // Place this before session and CSRF protection
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up session management
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_secret_key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === "production", httpOnly: true },
  })
);

// Initialize CSRF protection
const csrfProtection = csurf({ cookie: true });
app.use(csrfProtection);

// Middleware to set CSRF token in a cookie
app.use((req, res, next) => {
  res.cookie("XSRF-TOKEN", req.csrfToken()); // Send token as a cookie
  next();
});

// Helmet for security headers
app.use(helmet()); // Adds security headers
app.use(compression()); // Compresses response bodies

// Rate limiting middleware to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

const mongo = process.env.MONGO_URI;
mongoose
  .connect(mongo)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

const connection = mongoose.connection;

let gfs;
let gridfsBucket;

// Set up GridFS for file storage
connection.once("open", () => {
  console.log("Connected to MongoDB");
  gridfsBucket = new mongoose.mongo.GridFSBucket(connection.db, {
    bucketName: "uploads",
  });
  gfs = Grid(connection.db, mongoose.mongo);
  gfs.collection("uploads");
});

const storage = new GridFsStorage({
  url: mongo,
  file: (req, file) => {
    return { filename: file.originalname };
  },
});

const upload = multer({ storage });

app.use(passport.initialize());
app.use(passport.session());
configurePassport(); // Call the function to configure passport

// Basic route to check server status
app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Route to get CSRF token
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// User registration endpoint
app.post("/api/users/register", async (req, res) => {
  try {
    const { email, password, fullName, username } = req.body;

    const user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "User with that email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword, fullName, username });
    await newUser.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// User login endpoint
app.post("/api/users/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      console.error(err); // Log the error for debugging
      return next(err);
    }
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    req.logIn(user, (err) => {
      if (err) {
        console.error(err); // Log the error for debugging
        return next(err);
      }
      res.status(200).json({ message: "User logged in successfully", username: user.username }); // Include username in response
    });
  })(req, res, next);
});

// Fetch user profile
app.get("/api/users/profile", async (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.status(400).json({ message: "Email query parameter is required" });
  }

  try {
    const user = await User.findOne({ email }).select("-password"); // Exclude password field
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching user profile" });
  }
});

// Add a new product
app.post("/api/products/addProduct", async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    res.status(201).json({ message: "Product added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error adding product" });
  }
});

// Update an existing product
app.put("/api/products/:productId/update", async (req, res) => {
  try {
    const updatedProduct = await Product.findByIdAndUpdate(req.params.productId, req.body, { new: true });
    if (!updatedProduct) return res.status(404).json({ message: "Product not found" });

    res.status(200).json(updatedProduct);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating product" });
  }
});

// Delete a product
app.delete("/api/products/:productId/delete", async (req, res) => {
  try {
    const result = await Product.findByIdAndDelete(req.params.productId);
    if (!result) return res.status(404).json({ message: "Product not found" });

    res.status(200).json({ message: "Product deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error deleting product" });
  }
});

// Fetch all products
app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find();
    res.status(200).json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching products" });
  }
});

// Upload a file
app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ file: req.file });
});

// Request a quote
app.post("/api/request/quote", async (req, res) => {
  try {
    const quote = new Quote(req.body);
    await quote.save();
    res.status(201).json({ message: "Quote request saved successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error saving quote request" });
  }
});

// Get orders for a user
app.get("/api/users/:email/orders", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const orders = await Quote.find({ user: user._id });
    res.status(200).json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching orders" });
  }
});

//stripe session
app.post("/api/session",csrfProtection, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: req.body.items.map(item => ({
        price_data: {
          currency: "ttd",
          product_data: {
            name: item.name,
            images: [item.image],
          },
          unit_amount: item.price * 100,
        },
        quantity: item.quantity,
      })),
      success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/cancel`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Error creating session:", error);
    res.status(500).json({ message: "Error creating Stripe checkout session" });
  }
});

// Webhook endpoint
app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, stripeWebSecret);
  } catch (err) {
    console.error("Webhook error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    console.log("Session completed:", session);
  }

  res.status(200).end();
});

// Stripe checkout endpoint
app.post("/api/checkout", async (req, res) => {
  const items = req.body.items;
  let line_items = [];
  items.forEach((item) => {
    line_items.push({
      price: item.id,
      quantity: item.quantity,
    });
  });

  try {
    const session = await stripe.checkout.sessions.create({
      line_items: line_items,
      mode: "payment",
      success_url: `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/cancel`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Error creating Stripe checkout session:", error);
    res.status(500).json({ message: "Error creating Stripe checkout session" });
  }
});
  // const { items, email } = req.body; // Ensure email is sent with the request

  // if (!items || !Array.isArray(items)) {
  //     return res.status(400).json({ message: "Invalid request: items must be an array" });
  // }

  // const lineItems = items.map((product) => ({
  //     price_data: {
  //         currency: "ttd", // Ensure the currency matches your requirements
  //         product_data: {
  //             name: product.name,
  //             images: [product.image],
  //         },
  //         unit_amount: product.price * 100,
  //     },
  //     quantity: product.quantity,
  // }));

  // try {
  //     // Generate unique order ID
  //     const orderId = uuidv4();

  //     // Create a Stripe checkout session
  //     const session = await stripe.checkout.sessions.create({
  //         payment_method_types: ["card"],
  //         line_items: lineItems,
  //         mode: "payment",
  //         success_url: `${process.env.FRONTEND_URL}/success?orderId=${orderId}`,
  //         cancel_url: `${process.env.FRONTEND_URL}/cancel`,
  //     });

  //     // Save order to the database
  //     const newOrder = new Quote({
  //         orderId,
  //         email, // Save user email
  //         items,
  //         totalAmount: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
  //         status: "Pending",
  //         stripeSessionId: session.id,
  //     });

  //     await newOrder.save();

  //     res.json({ id: session.id, orderId }); // Return orderId to the frontend
  // } catch (error) {
  //     console.error("Error creating Stripe checkout session:", error);
  //     res.status(500).json({ message: "Error creating Stripe checkout session" });
  // }

// Stripe webhook endpoint
app.get("/api/orders/:orderId", async (req, res) => {
  const {orderId} = req.params;

  try{
    const order=await Quote.findOne({orderId});
    if(!order){
      return res.status(404).json({message:"Order not found"});
    }
    res.status(200).json(order);
  }
  catch(error){
    console.error(error);
    res.status(500).json({message:"Error fetching order",error});
  }
});

// Error handling middleware
app.use(notFoundHandler); // Handle 404 errors
app.use(errorHandler); // Handle other errors

const PORT = process.env.PORT || 4900;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});