export interface HomemadeCategory {
  id: string;
  _id?: string;
  slug: string;
  name: string;
  shortName: string;
  tagline: string;
  icon: string;
  image?: string;
  accentBg: string;
  accentBorder: string;
  accentText: string;
  heroImage: string;
  subcategories: {
    id: string;
    slug: string;
    name: string;
    icon: string;
  }[];
  productCount?: number;
}

export interface HomemadeSeller {
  id: string;
  name: string;
  specialty: string;
  distance: string;
  distanceKm: number;
  rating: number;
  reviewsCount: number;
  deliveryTag: string;
  avatarUrl: string;
  isVerified: boolean;
  productPreviews: string[];
}

export interface HomemadeProduct {
  id: string;
  name: string;
  sellerId: string;
  sellerName: string;
  isSellerVerified: boolean;
  rating: number;
  reviewsCount: number;
  distance: string;
  distanceKm: number;
  price: number;
  originalPrice?: number;
  unit: string;
  badge?: 'Bestseller' | 'Popular' | 'New' | 'Chef Special';
  categorySlug: string;
  subcategorySlug: string;
  imageUrl: string;
  foodType?: 'Veg' | 'Non-Veg' | 'None';
  description?: string;
  isAvailable?: boolean;
}

export const HOMEMADE_CATEGORIES: HomemadeCategory[] = [
  {
    id: '1',
    slug: 'food',
    name: 'Homemade Food',
    shortName: 'Food',
    tagline: 'Pure ingredients. Made with love. Delivered to your door.',
    icon: '🍲',
    accentBg: 'bg-[#FFF6ED]',
    accentBorder: 'border-[#FFEDD5]',
    accentText: 'text-[#EA580C]',
    heroImage: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
    subcategories: [
      { id: '1-1', slug: 'all', name: 'All Food', icon: '🍽️' },
      { id: '1-2', slug: 'tiffin-meals', name: 'Tiffin & Home Meals', icon: '🍱' },
      { id: '1-3', slug: 'pickles-chutneys', name: 'Pickles & Chutneys', icon: '🫙' },
      { id: '1-4', slug: 'papad-wafers', name: 'Papad & Wafers', icon: '🫓' },
      { id: '1-5', slug: 'masalas', name: 'Masalas', icon: '🥣' },
      { id: '1-6', slug: 'sweets-snacks', name: 'Sweets & Snacks', icon: '🥟' },
    ],
  },
  {
    id: '2',
    slug: 'bakery',
    name: 'Bakery From Home',
    shortName: 'Bakery',
    tagline: 'Freshly baked cakes, cookies & breads without preservatives.',
    icon: '🧁',
    accentBg: 'bg-[#FFF1F4]',
    accentBorder: 'border-[#FFE4EA]',
    accentText: 'text-[#FF2E7A]',
    heroImage: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=600&q=80',
    subcategories: [
      { id: '2-1', slug: 'all', name: 'All Bakery', icon: '🧁' },
      { id: '2-2', slug: 'cakes-pastries', name: 'Cakes & Pastries', icon: '🎂' },
      { id: '2-3', slug: 'cookies-biscuits', name: 'Cookies & Biscuits', icon: '🍪' },
      { id: '2-4', slug: 'artisanal-breads', name: 'Artisanal Breads', icon: '🍞' },
      { id: '2-5', slug: 'muffins', name: 'Muffins & Cupcakes', icon: '🧁' },
    ],
  },
  {
    id: '3',
    slug: 'handmade',
    name: 'Handmade Products',
    shortName: 'Handmade',
    tagline: 'Unique handcrafted treasures made by passionate neighborhood artisans.',
    icon: '🧶',
    accentBg: 'bg-[#FAF5FF]',
    accentBorder: 'border-[#F3E8FF]',
    accentText: 'text-[#9333EA]',
    heroImage: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80',
    subcategories: [
      { id: '3-1', slug: 'all', name: 'All Handmade', icon: '🧶' },
      { id: '3-2', slug: 'crochet-knitting', name: 'Crochet & Knitting', icon: '🧣' },
      { id: '3-3', slug: 'macrame-decor', name: 'Macrame Decor', icon: '🪴' },
      { id: '3-4', slug: 'totes-bags', name: 'Bags & Totes', icon: '👜' },
      { id: '3-5', slug: 'handmade-jewelry', name: 'Handmade Jewelry', icon: '💍' },
    ],
  },
  {
    id: '4',
    slug: 'lifestyle',
    name: 'Home & Lifestyle',
    shortName: 'Home & Lifestyle',
    tagline: 'Aromatherapy candles, natural soaps and cozy handmade home living.',
    icon: '🕯️',
    accentBg: 'bg-[#F0FDF4]',
    accentBorder: 'border-[#DCFCE7]',
    accentText: 'text-[#16A34A]',
    heroImage: 'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=600&q=80',
    subcategories: [
      { id: '4-1', slug: 'all', name: 'All Home & Lifestyle', icon: '🕯️' },
      { id: '4-2', slug: 'scented-candles', name: 'Scented Candles', icon: '🕯️' },
      { id: '4-3', slug: 'natural-soaps', name: 'Natural Soaps', icon: '🧼' },
      { id: '4-4', slug: 'pottery-clay', name: 'Pottery & Clay', icon: '🏺' },
      { id: '4-5', slug: 'organic-planters', name: 'Planters & Decor', icon: '🌱' },
    ],
  },
  {
    id: '5',
    slug: 'natural',
    name: 'Natural & Local',
    shortName: 'Natural & Local',
    tagline: 'Direct from farms and traditional home churners. 100% pure.',
    icon: '🌿',
    accentBg: 'bg-[#FEFCE8]',
    accentBorder: 'border-[#FEF08A]',
    accentText: 'text-[#CA8A04]',
    heroImage: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80',
    subcategories: [
      { id: '5-1', slug: 'all', name: 'All Natural', icon: '🌿' },
      { id: '5-2', slug: 'cold-pressed-oils', name: 'Cold Pressed Oils', icon: '🫒' },
      { id: '5-3', slug: 'raw-honey', name: 'Raw Forest Honey', icon: '🍯' },
      { id: '5-4', slug: 'herbal-teas', name: 'Herbal Teas', icon: '🍵' },
      { id: '5-5', slug: 'desi-ghee', name: 'Desi Bilona Ghee', icon: '🧈' },
    ],
  },
  {
    id: '6',
    slug: 'custom',
    name: 'Custom & Made-to-Order',
    shortName: 'Custom & Gifts',
    tagline: 'Bespoke gifts, customized celebration hampers and personal keepsakes.',
    icon: '🎁',
    accentBg: 'bg-[#FDF2F8]',
    accentBorder: 'border-[#FCE7F3]',
    accentText: 'text-[#DB2777]',
    heroImage: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=600&q=80',
    subcategories: [
      { id: '6-1', slug: 'all', name: 'All Custom Gifts', icon: '🎁' },
      { id: '6-2', slug: 'gift-hampers', name: 'Festive Hampers', icon: '🧺' },
      { id: '6-3', slug: 'personalized-art', name: 'Personalized Art', icon: '🎨' },
      { id: '6-4', slug: 'celebration-boxes', name: 'Party Favors', icon: '🎀' },
    ],
  },
];
