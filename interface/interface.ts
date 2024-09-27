export interface UserRegistration {
  email: string;
  password: string;
  fullName: string;
}

export interface UserLogin {
  email: string;
  password: string;
}

export interface ProductInterface {
  name: string;
  description: string;
  price: number;
  category: string;
  image: string; // Assuming you're storing the image URL
  quantity: number;
}

export interface QuoteRequest {
  userId: string; // The ID of the user requesting the quote
  items: { productId: string; quantity: number }[]; // Array of products and their quantities
  totalAmount: number; // Total price for the requested items
  status?: string; // Optional status of the quote (e.g., "pending", "approved")
}

export interface StripeCheckoutItem {
  name: string;
  image: string;
  price: number;
  quantity: number;
}

export interface StripeCheckout {
  items: StripeCheckoutItem[];
}

export interface UserInterface {
  email: string;
  password: string;
  fullName: string;
  id: string;
}
