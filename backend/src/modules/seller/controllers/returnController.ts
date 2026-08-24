import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import Return from "../../../models/Return";
import Order from "../../../models/Order";
import OrderItem from "../../../models/OrderItem";

export const getReturnRequests = asyncHandler(
  async (req: Request, res: Response) => {
    const sellerId = req.user?.userId;
    const {
      status,
      page = 1,
      limit = 10,
      search,
      dateFrom,
      dateTo,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query: any = {};
    if (status && status !== "All Status") {
      query.status = status;
    }

    // Find return requests where the associated OrderItem belongs to this seller
    const sellerOrderItems = await OrderItem.find({ seller: sellerId }).select("_id");
    const sellerOrderItemIds = sellerOrderItems.map((item) => item._id);

    query.orderItem = { $in: sellerOrderItemIds };

    // Date range filter
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        const endDay = new Date(dateTo as string);
        endDay.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDay;
      }
    }

    // Multi-field search
    if (search) {
      const s = String(search).trim();
      const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const matchingItems = await OrderItem.find({
        seller: sellerId,
        productName: { $regex: escaped, $options: "i" },
      }).select("_id");

      const matchingOrders = await Order.find({
        $or: [
          { orderNumber: { $regex: escaped, $options: "i" } },
          { customerName: { $regex: escaped, $options: "i" } },
        ],
      }).select("_id");

      query.$and = [
        { orderItem: { $in: sellerOrderItemIds } },
        {
          $or: [
            { orderItem: { $in: matchingItems.map((i) => i._id) } },
            { order: { $in: matchingOrders.map((o) => o._id) } },
            { reason: { $regex: escaped, $options: "i" } },
          ],
        },
      ];
    }

    const sort: any = {};
    sort[sortBy as string] = sortOrder === "asc" ? 1 : -1;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 10));

    const returns = await Return.find(query)
      .populate({
        path: "orderItem",
        select: "productName productImage quantity unitPrice total sku",
      })
      .populate({
        path: "order",
        select: "orderNumber customerName",
      })
      .populate("customer", "name email mobile")
      .sort(sort)
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await Return.countDocuments(query);

    // Map to frontend friendly format
    const formattedReturns = returns.map((ret) => {
      const item = ret.orderItem as any;
      const order = ret.order as any;
      return {
        id: ret._id,
        productName: item?.productName || "Unknown Product",
        customerName: order?.customerName || (ret.customer as any)?.name || "Unknown Customer",
        orderId: order?.orderNumber || "Unknown Order",
        amount: item?.total || 0,
        status: ret.status,
        date: ret.createdAt,
        returnReason: ret.reason,
        image: item?.productImage,
      };
    });

    return res.status(200).json({
      success: true,
      data: formattedReturns,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  }
);

export const getReturnRequestById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const returnRequest = await Return.findById(id)
      .populate({
        path: 'orderItem',
        select: 'productName productImage quantity unitPrice total sku'
      })
      .populate({
        path: 'order',
        select: 'orderNumber customerName deliveryAddress paymentMethod'
      })
      .populate('customer', 'name email mobile');

    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: "Return request not found"
      });
    }

    const item = returnRequest.orderItem as any;
    const order = returnRequest.order as any;

    const formattedDetail = {
      id: returnRequest._id,
      orderId: order?.orderNumber,
      orderDate: order?.createdAt, // Or orderDate if available
      status: returnRequest.status,
      customerName: order?.customerName,
      customerEmail: (returnRequest.customer as any)?.email,
      customerPhone: (returnRequest.customer as any)?.mobile,
      shippingAddress: order?.deliveryAddress ? `${order.deliveryAddress.address}, ${order.deliveryAddress.city}, ${order.deliveryAddress.pincode}` : 'N/A',
      paymentMethod: order?.paymentMethod,
      items: [
        {
          id: item?._id,
          name: item?.productName,
          sku: item?.sku || 'N/A',
          price: item?.unitPrice || 0,
          quantity: returnRequest.quantity, // Return quantity might differ from order item quantity? Using return quantity.
          total: (item?.unitPrice || 0) * returnRequest.quantity,
          image: item?.productImage
        }
      ],
      subtotal: (item?.unitPrice || 0) * returnRequest.quantity,
      tax: 0, // Mock for now
      total: (item?.unitPrice || 0) * returnRequest.quantity,
      reason: returnRequest.reason,
      reasonDescription: returnRequest.description
    };


    return res.status(200).json({
      success: true,
      data: formattedDetail,
    });
  }
);

export const updateReturnStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;

    const returnRequest = await Return.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: "Return request not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Return status updated successfully",
      data: returnRequest
    });
  }
);
