const textValue = (value) => (typeof value === "string" ? value.trim() : "");

const localizedText = (english, arabic, language) => {
  const englishText = textValue(english);
  const arabicText = textValue(arabic);
  if (language === "ar" && arabicText) return arabicText;
  return englishText;
};

export const localizedServiceName = (service, language) =>
  localizedText(service?.name, service?.nameAr, language);

export const localizedRequestService = (request, language) =>
  localizedText(request?.serviceName, request?.serviceNameAr, language);

export const localizedCategoryName = (category, language) =>
  localizedText(category?.nameEn, category?.nameAr, language);

export const localizedRejectionReason = (record, language) => {
  const legacy = textValue(record?.rejectionReason);
  const english = textValue(record?.rejectionReasonEn) || legacy;
  const arabic = textValue(record?.rejectionReasonAr) || legacy;
  return localizedText(english, arabic, language);
};
