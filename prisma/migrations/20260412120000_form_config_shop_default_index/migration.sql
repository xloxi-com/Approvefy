-- Speed up "default form for shop" lookups (Form Builder / storefront resolution)
CREATE INDEX "FormConfig_shop_isDefault_idx" ON "FormConfig"("shop", "isDefault");
