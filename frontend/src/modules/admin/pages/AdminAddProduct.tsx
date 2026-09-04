import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
  ProductVariation,
} from "../../../services/api/admin/adminProductService";
import { getShops } from "../../../services/api/productService";
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
import { useToast } from "../../../context/ToastContext";

export default function AdminAddProduct() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { showToast } = useToast();
  const mainFileInputRef = useRef<HTMLInputElement>(null);
  const galleryFileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    productName: "",
    headerCategory: "",
    category: "",
    subcategory: "",
    subSubCategory: "",
    publish: "No",
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
  const [galleryImagePreviews, setGalleryImagePreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<SubCategory[]>([]);
  const [subSubCategories, setSubSubCategories] = useState<SubSubCategory[]>([]);
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [headerCategories, setHeaderCategories] = useState<HeaderCategory[]>([]);
  const [shops, setShops] = useState<any[]>([]);

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
          console.warn(
            "Failed to fetch shops:",
            results[4].reason?.message || "Unknown error"
          );
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
              tags: Array.isArray(product.tags) ? product.tags.join(", ") : "",
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
              totalAllowedQuantity:
                product.totalAllowedQuantity?.toString() || "10",
              mainImageUrl: product.mainImageUrl || product.mainImage || "",
              galleryImageUrls:
                product.galleryImageUrls || product.galleryImages || [],
              isShopByStoreOnly: (product as any).isShopByStoreOnly
                ? "Yes"
                : "No",
              shopId:
                (product as any).shopId?._id ||
                (product as any).shopId ||
                "",
            });
            setVariations(product.variations || []);
            if (product.mainImageUrl || product.mainImage) {
              setMainImagePreview(
                product.mainImageUrl || product.mainImage || ""
              );
            }
            if (product.galleryImageUrls || product.galleryImages) {
              setGalleryImagePreviews(
                product.galleryImageUrls || product.galleryImages || []
              );
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
    } catch (error) {
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
      setUploadError("Some files are invalid. Please check file types and sizes.");
      return;
    }

    setGalleryImageFiles((prev) => [...prev, ...files]);
    setUploadError("");

    try {
      const newPreviews = await Promise.all(
        files.map((file) => createImagePreview(file))
      );
      setGalleryImagePreviews((prev) => [...prev, ...newPreviews]);
    } catch (error) {
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
      setUploadError("Please fill in variation title and price");
      return;
    }

    const price = parseFloat(variationForm.price);
    const discPrice = parseFloat(variationForm.discPrice || "0");
    const stock = parseInt(variationForm.stock || "0");

    if (discPrice > price) {
      setUploadError("Discounted price cannot be greater than price");
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
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError("");

    if (!formData.productName.trim()) {
      setUploadError("Please enter a product name.");
      showToast("Please enter a product name.", "error");
      return;
    }

    if (formData.isShopByStoreOnly !== "Yes") {
      if (!formData.headerCategory) {
        setUploadError("Please select a header category.");
        showToast("Please select a header category.", "error");
        return;
      }
      if (!formData.category) {
        setUploadError("Please select a category.");
        showToast("Please select a category.", "error");
        return;
      }
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
        setUploadError("Please add at least one product variation");
        showToast("Please add at least one product variation", "error");
        setUploading(false);
        return;
      }

      const tagsArray = formData.tags
        ? formData.tags
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        : [];

      const productData = {
        productName: formData.productName,
        headerCategoryId: formData.headerCategory || undefined,
        category: formData.category,
        subcategory: formData.subcategory || undefined,
        subSubCategory: formData.subSubCategory || undefined,
        brand: formData.brand || undefined,
        publish: formData.publish === "Yes",
        popular: formData.popular === "Yes",
        dealOfDay: formData.dealOfDay === "Yes",
        seoTitle: formData.seoTitle || undefined,
        seoKeywords: formData.seoKeywords || undefined,
        seoImageAlt: formData.seoImageAlt || undefined,
        seoDescription: formData.seoDescription || undefined,
        smallDescription: formData.smallDescription || undefined,
        tags: tagsArray,
        manufacturer: formData.manufacturer || undefined,
        madeIn: formData.madeIn || undefined,
        tax: formData.tax || undefined,
        isReturnable: formData.isReturnable === "Yes",
        maxReturnDays: formData.maxReturnDays
          ? parseInt(formData.maxReturnDays)
          : undefined,
        totalAllowedQuantity: parseInt(formData.totalAllowedQuantity || "10"),
        fssaiLicNo: formData.fssaiLicNo || undefined,
        mainImage: mainImageUrl || undefined,
        galleryImages: galleryImageUrls,
        variations: variations.map((v) => ({
          ...v,
          value: (v as any).value || v.title,
          name: (v as any).name || "Variation",
        })),
        variationType: formData.variationType || undefined,
        isShopByStoreOnly: formData.isShopByStoreOnly === "Yes",
        shopId:
          formData.isShopByStoreOnly === "Yes" && formData.shopId
            ? formData.shopId
            : undefined,
      };

      let response;
      if (id) {
        response = await updateProduct(id as string, productData);
      } else {
        response = await createProduct(productData);
      }

      if (response.success) {
        const msg = id
          ? "Product updated successfully!"
          : "Product added successfully!";
        setSuccessMessage(msg);
        showToast(msg, "success");
        setTimeout(() => {
          navigate("/admin/product/list");
        }, 1000);
      } else {
        setUploadError(response.message || "Failed to save product");
        showToast(response.message || "Failed to save product", "error");
      }
    } catch (error: any) {
      const msg =
        error.response?.data?.message ||
        error.message ||
        "Failed to save product. Please try again.";
      setUploadError(msg);
      showToast(msg, "error");
    } finally {
      setUploading(false);
    }
  };

  const filteredCategories = categories.filter((cat: any) => {
    if (!formData.headerCategory) return false;
    const catHeaderId =
      typeof cat.headerCategoryId === "string"
        ? cat.headerCategoryId
        : cat.headerCategoryId?._id;
    return catHeaderId === formData.headerCategory;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 tracking-tight">
            {id ? "Edit Product" : "Add New Product"}
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-0.5">
            {id
              ? "Update product catalogue attributes, inventory variants, and tax details"
              : "Create a verified catalogue item with categories, variations, and images"}
          </p>
        </div>

        <nav aria-label="Breadcrumb" className="text-xs sm:text-sm text-neutral-500">
          <Link
            to="/admin/dashboard"
            className="text-rose-700 hover:text-rose-800 font-semibold transition-colors"
          >
            Dashboard
          </Link>
          <span className="mx-2 text-neutral-300">/</span>
          <Link
            to="/admin/product/list"
            className="text-rose-700 hover:text-rose-800 font-semibold transition-colors"
          >
            Products
          </Link>
          <span className="mx-2 text-neutral-300">/</span>
          <span className="text-neutral-700 font-medium">
            {id ? "Edit Product" : "Add Product"}
          </span>
        </nav>
      </div>

      {/* Global Alerts */}
      {uploadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 shrink-0 text-red-600"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>{uploadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadError("")}
            className="text-red-500 hover:text-red-700 font-bold ml-2 text-base leading-none"
          >
            ×
          </button>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-xs">
          <svg
            className="w-4 h-4 shrink-0 text-emerald-600"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Product General Details */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
              <h2 className="text-sm sm:text-base font-bold tracking-tight">
                General Product Information
              </h2>
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              {/* Product Name */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Product Name <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  name="productName"
                  value={formData.productName}
                  onChange={handleChange}
                  placeholder="e.g. Fortune Sunlite Refined Sunflower Oil 1L"
                  required
                  className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
                />
              </div>

              {/* Header Category */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Select Header Category{" "}
                  {formData.isShopByStoreOnly !== "Yes" && (
                    <span className="text-rose-600">*</span>
                  )}
                </label>
                <select
                  name="headerCategory"
                  value={formData.headerCategory}
                  onChange={handleChange}
                  required={formData.isShopByStoreOnly !== "Yes"}
                  className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
                >
                  <option value="">Select Header Category</option>
                  {headerCategories.map((hc) => (
                    <option key={hc._id || hc.id} value={hc._id || hc.id}>
                      {hc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Category{" "}
                  {formData.isShopByStoreOnly !== "Yes" && (
                    <span className="text-rose-600">*</span>
                  )}
                  <span className="text-[11px] font-normal text-neutral-400 normal-case ml-1">
                    (Select Header Category first)
                  </span>
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  disabled={!formData.headerCategory}
                  required={formData.isShopByStoreOnly !== "Yes"}
                  className={`w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px] ${
                    !formData.headerCategory ? "opacity-60 bg-neutral-100 cursor-not-allowed" : ""
                  }`}
                >
                  <option value="">
                    {formData.headerCategory
                      ? "Select Category"
                      : "Select Header Category First"}
                  </option>
                  {filteredCategories.map((cat) => (
                    <option key={cat._id} value={cat._id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* SubCategory */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  SubCategory
                  <span className="text-[11px] font-normal text-neutral-400 normal-case ml-1">
                    (Select Category first)
                  </span>
                </label>
                <select
                  name="subcategory"
                  value={formData.subcategory}
                  onChange={handleChange}
                  disabled={!formData.category}
                  className={`w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px] ${
                    !formData.category ? "opacity-60 bg-neutral-100 cursor-not-allowed" : ""
                  }`}
                >
                  <option value="">
                    {formData.category
                      ? "Select SubCategory"
                      : "Select Category First"}
                  </option>
                  {subcategories.map((sub) => (
                    <option key={sub._id || sub.id} value={sub._id || sub.id}>
                      {sub.subcategoryName || (sub as any).name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sub-SubCategory */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Sub-SubCategory
                  <span className="text-[11px] font-normal text-neutral-400 normal-case ml-1">
                    (Optional)
                  </span>
                </label>
                <select
                  name="subSubCategory"
                  value={formData.subSubCategory}
                  onChange={handleChange}
                  disabled={!formData.subcategory}
                  className={`w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px] ${
                    !formData.subcategory ? "opacity-60 bg-neutral-100 cursor-not-allowed" : ""
                  }`}
                >
                  <option value="">
                    {formData.subcategory
                      ? "Select Sub-SubCategory"
                      : "Select SubCategory First"}
                  </option>
                  {subSubCategories.map((ss) => (
                    <option key={ss._id} value={ss._id}>
                      {ss.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Product Status */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Product Status <span className="text-rose-600">*</span>
                </label>
                <select
                  name="publish"
                  value={formData.publish}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
                >
                  <option value="Yes">Published (Visible in Customer Store)</option>
                  <option value="No">Unpublished (Hidden draft)</option>
                </select>
              </div>

              {/* Popular Product */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Make Product Popular?
                </label>
                <select
                  name="popular"
                  value={formData.popular}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes (Highlighted in Popular Section)</option>
                </select>
              </div>

              {/* Deal of the day */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Insert to Deal of the day?
                </label>
                <select
                  name="dealOfDay"
                  value={formData.dealOfDay}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes (Featured in Daily Deals)</option>
                </select>
              </div>

              {/* Brand */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Select Brand
                </label>
                <select
                  name="brand"
                  value={formData.brand}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
                >
                  <option value="">Select Brand (Optional)</option>
                  {brands.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Search Tags
                </label>
                <input
                  type="text"
                  name="tags"
                  value={formData.tags}
                  onChange={handleChange}
                  placeholder="e.g. oil, cooking, grocery, healthy (comma separated)"
                  className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
                />
                <span className="text-[11px] text-neutral-400 mt-1 block">
                  Keywords separated by commas to improve in-app search relevance
                </span>
              </div>
            </div>

            {/* Small Description */}
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                Product Small Description
              </label>
              <textarea
                name="smallDescription"
                value={formData.smallDescription}
                onChange={handleChange}
                rows={3}
                placeholder="Brief summary of product features, key ingredients, or benefits..."
                className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white resize-y"
              />
            </div>
          </div>
        </div>

        {/* Section 2: SEO Content */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <h2 className="text-sm sm:text-base font-bold tracking-tight">
                SEO & Meta Content (Optional)
              </h2>
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Meta Title
                </label>
                <input
                  type="text"
                  name="seoTitle"
                  value={formData.seoTitle}
                  onChange={handleChange}
                  placeholder="e.g. Buy Fortune Sunflower Oil 1L Online | HelloLocal"
                  className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Meta Keywords
                </label>
                <input
                  type="text"
                  name="seoKeywords"
                  value={formData.seoKeywords}
                  onChange={handleChange}
                  placeholder="e.g. refined oil, sunflower oil, fortune oil"
                  className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                SEO Image Alt Text
              </label>
              <input
                type="text"
                name="seoImageAlt"
                value={formData.seoImageAlt}
                onChange={handleChange}
                placeholder="e.g. Fortune Sunflower Oil 1 Liter Pouch"
                className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                Meta Description
              </label>
              <textarea
                name="seoDescription"
                value={formData.seoDescription}
                onChange={handleChange}
                rows={2}
                placeholder="Search engine meta snippet for this product listing..."
                className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white resize-y"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Product Variations */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                />
              </svg>
              <h2 className="text-sm sm:text-base font-bold tracking-tight">
                Product Variations & Pricing
              </h2>
            </div>
            <span className="text-xs bg-rose-800/80 px-2.5 py-0.5 rounded-full font-semibold">
              {variations.length} {variations.length === 1 ? "Variant" : "Variants"} Added
            </span>
          </div>

          <div className="p-5 sm:p-6 space-y-5">
            {/* Variation Type */}
            <div className="max-w-md">
              <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                Select Variation Dimension
              </label>
              <select
                name="variationType"
                value={formData.variationType}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
              >
                <option value="">Standard (Default / Single Unit)</option>
                <option value="Weight">Weight (e.g. 500g, 1kg, 5kg)</option>
                <option value="Volume">Volume (e.g. 250ml, 500ml, 1L)</option>
                <option value="Size">Size (e.g. Small, Medium, Large, XL)</option>
                <option value="Pack">Pack (e.g. Pack of 2, Pack of 6)</option>
                <option value="Color">Color (e.g. Red, Blue, Black)</option>
                <option value="Flavor">Flavor (e.g. Vanilla, Chocolate)</option>
              </select>
            </div>

            {/* Add Variation Input Box */}
            <div className="bg-neutral-50/80 rounded-2xl border border-neutral-200 p-4 sm:p-5">
              <h3 className="text-xs font-bold text-neutral-700 uppercase tracking-wider mb-3">
                Add New Variant
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 mb-1 uppercase">
                    Variant Title / Value <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1kg or Red"
                    value={variationForm.title}
                    onChange={(e) =>
                      setVariationForm({ ...variationForm, title: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 mb-1 uppercase">
                    MRP / Price (₹) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 150"
                    value={variationForm.price}
                    onChange={(e) =>
                      setVariationForm({ ...variationForm, price: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 mb-1 uppercase">
                    Discount Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 135"
                    value={variationForm.discPrice}
                    onChange={(e) =>
                      setVariationForm({
                        ...variationForm,
                        discPrice: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 mb-1 uppercase">
                    Stock Available
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 50"
                    value={variationForm.stock}
                    onChange={(e) =>
                      setVariationForm({ ...variationForm, stock: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-600 mb-1 uppercase">
                    Status
                  </label>
                  <select
                    value={variationForm.status}
                    onChange={(e) =>
                      setVariationForm({
                        ...variationForm,
                        status: e.target.value as "Available" | "Sold out",
                      })
                    }
                    className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 bg-white"
                  >
                    <option value="Available">Available</option>
                    <option value="Sold out">Sold out</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={addVariation}
                  className="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-xl font-bold text-xs sm:text-sm shadow-xs transition-all active:scale-[0.98] flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Variation
                </button>
              </div>
            </div>

            {/* Variations Table */}
            {variations.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-neutral-200">
                <table className="min-w-full divide-y divide-neutral-200 text-xs sm:text-sm">
                  <thead className="bg-neutral-50 text-neutral-700 font-bold uppercase text-[11px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-left">Variant Title</th>
                      <th className="px-4 py-3 text-right">Price (₹)</th>
                      <th className="px-4 py-3 text-right">Discount (₹)</th>
                      <th className="px-4 py-3 text-right">Stock</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 bg-white">
                    {variations.map((v, idx) => (
                      <tr key={idx} className="hover:bg-neutral-50/60 transition-colors">
                        <td className="px-4 py-3 font-semibold text-neutral-900">
                          {v.title || (v as any).value}
                        </td>
                        <td className="px-4 py-3 text-right text-neutral-800 font-mono">
                          ₹{Number(v.price || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-emerald-700">
                          {v.discPrice && Number(v.discPrice) > 0
                            ? `₹${Number(v.discPrice).toFixed(2)}`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-neutral-700">
                          {v.stock}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              v.status === "Available"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                          >
                            {v.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => removeVariation(idx)}
                            className="text-xs font-bold text-red-600 hover:text-red-800 transition-colors"
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
              <div className="text-center py-6 border-2 border-dashed border-neutral-200 rounded-xl text-neutral-400 text-xs">
                No variations added yet. Use the form above to add at least one product variant.
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Other Details & Compliance */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h2 className="text-sm sm:text-base font-bold tracking-tight">
                Taxation, Manufacturer & Return Policy
              </h2>
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5">
              {/* Manufacturer */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Manufacturer
                </label>
                <input
                  type="text"
                  name="manufacturer"
                  value={formData.manufacturer}
                  onChange={handleChange}
                  placeholder="e.g. Adani Wilmar Ltd."
                  className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
                />
              </div>

              {/* Made In */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Country of Origin / Made In
                </label>
                <input
                  type="text"
                  name="madeIn"
                  value={formData.madeIn}
                  onChange={handleChange}
                  placeholder="e.g. India"
                  className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
                />
              </div>

              {/* Tax */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  GST / Tax Slab
                </label>
                <select
                  name="tax"
                  value={formData.tax}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
                >
                  <option value="">Select Tax Slab (Optional)</option>
                  {taxes.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name} ({(t as any).percentage ?? (t as any).rate}%)
                    </option>
                  ))}
                </select>
              </div>

              {/* Is Returnable */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Is Returnable?
                </label>
                <select
                  name="isReturnable"
                  value={formData.isReturnable}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
                >
                  <option value="No">No (Non-returnable item)</option>
                  <option value="Yes">Yes (Returnable)</option>
                </select>
              </div>

              {/* Max Return Days */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Max Return Window (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  name="maxReturnDays"
                  value={formData.maxReturnDays}
                  onChange={handleChange}
                  disabled={formData.isReturnable !== "Yes"}
                  placeholder={formData.isReturnable === "Yes" ? "e.g. 7" : "N/A"}
                  className={`w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px] ${
                    formData.isReturnable !== "Yes"
                      ? "opacity-60 bg-neutral-100 cursor-not-allowed"
                      : ""
                  }`}
                />
              </div>

              {/* FSSAI Lic No */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  FSSAI License No.
                </label>
                <input
                  type="text"
                  name="fssaiLicNo"
                  value={formData.fssaiLicNo}
                  onChange={handleChange}
                  placeholder="e.g. 10012021000123"
                  className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
                />
              </div>

              {/* Total Allowed Quantity */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Max Order Qty Per User
                </label>
                <input
                  type="number"
                  min="1"
                  name="totalAllowedQuantity"
                  value={formData.totalAllowedQuantity}
                  onChange={handleChange}
                  placeholder="e.g. 10"
                  className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
                />
                <span className="text-[11px] text-neutral-400 mt-1 block">
                  Capped limit on single cart checkout
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 5: Product Images */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <h2 className="text-sm sm:text-base font-bold tracking-tight">
                Product Photography & Gallery
              </h2>
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-6">
            {/* Main Feature Image */}
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                Main Cover Photo {!id && <span className="text-rose-600">*</span>}
              </label>

              <input
                ref={mainFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleMainImageChange}
                className="hidden"
              />

              {mainImagePreview ? (
                <div className="flex flex-col sm:flex-row items-center gap-4 p-4 border border-neutral-200 rounded-2xl bg-neutral-50/50">
                  <img
                    src={mainImagePreview}
                    alt="Main product"
                    className="h-32 w-32 rounded-xl object-contain bg-white border border-neutral-200 shadow-2xs p-1"
                  />
                  <div className="space-y-2 text-center sm:text-left">
                    <p className="text-xs font-bold text-neutral-800 truncate max-w-sm">
                      {mainImageFile ? mainImageFile.name : "Current cover photo"}
                    </p>
                    <p className="text-[11px] text-neutral-400">
                      Primary high-resolution image used in catalog cards & checkout
                    </p>
                    <div className="flex items-center gap-3 pt-1 justify-center sm:justify-start">
                      <button
                        type="button"
                        onClick={() => mainFileInputRef.current?.click()}
                        className="text-xs font-bold text-rose-700 hover:text-rose-800"
                      >
                        Change Photo
                      </button>
                      <span className="text-neutral-300">•</span>
                      <button
                        type="button"
                        onClick={() => {
                          setMainImageFile(null);
                          setMainImagePreview("");
                          setFormData((prev) => ({ ...prev, mainImageUrl: "" }));
                        }}
                        className="text-xs font-bold text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => mainFileInputRef.current?.click()}
                  className="border-2 border-dashed border-neutral-300 hover:border-rose-500 rounded-2xl p-6 sm:p-8 text-center cursor-pointer bg-neutral-50/40 hover:bg-rose-50/30 transition-all"
                >
                  <svg
                    className="w-8 h-8 mx-auto text-neutral-400 mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <p className="text-xs sm:text-sm font-bold text-neutral-700">
                    Click to upload main product photo
                  </p>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    JPG, PNG or WEBP (Max 5MB)
                  </p>
                </div>
              )}
            </div>

            {/* Gallery Images */}
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                Additional Gallery Photos (Optional)
              </label>

              <input
                ref={galleryFileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={handleGalleryImagesChange}
                className="hidden"
              />

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {galleryImagePreviews.map((preview, idx) => (
                  <div
                    key={idx}
                    className="relative group rounded-xl overflow-hidden border border-neutral-200 bg-white aspect-square shadow-2xs"
                  >
                    <img
                      src={preview}
                      alt={`Gallery ${idx + 1}`}
                      className="w-full h-full object-contain p-1"
                    />
                    <button
                      type="button"
                      onClick={() => removeGalleryImage(idx)}
                      className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shadow-sm transition-transform active:scale-95"
                    >
                      ×
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => galleryFileInputRef.current?.click()}
                  className="border-2 border-dashed border-neutral-300 hover:border-rose-500 rounded-xl aspect-square flex flex-col items-center justify-center text-neutral-400 hover:text-rose-700 bg-neutral-50/50 hover:bg-rose-50/30 transition-all cursor-pointer p-2"
                >
                  <svg
                    className="w-5 h-5 mb-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  <span className="text-[11px] font-bold">Add Photo</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section 6: Shop by Store Configuration */}
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200/80 overflow-hidden">
          <div className="bg-rose-700 text-white px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
              <h2 className="text-sm sm:text-base font-bold tracking-tight">
                Storefront & Hyperlocal Channel Visibility
              </h2>
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-4">
            <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3.5 rounded-xl text-xs flex items-start gap-2.5">
              <svg
                className="w-4 h-4 shrink-0 text-blue-600 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <span>
                If <strong>Show in Shop by Store only</strong> is active, this product will appear exclusively within the designated retailer shopfront and will not be displayed on general category pages.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                  Show in Shop by Store Only?
                </label>
                <select
                  name="isShopByStoreOnly"
                  value={formData.isShopByStoreOnly}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
                >
                  <option value="No">No (Standard Catalog item)</option>
                  <option value="Yes">Yes (Exclusive to specific store)</option>
                </select>
              </div>

              {formData.isShopByStoreOnly === "Yes" && (
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5 uppercase tracking-wider">
                    Designated Retail Shop <span className="text-rose-600">*</span>
                  </label>
                  <select
                    name="shopId"
                    value={formData.shopId}
                    onChange={handleChange}
                    required={formData.isShopByStoreOnly === "Yes"}
                    className="w-full px-3.5 py-2.5 border border-neutral-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-600/20 focus:border-rose-600 transition-colors bg-white min-h-[44px]"
                  >
                    <option value="">Select Shop</option>
                    {shops.map((s: any) => (
                      <option key={s._id} value={s._id}>
                        {s.name} ({s.city || "Local"})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Submission Action Bar */}
        <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
          <button
            type="button"
            onClick={() => navigate("/admin/product/list")}
            className="px-5 py-2.5 rounded-xl border border-neutral-300 text-neutral-700 font-bold text-sm hover:bg-neutral-100 transition-colors"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={uploading}
            className={`px-8 py-3 rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] flex items-center gap-2 ${
              uploading
                ? "bg-neutral-400 text-white cursor-not-allowed"
                : "bg-rose-700 hover:bg-rose-800 text-white"
            }`}
          >
            {uploading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Saving Product...
              </>
            ) : (
              <>{id ? "Update Product" : "Add Product"}</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
