import express, { Express, Request, Response, NextFunction } from "express";
import passport from "passport";
import cors from "cors";
import session from "express-session";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import User from "./models/User";
import configurePassport from "./auth/passportConfig"; // Import the function
import { UserInterface } from "./interface/interface";
import Product from "./models/Product";
import multer from "multer";
import Grid from "gridfs-stream";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Quote from "./models/Quote";

dotenv.config(); // Load environment variables from .env file

const stripe = require("stripe")(process.env.STRIPE_KEY); // Initialize Stripe with API key

const app: Express = express();

const allowedOrigin = "http://localhost:5173";
const mongo = `${process.env.MONGO_URI}`;
mongoose.connect(mongo); // Connect to MongoDB

const connection = mongoose.connection;

let gfs: Grid.Grid | undefined;
let gridfsBucket: GridFSBucket | undefined;

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
  file: (req: Request, file: Express.Multer.File) => {
    return { filename: file.originalname };
  },
});

const upload = multer({ storage });

app.use(helmet()); // Adds security headers
app.use(compression()); // Compresses response bodies

// Rate limiting middleware to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
  })
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Set up session management
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_secret_key",
    resave: false,
    saveUninitialized: false, // Changed to false for security
    cookie: { secure: process.env.NODE_ENV === "production", httpOnly: true }, // Secure and httpOnly options
  })
);

app.use(passport.initialize());
app.use(passport.session());
configurePassport(); // Call the function to configure passport

// Basic route to check server status
app.get("/", (req: Request, res: Response) => {
  res.send("Hello World!");
});

// User registration endpoint
app.post("/api/users/register", async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (user) {
      console.log("User with that email already exists");
      return res.status(400).send("User with that email already exists");
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const newUser = new User({
      email: req.body.email,
      password: hashedPassword,
      fullName: req.body.fullName,
    });

    await newUser.save();
    console.log("User registered successfully");
    res.status(200).send("User registered successfully");
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// User login endpoint
app.post(
  "/api/users/login",
  (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(
      "local",
      (err: Error, user: UserInterface, info: any) => {
        if (err) {
          return next(err);
        }
        if (!user) {
          return res.status(401).json({ err: "Check email and password" });
        }
        req.logIn(user, (err) => {
          if (err) {
            return next(err);
          }
          return res
            .status(200)
            .json({ message: "User logged in successfully!" });
        });
      }
    )(req, res, next);
  }
);

// Add a new product
app.post(
  "/api/:id/products/addProduct",
  async (req: Request, res: Response) => {
    try {
      const product = new Product(req.body);
      await product.save();
      res.status(200).send("Product added successfully.");
    } catch (error) {
      console.error(error);
      res.status(500).send("Error adding product");
    }
  }
);

// Update an existing product
app.put(
  "/api/:id/products/:productId/update",
  async (req: Request, res: Response) => {
    try {
      const updatedProduct = await Product.findByIdAndUpdate(
        req.params.productId,
        req.body,
        { new: true } // Return the updated document
      );
      if (!updatedProduct) {
        return res.status(404).send("Product not found");
      }
      res.status(200).send(updatedProduct);
    } catch (error) {
      console.error(error);
      res.status(500).send("Error updating product");
    }
  }
);

// Delete a product
app.delete(
  "/api/:id/products/:productId/delete",
  async (req: Request, res: Response) => {
    try {
      const result = await Product.findByIdAndDelete(req.params.productId);
      if (!result) {
        return res.status(404).send("Product not found");
      }
      res.status(200).send("Product deleted");
    } catch (error) {
      console.error(error);
      res.status(500).send("Error deleting product");
    }
  }
);

// Upload a file
app.post("/upload", upload.single("file"), (req: Request, res: Response) => {
  res.json({ file: req.file });
});

// Request a quote
app.post("/api/request/quote", async (req: Request, res: Response) => {
  try {
    const quote = new Quote(req.body);
    await quote.save();
    res.status(200).send("Quote request saved successfully");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error saving quote request");
  }
});

// Get orders for a user
app.get("/api/users/:email/orders", async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) {
      return res.status(404).send("User not found");
    }
    const orders = await Quote.find({ user: user._id });
    res.status(200).send(orders);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error fetching orders");
  }
});

// Stripe checkout endpoint
app.post("/api/checkout", async (req: Request, res: Response) => {
  const { items } = req.body;

  // Validate that items is an array
  if (!items || !Array.isArray(items)) {
    return res.status(400).send("Invalid request: items must be an array");
  }

  // Map over items to create Stripe line items
  const lineItems = items.map((product: any) => ({
    price_data: {
      currency: "ttd",
      product_data: {
        name: product.name,
        images: [product.image],
      },
      unit_amount: product.price * 100,  // Stripe expects amount in cents
    },
    quantity: product.quantity,
  }));

  try {
    // Create Stripe session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${process.env.CLIENT_URL}/success`,
      cancel_url: `${process.env.CLIENT_URL}/cancel`,
    });

    // Send session ID back to the frontend
    res.status(200).json({ id: session.id });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    res.status(500).send("Error creating checkout session");
  }
});


// Uncomment this endpoint if you want to get the authenticated user's email
// app.get('/api/users/me', (req: Request, res: Response) => {
//   if (!req.isAuthenticated || !req.isAuthenticated()) {
//     return res.status(401).json({ message: 'Unauthorized' });
//   }
//   res.json({ email: req.user.email});
// });

// Start the server
app.listen(process.env.PORT || 4900, () => {
  console.log(`Server is running on port ${process.env.PORT || 4900}`);
});