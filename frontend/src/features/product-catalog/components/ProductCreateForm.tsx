import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";

import { useI18n } from "../../../i18n/I18nProvider";
import { uploadProductImage, type ProductInput } from "../../../api/commerce";
import {
  PRODUCT_CATEGORY_LABELS,
  type CatalogProduct,
  type ProductCategory,
} from "../productCatalogTypes";

const CATEGORIES = Object.keys(PRODUCT_CATEGORY_LABELS) as ProductCategory[];
const list = (value: FormDataEntryValue | null) =>
  String(value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);

type ProductCreateFormProps = {
  onCreated: (product: CatalogProduct) => void;
  onCreate: (input: ProductInput) => Promise<CatalogProduct>;
  onCancel: () => void;
  initialProduct?: CatalogProduct | null;
};

export function ProductCreateForm({
  onCreated,
  onCreate,
  onCancel,
  initialProduct = null,
}: ProductCreateFormProps) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError(null);
    if (file && file.size > 5 * 1024 * 1024) {
      event.target.value = "";
      setImageFile(null);
      setError("Ảnh không được lớn hơn 5 MB.");
      return;
    }
    setImageFile(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    let imageUrl = initialProduct?.imageUrl ?? "";
    try {
      if (imageFile) {
        imageUrl = await uploadProductImage(imageFile);
      }
    } catch {
      setError("Không thể tải ảnh lên. Hãy chọn ảnh JPG, PNG hoặc WebP dưới 5 MB.");
      setSubmitting(false);
      return;
    }
    const input: ProductInput = {
      name: String(form.get("name") ?? ""),
      category: String(form.get("category") ?? "fashion") as ProductCategory,
      description: String(form.get("description") ?? ""),
      price: Number(form.get("price")),
      stock: Number(form.get("stock")),
      colors: list(form.get("colors")),
      sizes: list(form.get("sizes")),
      imageUrl,
      arEffectType: initialProduct?.arEffectType ?? "none",
      tags: list(form.get("tags")),
      sellingPoints: list(form.get("sellingPoints")),
    };

    try {
      onCreated(await onCreate(input));
      formElement.reset();
      setImageFile(null);
    } catch {
      setError(t("productCreateError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="productCreateForm" onSubmit={(event) => void handleSubmit(event)}>
      <h3>{initialProduct ? "Cập nhật sản phẩm" : "Thêm sản phẩm vào shop"}</h3>
      <div className="productCreateGrid">
        <label>
          {t("productName")}
          <input name="name" required maxLength={120} defaultValue={initialProduct?.name} />
        </label>
        <label>
          {t("productCategory")}
          <select name="category" defaultValue={initialProduct?.category ?? "fashion"}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {PRODUCT_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("productPrice")}
          <input
            name="price"
            type="number"
            min="0"
            step="1000"
            required
            defaultValue={initialProduct?.price}
          />
        </label>
        <label>
          {t("productStock")}
          <input
            name="stock"
            type="number"
            min="0"
            step="1"
            required
            defaultValue={initialProduct?.stock}
          />
        </label>
        <label className="productCreateWide">
          {t("productDescription")}
          <textarea
            name="description"
            required
            maxLength={500}
            rows={3}
            defaultValue={initialProduct?.description}
          />
        </label>
        <label className="productCreateWide productImageUpload">
          <span>Hình ảnh sản phẩm</span>
          <input
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleImageChange}
          />
          <small>Chọn ảnh JPG, PNG hoặc WebP, tối đa 5 MB.</small>
          {imagePreviewUrl || initialProduct?.imageUrl ? (
            <img
              className="productImageUploadPreview"
              src={imagePreviewUrl ?? initialProduct?.imageUrl}
              alt="Xem trước ảnh sản phẩm"
            />
          ) : null}
        </label>
        <label>
          {t("productColors")}
          <input
            name="colors"
            placeholder={t("productListPlaceholder")}
            defaultValue={initialProduct?.colors.join(", ")}
          />
        </label>
        <label>
          {t("productSizes")}
          <input
            name="sizes"
            placeholder={t("productListPlaceholder")}
            defaultValue={initialProduct?.sizes.join(", ")}
          />
        </label>
        <label>
          {t("productTags")}
          <input
            name="tags"
            placeholder={t("productListPlaceholder")}
            defaultValue={initialProduct?.tags.join(", ")}
          />
        </label>
        <label>
          {t("productSellingPoints")}
          <input
            name="sellingPoints"
            placeholder={t("productListPlaceholder")}
            defaultValue={initialProduct?.sellingPoints.join(", ")}
          />
        </label>
      </div>
      {error ? <p className="productCreateError">{error}</p> : null}
      <div className="productCreateActions">
        <button type="button" className="secondary" disabled={submitting} onClick={onCancel}>
          {t("cancel")}
        </button>
        <button type="submit" disabled={submitting}>
          {submitting
            ? imageFile
              ? "Đang tải ảnh…"
              : "Đang lưu…"
            : initialProduct
              ? "Lưu thay đổi"
              : t("productPublish")}
        </button>
      </div>
      <p className="productCreateHint">Sản phẩm được lưu vào cửa hàng trên máy chủ.</p>
    </form>
  );
}
