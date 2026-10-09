// =========================================================================
// 7. UPDATE PRODUCT STATUS
// =========================================================================

async function updateProductStatus(req, res) {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        ok: false,
        error: "AUTHENTICATION_REQUIRED",
      });
    }

    const { id } = req.params;
    const { status } = req.body;

    console.log(`📡 updateProductStatus called:`, {
      productId: id,
      receivedStatus: status,
      allBodyKeys: Object.keys(req.body),
    });

    if (!isValidId(id)) {
      console.error(`❌ Invalid product ID: ${id}`);
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_ID",
      });
    }

    // ✅ FIX: Check if status is provided and is a valid string
    if (!status || typeof status !== "string") {
      console.error(`❌ Status not provided or invalid type:`, status);
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_STATUS",
        message: "Status must be provided in request body as a string.",
      });
    }

    // ✅ FIX: Normalize status BEFORE validation
    const normalizedStatus = normalizeStatus(status);

    if (!VALID_PRODUCT_STATUSES.includes(normalizedStatus)) {
      console.error(`❌ Invalid status value: ${normalizedStatus}`);
      return res.status(400).json({
        ok: false,
        error: "INVALID_PRODUCT_STATUS",
        message: `Allowed statuses are LISTED, ACTIVE, and UNLISTED. Received: ${normalizedStatus}`,
      });
    }

    console.log(`✅ Updating product ${id} to status ${normalizedStatus}`);

    const product = await Product.findOneAndUpdate(
      {
        _id: id,
        sellerId: req.user._id,
      },
      {
        $set: {
          status: normalizedStatus,
          isShelved: normalizedStatus === "LISTED",
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!product) {
      console.error(`❌ Product not found or user is not the seller:`, {
        productId: id,
        userId: req.user._id,
      });
      return res.status(404).json({
        ok: false,
        error: "PRODUCT_NOT_FOUND",
      });
    }

    console.log(`✅ Product updated successfully:`, {
      productId: product._id,
      newStatus: product.status,
      isShelved: product.isShelved,
    });

    return res.status(200).json({
      ok: true,
      message: "Product status updated successfully.",
      product,
    });
  } catch (error) {
    return sendServerError(res, error, "Update product status");
  }
}
