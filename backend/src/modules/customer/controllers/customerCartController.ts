
import { Request, Response } from 'express';
import Cart from '../../../models/Cart';
import CartItem from '../../../models/CartItem';
import Product from '../../../models/Product';
import { findSellersWithinRange } from '../../../utils/locationHelper';
import mongoose from 'mongoose';
import AppSettings from '../../../models/AppSettings';
import { getRoadDistances } from '../../../services/mapService';
import Seller from '../../../models/Seller';

// Helper to calculate item price matching frontend logic
const calculateItemPrice = (product: any, variationSelector: any) => {
    let variation = null;
    let variationId = variationSelector;

    // Handle if variationSelector is an object (some implementations store it differently)
    if (variationSelector && typeof variationSelector === 'object' && variationSelector._id) {
        variationId = variationSelector._id;
    }

    if (variationId && product.variations?.length) {
        variation = product.variations.find((v: any) =>
            (v._id && v._id.toString() === variationId.toString()) ||
            (v.id && v.id === variationId)
        );
    }

    let finalPrice = variation?.price || product.price || 0;

    // Priority: Variation Discount -> Product Discount -> Variation Price -> Product Price
    if (variation?.discPrice && variation.discPrice > 0) {
        finalPrice = variation.discPrice;
    } else if (product.discPrice && product.discPrice > 0) {
        finalPrice = product.discPrice;
    }

    console.log(`[DEBUG Price] VarId: ${variationId}, Found: ${!!variation}, ProdDisc: ${product.discPrice}, Final: ${finalPrice}`);
    return finalPrice;
};

// Helper to sync cart items, removing out-of-range/inactive items, and updating total
const syncCartWithLocation = async (
    cartId: any,
    nearbySellerIds: mongoose.Types.ObjectId[],
    locationProvided: boolean
) => {
    const cart = await Cart.findById(cartId).populate({
        path: 'items',
        populate: {
            path: 'product',
            select: 'productName price mainImage stock pack mrp category seller status publish discPrice variations'
        }
    });

    if (!cart) return null;

    const filteredItems = [];
    const outOfRangeItemIds: any[] = [];
    let total = 0;

    for (const item of (cart.items as any[] || [])) {
        const product = item.product;
        let isAvailable = true;

        if (product && product.status === 'Active' && product.publish) {
            if (locationProvided) {
                isAvailable = nearbySellerIds.some(id => id.toString() === product.seller.toString());
            }
        } else {
            isAvailable = false;
        }

        if (isAvailable) {
            filteredItems.push(item);
            const price = calculateItemPrice(product, item.variation);
            total += price * item.quantity;
        } else {
            outOfRangeItemIds.push(item._id);
        }
    }

    if (outOfRangeItemIds.length > 0) {
        await CartItem.deleteMany({ _id: { $in: outOfRangeItemIds } });
        cart.items = cart.items.filter(id => !outOfRangeItemIds.some(outId => outId.toString() === id.toString()));
    }

    cart.total = total;
    await cart.save();

    // Return the final populated cart doc
    const finalCart = await Cart.findById(cartId).populate({
        path: 'items',
        populate: {
            path: 'product',
            select: 'productName price mainImage stock pack mrp category seller status publish discPrice variations'
        }
    });

    return finalCart;
};

