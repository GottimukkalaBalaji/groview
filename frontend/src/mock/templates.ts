import { WhatsAppTemplate } from "../types/template.js";

export const INITIAL_MOCK_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: "tpl-festive-sale",
    name: "festive_mega_savings",
    language: "en_US",
    category: "MARKETING",
    status: "APPROVED",
    lastUpdated: "2026-10-12T10:30:00.000Z",
    header: {
      type: "IMAGE",
      mediaUrl: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=600&auto=format&fit=crop&q=80",
    },
    body: "Hi *{{1}}*! 🎉 Celebrate the season with an exclusive *{{2}}% OFF* on all collections.\n\nUse code *{{3}}* at checkout. Offer valid till midnight this Sunday! Don't miss out on your favorites.",
    variables: [
      { key: "1", fallbackValue: "Valued Customer", sampleValue: "Priya" },
      { key: "2", fallbackValue: "25", sampleValue: "30" },
      { key: "3", fallbackValue: "FESTIVE30", sampleValue: "DIWALI30" },
    ],
    footer: "Reply STOP to unsubscribe from promotional updates.",
    buttons: [
      {
        id: "btn-1",
        type: "URL",
        text: "Shop Now 🛍️",
        url: "https://grovastra.com/shop?code=DIWALI30",
      },
      {
        id: "btn-2",
        type: "QUICK_REPLY",
        text: "Claim Coupon",
      },
      {
        id: "btn-3",
        type: "PHONE_NUMBER",
        text: "Call Support",
        phoneNumber: "+919876543210",
      },
    ],
  },
  {
    id: "tpl-abandoned-cart",
    name: "cart_recovery_reminder",
    language: "en_US",
    category: "MARKETING",
    status: "APPROVED",
    lastUpdated: "2026-10-11T14:15:00.000Z",
    header: {
      type: "TEXT",
      text: "You left something special behind! 👀",
    },
    body: "Hello *{{1}}*, your cart with *{{2}}* is waiting for you!\n\nComplete your order now and enjoy complimentary express delivery with promo code *{{3}}*.",
    variables: [
      { key: "1", fallbackValue: "there", sampleValue: "Ananya" },
      { key: "2", fallbackValue: "selected items", sampleValue: "Wireless ANC Headphones" },
      { key: "3", fallbackValue: "FREESHIP", sampleValue: "SHIPFREE" },
    ],
    footer: "Free returns within 15 days.",
    buttons: [
      {
        id: "btn-cart-1",
        type: "URL",
        text: "Resume Checkout 🛒",
        url: "https://grovastra.com/cart",
      },
      {
        id: "btn-cart-2",
        type: "QUICK_REPLY",
        text: "Need Help?",
      },
    ],
  },
  {
    id: "tpl-loyalty-reward",
    name: "vip_loyalty_unlocked",
    language: "en_US",
    category: "MARKETING",
    status: "PENDING",
    lastUpdated: "2026-10-13T08:00:00.000Z",
    header: {
      type: "NONE",
    },
    body: "Congratulations *{{1}}*! 🌟 You have earned *{{2}}* reward points on Grovastra.\n\nYour current tier is *{{3}}*. Redeem your points before month-end for instant discounts at store checkout.",
    variables: [
      { key: "1", fallbackValue: "Member", sampleValue: "Vikram" },
      { key: "2", fallbackValue: "500", sampleValue: "1,250" },
      { key: "3", fallbackValue: "Gold Member", sampleValue: "Platinum VIP" },
    ],
    footer: "Valid at all participating partner stores.",
    buttons: [
      {
        id: "btn-loyalty-1",
        type: "URL",
        text: "View Passbook 💳",
        url: "https://grovastra.com/rewards",
      },
    ],
  },
  {
    id: "tpl-order-shipped",
    name: "order_dispatched_alert",
    language: "en_US",
    category: "UTILITY",
    status: "APPROVED",
    lastUpdated: "2026-10-10T16:45:00.000Z",
    header: {
      type: "TEXT",
      text: "📦 Your Order Has Been Dispatched!",
    },
    body: "Hi *{{1}}*, your order *#{{2}}* is on its way via *{{3}}*.\n\nExpected delivery date is *{{4}}*. You can track real-time delivery status using the link below.",
    variables: [
      { key: "1", fallbackValue: "Customer", sampleValue: "Suresh" },
      { key: "2", fallbackValue: "10984", sampleValue: "GRV-8823" },
      { key: "3", fallbackValue: "Express Courier", sampleValue: "BlueDart Express" },
      { key: "4", fallbackValue: "2-3 business days", sampleValue: "Tomorrow by 5 PM" },
    ],
    footer: "For shipment issues, contact support@grovastra.com",
    buttons: [
      {
        id: "btn-track-1",
        type: "URL",
        text: "Track Shipment 🚚",
        url: "https://track.grovastra.com/order",
      },
      {
        id: "btn-track-2",
        type: "QUICK_REPLY",
        text: "Modify Address",
      },
    ],
  },
  {
    id: "tpl-auth-otp",
    name: "account_login_otp",
    language: "en_US",
    category: "AUTHENTICATION",
    status: "APPROVED",
    lastUpdated: "2026-10-09T11:20:00.000Z",
    header: {
      type: "NONE",
    },
    body: "*{{1}}* is your Grovastra one-time verification code. Valid for *{{2}}* minutes. Do not share this OTP with anyone, including support executives.",
    variables: [
      { key: "1", fallbackValue: "123456", sampleValue: "849201" },
      { key: "2", fallbackValue: "10", sampleValue: "5" },
    ],
    footer: "Security alert from Grovastra Auth.",
    buttons: [
      {
        id: "btn-otp-1",
        type: "QUICK_REPLY",
        text: "Report Unauthorized",
      },
    ],
  },
];
