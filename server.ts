import express, { Express, Request, Response, NextFunction } from "express";
import passport from "passport";
import cors from "cors";
import session from "express-session";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import User from "./models/User";
import "./auth/passportConfig";
import { userInterface } from "./interface/interface";
import Product from "./models/Product";
import multer from "multer";
import Grid from "gridfs-stream";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";
import { GridFSBucket, GridFSFile } from "mongodb";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Quote from "./models/Quote";

dotenv.config();

const stripe = require("stripe")(process.env.STRIPE_KEY);

const app: Express = express();

const allowedOrigin = "http://localhost:5173";
const mongo = `${process.env.MONGO_URI}`;
const connection = mongoose.createConnection(mongo);

// Uploading pics to the database
let gfs: Grid.Grid | undefined;
let gridfsBucket: GridFSBucket | undefined;

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
require("./auth/passportConfig")(passport);

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World!");
});

app.post("/api/users/register", async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ username: req.body.username });
    if (user) {
      console.log("User with that username already exists");
      return res.status(400).send("User with that username already exists");
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const newUser = new User({
      username: req.body.username,
      password: hashedPassword,
      email: req.body.email,
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

app.post(
  "/api/users/login",
  (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(
      "local",
      (err: Error, user: userInterface, info: any, message: string) => {
        if (err) {
          return next(err);
        }
        if (!user) {
          return res.status(401).json({ err: "No user exists!" });
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

// Uploading pics endpoints
app.post("/upload", upload.single("file"), (req: Request, res: Response) => {
  res.json({ file: req.file });
});

// app.get("/files/:filename", (req: Request, res: Response) => {
//   if (!gridfsBucket) {
//     return res.status(500).send("Server error");
//   }

//   const filename = req.params.filename;

//   gridfsBucket.find({ filename }).toArray((err: Error | null, files: GridFSFile[] | null) => {
//     if (err) {
//       return res.status(500).send("Error fetching file");
//     }
//     if (!files || files.length === 0) {
//       return res.status(404).send("File not found");
//     }

//     const readStream = gridfsBucket.openDownloadStreamByName(filename);

//     readStream.on('error', (streamErr) => {
//       res.status(500).send("Error streaming file");
//     });

//     readStream.pipe(res);
//   });
// });

app.post("/api/request/quote", async (req: Request, res: Response) => {
  const quote = new Quote(req.body);
  await quote.save();
});

app.get("/api/users/:username/orders",async(req: Request, res: Response) => {
  try {
    const user = await User.findOne({ username: req.params.username });
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
app.listen(process.env.PORT || 4900, () => {
  console.log(`Server is running on port ${process.env.PORT || 4900}`);
});