// Helper to calculate delivery fee
const calculateDeliveryStuff = async (total: number, items: any[], userLat: number | null, userLng: number | null) => {
    let estimatedDeliveryFee = 0;
    let platformFee = 0;
    let freeDeliveryThreshold = 0;

    try {
        const settings = await AppSettings.getSettings();
        platformFee = settings.platformFee || 0;
        freeDeliveryThreshold = settings.freeDeliveryThreshold || 0;

        // Check free delivery threshold
        if (freeDeliveryThreshold > 0 && total >= freeDeliveryThreshold) {
            estimatedDeliveryFee = 0;
        } else if (settings) {
            // If distance based is enabled
            if (settings.deliveryConfig?.isDistanceBased === true) {
                const config = settings.deliveryConfig;
                // Default to base charge to ensure we don't accidentally give free delivery
                estimatedDeliveryFee = config.baseCharge || 0;

                if (userLat && userLng) {
                    // Get all sellers involved in the cart
                    const sellerIds = new Set<string>();
                    items.forEach((item: any) => {
                        if (item.product?.seller) {
                            sellerIds.add(item.product.seller.toString());
                        }
                    });

                    if (sellerIds.size > 0) {
                        const uniqueSellerIds = Array.from(sellerIds).map(id => new mongoose.Types.ObjectId(id));
                        const sellers = await Seller.find({ _id: { $in: uniqueSellerIds } }).select('location latitude longitude');

                        const sellerLocations: { lat: number; lng: number }[] = [];
                        sellers.forEach(seller => {
                            let lat, lng;
                            if (seller.location?.coordinates?.length === 2) {
                                lng = seller.location.coordinates[0];
                                lat = seller.location.coordinates[1];
                            } else if (seller.latitude && seller.longitude) {
                                lat = parseFloat(seller.latitude);
                                lng = parseFloat(seller.longitude);
                            }
                            if (lat && lng) sellerLocations.push({ lat, lng });
                        });

                        if (sellerLocations.length > 0) {
                            const distances = await getRoadDistances(
                                sellerLocations,
                                { lat: userLat, lng: userLng },
                                config.googleMapsKey
                            );

                            if (distances && distances.length > 0) {
                                const maxDistance = Math.max(...distances);
                                const extraKm = Math.max(0, maxDistance - config.baseDistance);
                                estimatedDeliveryFee = Math.ceil(config.baseCharge + (extraKm * config.kmRate));
                            }
                        }
                    }
                }
            } else {
                // Fixed charge
                estimatedDeliveryFee = settings.deliveryCharges || 0;
            }
        }
    } catch (err) {
        console.error("Error calculating delivery stuff:", err);
    }
    return {
        estimatedDeliveryFee,
        platformFee,
        freeDeliveryThreshold
    };
};

// Get current user's cart
export const getCart = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { latitude, longitude } = req.query;

        // Parse location
        const userLat = latitude ? parseFloat(latitude as string) : null;
        const userLng = longitude ? parseFloat(longitude as string) : null;

        // Strictly enforce location
        if (userLat === null || userLng === null || isNaN(userLat) || isNaN(userLng)) {
            return res.status(200).json({
                success: true,
                message: 'Location required to view available items',
                data: { items: [], total: 0 }
            });
        }

        const nearbySellerIds = await findSellersWithinRange(userLat, userLng);

        let cart = await Cart.findOne({ customer: userId });

        if (!cart) {
            cart = await Cart.create({ customer: userId, items: [], total: 0 });
            return res.status(200).json({ success: true, data: cart });
        }

        const updatedCart = await syncCartWithLocation(cart._id, nearbySellerIds, true);
        const filteredItems = updatedCart?.items || [];
        const total = updatedCart?.total || 0;

        // Calculate fees
        const fees = await calculateDeliveryStuff(total, filteredItems, userLat, userLng);

        return res.status(200).json({
            success: true,
            data: {
                ...updatedCart?.toObject(),
                items: filteredItems,
                total,
                ...fees
            }
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: 'Error fetching cart',
            error: error.message
        });
    }
};

// Add item to cart
export const addToCart = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { productId, quantity = 1, variation } = req.body;
        const { latitude, longitude } = req.query;

        if (!productId) {
            return res.status(400).json({ success: false, message: 'Product ID is required' });
        }

        // Parse location
        const userLat = latitude ? parseFloat(latitude as string) : null;
        const userLng = longitude ? parseFloat(longitude as string) : null;

        if (userLat === null || userLng === null || isNaN(userLat) || isNaN(userLng)) {
            return res.status(400).json({
                success: false,
                message: 'Location is required to add items to cart'
            });
        }

        // Verify product exists and is available at location
        const product = await Product.findOne({ _id: productId, status: 'Active', publish: true }).populate('seller');
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found or unavailable' });
        }

        // Check if seller's shop is open
        const seller = product.seller as any;
        if (seller && seller.isShopOpen === false) {
            return res.status(400).json({
                success: false,
                message: 'Seller is not available at this moment'
            });
        }

        const nearbySellerIds = await findSellersWithinRange(userLat, userLng);
        const isAvailable = nearbySellerIds.some(id => id.toString() === (seller._id || seller).toString());

        if (!isAvailable) {
            return res.status(403).json({
                success: false,
                message: 'This product is not available in your current location'
            });
        }

        // Get or create cart
        let cart = await Cart.findOne({ customer: userId });
        if (!cart) {
            cart = await Cart.create({ customer: userId, items: [], total: 0 });
        }

        // Check if item already exists in cart
        let cartItem = await CartItem.findOne({
            cart: cart._id,
            product: productId,
            variation: variation || null
        });

        if (cartItem) {
            // Update quantity
            cartItem.quantity += quantity;
            await cartItem.save();
        } else {
            // Create new cart item
            cartItem = await CartItem.create({
                cart: cart._id,
                product: productId,
                quantity,
                variation
            });
            cart.items.push(cartItem._id as any);
            await cart.save();
        }

        // Sync cart with location (removes out-of-range items and updates total)
        const updatedCart = await syncCartWithLocation(cart._id, nearbySellerIds, true);
        const filteredItems = updatedCart?.items || [];
        const total = updatedCart?.total || 0;

        // Calculate fees
        const fees = await calculateDeliveryStuff(total, filteredItems, userLat, userLng);

        return res.status(200).json({
            success: true,
            message: 'Item added to cart',
            data: {
                ...updatedCart?.toObject(),
                items: filteredItems,
                total,
                ...fees
            }
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: 'Error adding to cart',
            error: error.message
        });
    }
};

