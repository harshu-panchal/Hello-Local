import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { uploadImage, uploadImages } from "../../../services/api/uploadService";
import {
  validateImageFile,
  createImagePreview,
  compressImage,
} from "../../../utils/imageUpload";
import {
  createProduct,
  updateProduct,
  getProductById,
  getShops,
  ProductVariation,
  Shop,
} from "../../../services/api/productService";
import {
  getCategories,
  getSubcategories,
  getSubSubCategories,
  Category,
  SubCategory,
  SubSubCategory,
} from "../../../services/api/categoryService";
import { getActiveTaxes, Tax } from "../../../services/api/taxService";
import { getBrands, Brand } from "../../../services/api/brandService";
import {
  getHeaderCategoriesPublic,
  HeaderCategory,
} from "../../../services/api/headerCategoryService";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { SellerPageHeader } from "../components/common/SellerPageHeader";
import { SellerCard } from "../components/common/SellerCard";
import { SellerButton } from "../components/common/SellerButton";
import { SellerFormField } from "../components/common/SellerFormField";

export default function SellerAddProduct() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();

  const isApproved = ((user as any)?.status ?? "Approved") === "Approved";
  const [formData, setFormData] = useState({
    productName: "",
    headerCategory: "",
    category: "",
    subcategory: "",
    subSubCategory: "",
    publish: "",
    popular: "No",
    dealOfDay: "No",
    brand: "",
    tags: "",
    smallDescription: "",
    seoTitle: "",
    seoKeywords: "",
    seoImageAlt: "",
    seoDescription: "",
    variationType: "",
    manufacturer: "",
    madeIn: "",
    tax: "",
    isReturnable: "No",
    maxReturnDays: "",
    fssaiLicNo: "",
    foodType: "None",
    totalAllowedQuantity: "10",
    mainImageUrl: "",
    galleryImageUrls: [] as string[],
    isShopByStoreOnly: "No",
    shopId: "",
  });

  const [variations, setVariations] = useState<ProductVariation[]>([]);
  const [variationForm, setVariationForm] = useState({
    title: "",
    price: "",
    discPrice: "0",
    stock: "0",
    status: "Available" as "Available" | "Sold out",
  });

  const [mainImageFile, setMainImageFile] = useState<File | null>(null);
  const [mainImagePreview, setMainImagePreview] = useState<string>("");
  const [galleryImageFiles, setGalleryImageFiles] = useState<File[]>([]);
  const [galleryImagePreviews, setGalleryImagePreviews] = useState<string[]>(
    []
  );
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<SubCategory[]>([]);
  const [subSubCategories, setSubSubCategories] = useState<SubSubCategory[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [headerCategories, setHeaderCategories] = useState<HeaderCategory[]>(
    []
  );
  const [shops, setShops] = useState<Shop[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const results = await Promise.allSettled([
          getCategories(),
          getActiveTaxes(),
          getBrands(),
          getHeaderCategoriesPublic(),
          getShops(),
        ]);

        if (results[0].status === "fulfilled" && results[0].value.success) {
          setCategories(results[0].value.data);
        }

        if (results[1].status === "fulfilled" && results[1].value.success) {
          setTaxes(results[1].value.data);
        }

        if (results[2].status === "fulfilled" && results[2].value.success) {
          setBrands(results[2].value.data);
        }

        if (results[3].status === "fulfilled") {
          const headerCatRes = results[3].value;
          if (headerCatRes && Array.isArray(headerCatRes)) {
            const published = headerCatRes.filter(
              (hc: HeaderCategory) => hc.status === "Published"
            );
            setHeaderCategories(published);
          }
        }

        if (results[4].status === "fulfilled" && results[4].value.success) {
          setShops(results[4].value.data);
        } else if (results[4].status === "rejected") {
          console.warn("Failed to fetch shops:", results[4].reason?.message || "Unknown error");
        }
      } catch (err) {
        console.error("Error fetching form data:", err);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (id) {
      const fetchProduct = async () => {
        try {
          const response = await getProductById(id);
          if (response.success && response.data) {
            const product = response.data;
            setFormData({
              productName: product.productName,
              headerCategory:
                (product.headerCategoryId as any)?._id ||
                (product as any).headerCategoryId ||
                "",
              category:
                (product.category as any)?._id || product.categoryId || "",
              subcategory:
                (product.subcategory as any)?._id ||
                product.subcategoryId ||
                "",
              subSubCategory:
                (product.subSubCategory as any)?._id ||
                (product as any).subSubCategoryId ||
                "",
              publish: product.publish ? "Yes" : "No",
              popular: product.popular ? "Yes" : "No",
              dealOfDay: product.dealOfDay ? "Yes" : "No",
              brand: (product.brand as any)?._id || product.brandId || "",
              tags: product.tags.join(", "),
              smallDescription: product.smallDescription || "",
              seoTitle: product.seoTitle || "",
              seoKeywords: product.seoKeywords || "",
              seoImageAlt: product.seoImageAlt || "",
              seoDescription: product.seoDescription || "",
              variationType: product.variationType || "",
              manufacturer: product.manufacturer || "",
              madeIn: product.madeIn || "",
              tax: (product.tax as any)?._id || product.taxId || "",
              isReturnable: product.isReturnable ? "Yes" : "No",
              maxReturnDays: product.maxReturnDays?.toString() || "",
              fssaiLicNo: product.fssaiLicNo || "",
              foodType: (product as any).foodType || "None",
              totalAllowedQuantity:
                product.totalAllowedQuantity?.toString() || "10",
              mainImageUrl: product.mainImageUrl || product.mainImage || "",
              galleryImageUrls: product.galleryImageUrls || [],
              isShopByStoreOnly: (product as any).isShopByStoreOnly ? "Yes" : "No",
              shopId: (product as any).shopId?._id || (product as any).shopId || "",
            });
            setVariations(product.variations);
            if (product.mainImageUrl || product.mainImage) {
              setMainImagePreview(
                product.mainImageUrl || product.mainImage || ""
              );
            }
            if (product.galleryImageUrls) {
              setGalleryImagePreviews(product.galleryImageUrls);
            }
          }
        } catch (err) {
          console.error("Error fetching product:", err);
          setUploadError("Failed to fetch product details");
        }
      };
      fetchProduct();
    }
  }, [id]);

  useEffect(() => {
    const fetchSubs = async () => {
      if (formData.category) {
        try {
          const res = await getSubcategories(formData.category);
          if (res.success) setSubcategories(res.data);
        } catch (err) {
          console.error("Error fetching subcategories:", err);
        }
      } else {
        setSubcategories([]);
        setFormData((prev) => ({ ...prev, subcategory: "" }));
      }
    };
    if (formData.category) {
      fetchSubs();
    }
  }, [formData.category]);

  useEffect(() => {
    const fetchSubSubs = async () => {
      if (formData.subcategory) {
        try {
          const res = await getSubSubCategories(formData.subcategory);
          if (res.success) setSubSubCategories(res.data);
        } catch (err) {
          console.error("Error fetching sub-subcategories:", err);
        }
      } else {
        setSubSubCategories([]);
        setFormData((prev) => ({ ...prev, subSubCategory: "" }));
      }
    };
    if (formData.subcategory) {
      fetchSubSubs();
    }
  }, [formData.subcategory]);

  useEffect(() => {
    if (formData.headerCategory) {
      const currentCategory = categories.find(
        (cat: any) => (cat._id || cat.id) === formData.category
      );
      if (currentCategory) {
        const catHeaderId =
          typeof currentCategory.headerCategoryId === "string"
            ? currentCategory.headerCategoryId
            : currentCategory.headerCategoryId?._id;
        if (catHeaderId !== formData.headerCategory) {
          setFormData((prev) => ({
            ...prev,
            category: "",
            subcategory: "",
            subSubCategory: "",
          }));
          setSubcategories([]);
          setSubSubCategories([]);
        }
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        category: "",
        subcategory: "",
      }));
      setSubcategories([]);
    }
  }, [formData.headerCategory, categories]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleMainImageChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setUploadError(validation.error || "Invalid image file");
      return;
    }

    setMainImageFile(file);
    setUploadError("");

    try {
      const preview = await createImagePreview(file);
      setMainImagePreview(preview);
    } catch {
      setUploadError("Failed to create image preview");
    }
  };

  const handleGalleryImagesChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const invalidFiles = files.filter((file) => !validateImageFile(file).valid);
    if (invalidFiles.length > 0) {
      setUploadError(
        "Some files are invalid. Please check file types and sizes."
      );
      return;
    }

    setGalleryImageFiles((prev) => [...prev, ...files]);
    setUploadError("");

    try {
      const newPreviews = await Promise.all(
        files.map((file) => createImagePreview(file))
      );
      setGalleryImagePreviews((prev) => [...prev, ...newPreviews]);
    } catch {
      setUploadError("Failed to create image previews");
    }

    e.target.value = "";
  };

  const removeGalleryImage = (index: number) => {
    setGalleryImageFiles((prev) => prev.filter((_, i) => i !== index));
    setGalleryImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const addVariation = () => {
    if (!variationForm.title || !variationForm.price) {
      const msg = "Please fill in variation title and price";
      setUploadError(msg);
      showToast(msg, "error");
      return;
    }

    const price = parseFloat(variationForm.price);
    const discPrice = parseFloat(variationForm.discPrice || "0");
    const stock = parseInt(variationForm.stock || "0");

    if (discPrice > price) {
      const msg = "Discounted price cannot be greater than regular price";
      setUploadError(msg);
      showToast(msg, "error");
      return;
    }

    const newVariation: ProductVariation = {
      title: variationForm.title,
      price,
      discPrice,
      stock,
      status: variationForm.status,
    };

    setVariations([...variations, newVariation]);
    showToast(`Added variant: ${variationForm.title}`, "info");
    setVariationForm({
      title: "",
      price: "",
      discPrice: "0",
      stock: "0",
      status: "Available",
    });
    setUploadError("");
  };

  const removeVariation = (index: number) => {
    setVariations((prev) => prev.filter((_, i) => i !== index));
    showToast("Variant removed", "info");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError("");

    if (!isApproved) {
      const msg = "Your seller account is awaiting admin approval. You can add products once approved.";
      setUploadError(msg);
      showToast(msg, "error");
      return;
    }

    if (!formData.productName.trim()) {
      const msg = "Please enter a product name.";
      setUploadError(msg);
      showToast(msg, "error");
      return;
    }

    if (!formData.publish) {
      const msg = "Please select a product status (Published or Unpublished).";
      setUploadError(msg);
      showToast(msg, "error");
      return;
    }

    if (formData.isShopByStoreOnly !== "Yes") {
      if (!formData.headerCategory) {
        const msg = "Please select a header category.";
        setUploadError(msg);
        showToast(msg, "error");
        return;
      }
      if (!formData.category) {
        const msg = "Please select a category.";
        setUploadError(msg);
        showToast(msg, "error");
        return;
      }
    }

    if (!mainImageFile && !formData.mainImageUrl) {
      const msg = "Please add a product main image.";
      setUploadError(msg);
      showToast(msg, "error");
      return;
    }

    if (formData.madeIn.trim() && !/^[A-Za-z\s]+$/.test(formData.madeIn.trim())) {
      const msg = "Made In should contain only alphabets.";
      setUploadError(msg);
      showToast(msg, "error");
      return;
    }

    if (formData.fssaiLicNo.trim() && !/^[0-9/]{8,}$/.test(formData.fssaiLicNo.trim())) {
      const msg = "Please enter a valid FSSAI Lic. No. (e.g. 21/001/00012345).";
      setUploadError(msg);
      showToast(msg, "error");
      return;
    }

    setUploading(true);

    try {
      let mainImageUrl = formData.mainImageUrl;
      let galleryImageUrls = [...formData.galleryImageUrls];

      if (mainImageFile) {
        const compressedMain = await compressImage(mainImageFile);
        const mainImageResult = await uploadImage(
          compressedMain,
          "hellolocal/products"
        );
        mainImageUrl = mainImageResult.secureUrl;
        setFormData((prev) => ({
          ...prev,
          mainImageUrl,
        }));
      }

      if (galleryImageFiles.length > 0) {
        const compressedGallery = await Promise.all(
          galleryImageFiles.map((file) => compressImage(file))
        );
        const galleryResults = await uploadImages(
          compressedGallery,
          "hellolocal/products/gallery"
        );
        galleryImageUrls = galleryResults.map((result) => result.secureUrl);
        setFormData((prev) => ({ ...prev, galleryImageUrls }));
      }

      if (variations.length === 0) {
        const msg = "Please add at least one product variation";
        setUploadError(msg);
        showToast(msg, "error");
        setUploading(false);
        return;
      }

      const tagsArray = formData.tags
        ? formData.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
        : [];

      const productData: any = {
        productName: formData.productName,
        publish: formData.publish === "Yes",
        popular: formData.popular === "Yes",
        dealOfDay: formData.dealOfDay === "Yes",
        tags: tagsArray,
        smallDescription: formData.smallDescription,
        seoTitle: formData.seoTitle,
        seoKeywords: formData.seoKeywords,
        seoImageAlt: formData.seoImageAlt,
        seoDescription: formData.seoDescription,
        variationType: formData.variationType,
        variations: variations,
        manufacturer: formData.manufacturer,
        madeIn: formData.madeIn,
        isReturnable: formData.isReturnable === "Yes",
        maxReturnDays: formData.maxReturnDays
          ? parseInt(formData.maxReturnDays)
          : undefined,
        fssaiLicNo: formData.fssaiLicNo,
        foodType: formData.foodType,
        totalAllowedQuantity: parseInt(formData.totalAllowedQuantity) || 10,
        mainImageUrl: mainImageUrl,
        galleryImageUrls: galleryImageUrls,
        isShopByStoreOnly: formData.isShopByStoreOnly === "Yes",
      };

      if (formData.headerCategory) {
        productData.headerCategoryId = formData.headerCategory;
      }

      if (formData.category) {
        productData.category = formData.category;
      }

      if (formData.subcategory) {
        productData.subcategory = formData.subcategory;
      }

      if (formData.subSubCategory) {
        productData.subSubCategory = formData.subSubCategory;
      }

      if (formData.brand) {
        productData.brand = formData.brand;
      }

      if (formData.tax) {
        productData.tax = formData.tax;
      }

      if (formData.isShopByStoreOnly === "Yes" && formData.shopId) {
        productData.shopId = formData.shopId;
      }

      let response;
      if (id) {
        response = await updateProduct(id, productData);
      } else {
        response = await createProduct(productData);
      }

      if (response.success) {
        const successMsg = id ? "Product updated successfully!" : "Product created successfully!";
        setSuccessMessage(successMsg);
        showToast(successMsg, "success");
        setTimeout(() => {
          navigate("/seller/product/list");
        }, 1200);
      } else {
        const msg = response.message || "Failed to save product";
        setUploadError(msg);
        showToast(msg, "error");
      }
    } catch (err: any) {
      console.error("Error saving product:", err);
      const msg = err.response?.data?.message || err.message || "Failed to save product";
      setUploadError(msg);
      showToast(msg, "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <SellerPageHeader
        title={id ? "Edit Product" : "Add New Product"}
        subtitle={
          id
            ? "Update product details, variations, and compliance."
            : "Create a new catalog listing with photos, pricing, and variants."
        }
        breadcrumbs={[
          { label: "Products", path: "/seller/product/list" },
          { label: id ? "Edit Product" : "Add Product" },
        ]}
        action={
          <SellerButton
            variant="outline"
            size="md"
            onClick={() => navigate('/seller/product/list')}
            className="min-h-[44px]"
            icon={<span>📋</span>}
          >
            View Product List
          </SellerButton>
        }
      />

      {/* Account Approval Warning Banner */}
      {!isApproved && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm font-semibold flex items-center gap-2">
          <span>⚠️</span>
          <span>Your seller account is awaiting admin approval. You can preview the form, but publishing products is restricted until verified.</span>
        </div>
      )}

      {/* Error & Success Messages */}
      {uploadError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm font-bold flex items-center justify-between">
          <span>{uploadError}</span>
          <button onClick={() => setUploadError("")} className="text-rose-500 hover:text-rose-800">✕</button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-bold">
          ✓ {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Basic Information */}
        <SellerCard title="1. Basic Information" description="Set product title, categorization, and general visibility.">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="md:col-span-2 lg:col-span-2">
              <SellerFormField label="Product Name" required>
                <input
                  type="text"
                  name="productName"
                  value={formData.productName}
                  onChange={handleChange}
                  placeholder="e.g., Fresh Organic Cow Milk 1L"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[42px]"
                />
              </SellerFormField>
            </div>

            <div>
              <SellerFormField label="Product Status" required>
                <select
                  name="publish"
                  value={formData.publish}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-800 outline-none focus:border-purple-600 min-h-[42px]"
                >
                  <option value="">Select Status</option>
                  <option value="Yes">Published (Active)</option>
                  <option value="No">Unpublished (Draft)</option>
                </select>
              </SellerFormField>
            </div>

            <div>
              <SellerFormField label="Header Category">
                <select
                  name="headerCategory"
                  value={formData.headerCategory}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-800 outline-none focus:border-purple-600 min-h-[42px]"
                >
                  <option value="">Select Header Category</option>
                  {headerCategories.map((hc) => (
                    <option key={hc._id} value={hc._id}>
                      {hc.name}
                    </option>
                  ))}
                </select>
              </SellerFormField>
            </div>

            <div>
              <SellerFormField label="Main Category" required={formData.isShopByStoreOnly !== "Yes"}>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-800 outline-none focus:border-purple-600 min-h-[42px]"
                >
                  <option value="">Select Category</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </SellerFormField>
            </div>

            <div>
              <SellerFormField label="Subcategory">
                <select
                  name="subcategory"
                  value={formData.subcategory}
                  onChange={handleChange}
                  disabled={!formData.category}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-800 outline-none focus:border-purple-600 disabled:opacity-50 min-h-[42px]"
                >
                  <option value="">Select Subcategory</option>
                  {subcategories.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.subcategoryName}
                    </option>
                  ))}
                </select>
              </SellerFormField>
            </div>

            <div>
              <SellerFormField label="Brand">
                <select
                  name="brand"
                  value={formData.brand}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-800 outline-none focus:border-purple-600 min-h-[42px]"
                >
                  <option value="">Select Brand</option>
                  {brands.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </SellerFormField>
            </div>

            <div className="md:col-span-2">
              <SellerFormField label="Search Tags (Comma separated)">
                <input
                  type="text"
                  name="tags"
                  value={formData.tags}
                  onChange={handleChange}
                  placeholder="milk, dairy, grocery, essentials"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[42px]"
                />
              </SellerFormField>
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <SellerFormField label="Short Description">
                <textarea
                  rows={3}
                  name="smallDescription"
                  value={formData.smallDescription}
                  onChange={handleChange}
                  placeholder="Brief summary of product features..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600"
                />
              </SellerFormField>
            </div>
          </div>
        </SellerCard>

        {/* Section 2: Media & Images */}
        <SellerCard title="2. Product Media" description="Upload product photos (JPG, PNG, WebP up to 5MB).">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Main Image */}
            <div className="space-y-2">
              <SellerFormField label="Main Product Photo" required>
                <div className="border-2 border-dashed border-slate-300 hover:border-purple-500 rounded-2xl p-4 text-center cursor-pointer transition-colors bg-slate-50 relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleMainImageChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  {mainImagePreview ? (
                    <div className="flex flex-col items-center space-y-2">
                      <img
                        src={mainImagePreview}
                        alt="Main preview"
                        className="w-32 h-32 object-contain rounded-xl border border-slate-200 bg-white"
                      />
                      <span className="text-xs text-purple-700 font-bold">Tap to replace main photo</span>
                    </div>
                  ) : (
                    <div className="py-4 space-y-1">
                      <span className="text-3xl">📷</span>
                      <p className="text-xs font-bold text-slate-800">Upload Main Image</p>
                      <p className="text-[11px] text-slate-400">High quality square images work best</p>
                    </div>
                  )}
                </div>
              </SellerFormField>
            </div>

            {/* Gallery Images */}
            <div className="space-y-2">
              <SellerFormField label="Gallery Images (Optional)">
                <div className="border-2 border-dashed border-slate-300 hover:border-purple-500 rounded-2xl p-4 text-center cursor-pointer transition-colors bg-slate-50 relative">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleGalleryImagesChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="py-2 space-y-1">
                    <span className="text-2xl">🖼️</span>
                    <p className="text-xs font-bold text-slate-800">+ Add Additional Angles</p>
                    <p className="text-[11px] text-slate-400">Select multiple files</p>
                  </div>
                </div>

                {/* Previews */}
                {galleryImagePreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {galleryImagePreviews.map((preview, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded-xl border border-slate-200 overflow-hidden bg-white group">
                        <img src={preview} alt={`Gallery ${idx}`} className="w-full h-full object-contain" />
                        <button
                          type="button"
                          onClick={() => removeGalleryImage(idx)}
                          className="absolute top-1 right-1 bg-rose-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold shadow-md"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </SellerFormField>
            </div>
          </div>
        </SellerCard>

        {/* Section 3: Pricing & Variations */}
        <SellerCard title="3. Pricing & Variations" description="Define unit sizes, packaging variants, prices, and stock levels.">
          <div className="space-y-4">
            {/* Add Variation Bar */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Add Variant</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                <input
                  type="text"
                  placeholder="Variant Title (e.g. 500g, 1L)"
                  value={variationForm.title}
                  onChange={(e) => setVariationForm({ ...variationForm, title: e.target.value })}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-purple-600 min-h-[40px]"
                />
                <input
                  type="number"
                  placeholder="MRP / Base Price (₹)"
                  value={variationForm.price}
                  onChange={(e) => setVariationForm({ ...variationForm, price: e.target.value })}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-purple-600 min-h-[40px]"
                />
                <input
                  type="number"
                  placeholder="Selling Price (₹)"
                  value={variationForm.discPrice}
                  onChange={(e) => setVariationForm({ ...variationForm, discPrice: e.target.value })}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-purple-600 min-h-[40px]"
                />
                <input
                  type="number"
                  placeholder="Initial Stock"
                  value={variationForm.stock}
                  onChange={(e) => setVariationForm({ ...variationForm, stock: e.target.value })}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-purple-600 min-h-[40px]"
                />
                <SellerButton
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={addVariation}
                  className="w-full min-h-[40px]"
                >
                  + Add Variant
                </SellerButton>
              </div>
            </div>

            {/* Variations Table */}
            {variations.length > 0 ? (
              <div data-lenis-prevent="true" className="overflow-x-auto rounded-2xl border border-slate-200 seller-scrollbar">
                <table className="w-full text-left text-xs min-w-[500px]">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Variant Title</th>
                      <th className="px-4 py-3">MRP (₹)</th>
                      <th className="px-4 py-3">Selling Price (₹)</th>
                      <th className="px-4 py-3">Stock Units</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {variations.map((v, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-bold text-slate-900">{v.title}</td>
                        <td className="px-4 py-3 text-slate-600">₹{Number(v.price).toFixed(2)}</td>
                        <td className="px-4 py-3 font-black text-purple-700">₹{Number(v.discPrice || v.price).toFixed(2)}</td>
                        <td className="px-4 py-3 text-slate-800 font-bold">{v.stock}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => removeVariation(idx)}
                            className="text-rose-600 hover:text-rose-800 font-bold text-xs"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-rose-600 font-semibold text-center py-2">
                * At least one product variation is required.
              </p>
            )}
          </div>
        </SellerCard>

        {/* Section 4: Details & Compliance */}
        <SellerCard title="4. Details & Compliance" description="Taxation, food safety certifications, and return policy.">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <SellerFormField label="GST Tax Slab">
                <select
                  name="tax"
                  value={formData.tax}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-800 outline-none focus:border-purple-600 min-h-[42px]"
                >
                  <option value="">Select Applicable Tax</option>
                  {taxes.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name} ({t.percentage}%)
                    </option>
                  ))}
                </select>
              </SellerFormField>
            </div>

            <div>
              <SellerFormField label="Country of Origin (Made In)">
                <input
                  type="text"
                  name="madeIn"
                  value={formData.madeIn}
                  onChange={handleChange}
                  placeholder="e.g. India"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[42px]"
                />
              </SellerFormField>
            </div>

            <div>
              <SellerFormField label="Manufacturer / Packer">
                <input
                  type="text"
                  name="manufacturer"
                  value={formData.manufacturer}
                  onChange={handleChange}
                  placeholder="e.g. Amul Dairy Pvt Ltd"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[42px]"
                />
              </SellerFormField>
            </div>

            <div>
              <SellerFormField label="FSSAI License No.">
                <input
                  type="text"
                  name="fssaiLicNo"
                  value={formData.fssaiLicNo}
                  onChange={handleChange}
                  placeholder="14-digit FSSAI number"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[42px]"
                />
              </SellerFormField>
            </div>

            <div>
              <SellerFormField label="Food Preference Type">
                <select
                  name="foodType"
                  value={formData.foodType}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-800 outline-none focus:border-purple-600 min-h-[42px]"
                >
                  <option value="None">None / General</option>
                  <option value="Veg">Vegetarian 🟢</option>
                  <option value="Non-Veg">Non-Vegetarian 🔴</option>
                </select>
              </SellerFormField>
            </div>

            <div>
              <SellerFormField label="Max Purchase Qty Per Order">
                <input
                  type="number"
                  name="totalAllowedQuantity"
                  value={formData.totalAllowedQuantity}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[42px]"
                />
              </SellerFormField>
            </div>

            <div>
              <SellerFormField label="Is Product Returnable?">
                <select
                  name="isReturnable"
                  value={formData.isReturnable}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-800 outline-none focus:border-purple-600 min-h-[42px]"
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </SellerFormField>
            </div>

            {formData.isReturnable === "Yes" && (
              <div>
                <SellerFormField label="Return Window (Days)">
                  <input
                    type="number"
                    name="maxReturnDays"
                    value={formData.maxReturnDays}
                    onChange={handleChange}
                    placeholder="e.g. 7"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[42px]"
                  />
                </SellerFormField>
              </div>
            )}
          </div>
        </SellerCard>

        {/* Section 5: SEO & Search Visibility */}
        <SellerCard title="5. SEO & Search Meta" description="Improve search engine discoverability.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <SellerFormField label="SEO Title">
                <input
                  type="text"
                  name="seoTitle"
                  value={formData.seoTitle}
                  onChange={handleChange}
                  placeholder="Meta title for Google"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[42px]"
                />
              </SellerFormField>
            </div>

            <div>
              <SellerFormField label="SEO Keywords">
                <input
                  type="text"
                  name="seoKeywords"
                  value={formData.seoKeywords}
                  onChange={handleChange}
                  placeholder="keywords, separated, by, commas"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600 min-h-[42px]"
                />
              </SellerFormField>
            </div>

            <div className="md:col-span-2">
              <SellerFormField label="SEO Meta Description">
                <textarea
                  rows={2}
                  name="seoDescription"
                  value={formData.seoDescription}
                  onChange={handleChange}
                  placeholder="Meta description for search engine results..."
                  className="w-full rounded-xl border border-slate-300 p-3 text-xs sm:text-sm text-slate-900 outline-none focus:border-purple-600"
                />
              </SellerFormField>
            </div>
          </div>
        </SellerCard>

        {/* Form Actions Footer */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
          <SellerButton
            type="button"
            variant="outline"
            size="lg"
            onClick={() => navigate("/seller/product/list")}
          >
            Cancel
          </SellerButton>
          <SellerButton
            type="submit"
            variant="primary"
            size="lg"
            disabled={uploading || !isApproved}
            isLoading={uploading}
          >
            {id ? "Save Changes" : "Create Product"}
          </SellerButton>
        </div>
      </form>
    </div>
  );
}
