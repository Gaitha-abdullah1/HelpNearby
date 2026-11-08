const notificationDateLocale = (language) =>
  String(language || "").startsWith("ar") ? "ar-OM" : "en-GB";

export const formatNotificationDateTime = (value, language) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const locale = notificationDateLocale(language);
  const parts = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Muscat",
    numberingSystem: "latn",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  const hourValue = part("hour");
  const hour = locale === "ar-OM" ? hourValue.padStart(2, "0") : hourValue;
  const clock = `${hour}:${part("minute")}`;

  if (locale === "ar-OM") {
    return `${part("weekday")}، ${part("day")} ${part("month")} ${part("year")}، ${clock} ${part("dayPeriod")}`;
  }

  return `${part("weekday")}, ${part("month")} ${part("day")}, ${part("year")}, ${clock} ${part("dayPeriod").toUpperCase()}`;
};

export const formatMuscatClock = (value, language) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const locale = notificationDateLocale(language);
  const parts = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "Asia/Muscat",
    numberingSystem: "latn",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  const hour = locale === "ar-OM" ? part("hour").padStart(2, "0") : part("hour");
  const clock = `${hour}:${part("minute")}:${part("second")}`;
  const dayPeriod = locale === "ar-OM" ? part("dayPeriod") : part("dayPeriod").toUpperCase();
  return `${clock} ${dayPeriod}`;
};