// Update item quantity
export const updateCartItem = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { itemId } = req.params;
        const { quantity } = req.body;
        const { latitude, longitude } = req.query;

        if (quantity < 1) {
            return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
        }

        // Parse location
        const userLat = latitude ? parseFloat(latitude as string) : null;
        const userLng = longitude ? parseFloat(longitude as string) : null;

        if (userLat === null || userLng === null || isNaN(userLat) || isNaN(userLng)) {
            return res.status(400).json({
                success: false,
                message: 'Location is required to update cart'
            });
        }

        const nearbySellerIds = await findSellersWithinRange(userLat, userLng);

        const cart = await Cart.findOne({ customer: userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const cartItem = await CartItem.findOne({ _id: itemId, cart: cart._id }).populate('product');
        if (!cartItem) {
            return res.status(404).json({ success: false, message: 'Item not found in cart' });
        }

        // Verify item is still available at location
        const product = cartItem.product as any;
        const isAvailable = product && nearbySellerIds.some(id => id.toString() === product.seller.toString());

        if (!isAvailable) {
            return res.status(403).json({
                success: false,
                message: 'This item is no longer available in your location'
            });
        }

        cartItem.quantity = quantity;
        await cartItem.save();

        const updatedCart = await syncCartWithLocation(cart._id, nearbySellerIds, true);
        const filteredItems = updatedCart?.items || [];
        const total = updatedCart?.total || 0;

        // Calculate fees
        const fees = await calculateDeliveryStuff(total, filteredItems, userLat, userLng);

        return res.status(200).json({
            success: true,
            message: 'Cart updated',
            data: {
                ...updatedCart?.toObject(),
                items: filteredItems,
                total,
                ...fees
            }
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: 'Error updating cart item',
            error: error.message
        });
    }
};

// Remove item from cart
export const removeFromCart = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { itemId } = req.params;
        const { latitude, longitude } = req.query;

        // Parse location
        const userLat = latitude ? parseFloat(latitude as string) : null;
        const userLng = longitude ? parseFloat(longitude as string) : null;

        const cart = await Cart.findOne({ customer: userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        await CartItem.findOneAndDelete({ _id: itemId, cart: cart._id });

        // Remove from cart array
        cart.items = cart.items.filter(id => id.toString() !== itemId);
        await cart.save();

        // Calculate total with location if provided
        let nearbySellerIds: mongoose.Types.ObjectId[] = [];
        const locationProvided = userLat !== null && userLng !== null && !isNaN(userLat) && !isNaN(userLng);
        if (locationProvided) {
            nearbySellerIds = await findSellersWithinRange(userLat, userLng);
        }

        const updatedCart = await syncCartWithLocation(cart._id, nearbySellerIds, locationProvided);
        const filteredItems = updatedCart?.items || [];
        const total = updatedCart?.total || 0;

        // Calculate fees
        const fees = await calculateDeliveryStuff(total, filteredItems, userLat, userLng);

        return res.status(200).json({
            success: true,
            message: 'Item removed from cart',
            data: {
                ...updatedCart?.toObject(),
                items: filteredItems,
                total,
                ...fees
            }
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: 'Error removing from cart',
            error: error.message
        });
    }
};

// Clear cart
export const clearCart = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const cart = await Cart.findOne({ customer: userId });

        if (cart) {
            await CartItem.deleteMany({ cart: cart._id });
            cart.items = [];
            cart.total = 0;
            await cart.save();
        }

        return res.status(200).json({
            success: true,
            message: 'Cart cleared',
            data: { items: [], total: 0 }
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: 'Error clearing cart',
            error: error.message
        });
    }
};
