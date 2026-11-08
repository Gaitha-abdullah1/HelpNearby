import { escapeEmailText, renderBilingualEmail } from "./bilingualEmail.js";

const reasonText = (value) => (typeof value === "string" ? value.trim() : "");

const volunteerRejectionEmail = ({ english, arabic, language } = {}) => {
  const englishReason = reasonText(english);
  const arabicReason = reasonText(arabic);
  const safeEnglish = escapeEmailText(englishReason || "No rejection reason was recorded.");
  const safeArabic = escapeEmailText(arabicReason || "لم يُسجل سبب للرفض.");

  return renderBilingualEmail({
    language,
    subject: "HelpNearby - Volunteer Application Update | تحديث طلب التطوع",
    title: "HelpNearby - Volunteer Application Update",
    english: {
      lang: "en",
      dir: "ltr",
      align: "center",
      label: "ENGLISH",
      heading: "Volunteer Application Update",
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
          Your HelpNearby volunteer application was not approved. Thank you for your interest in helping your community.
        </p>
        <p dir="ltr" style="direction:ltr;unicode-bidi:isolate;margin:0;color:#4b5563;font-size:16px;line-height:1.6;text-align:left;">
          <strong>Reason:</strong> ${safeEnglish}
        </p>
      `,
      text: `English
-------
Your HelpNearby volunteer application was not approved.

Reason: ${englishReason || "No rejection reason was recorded."}

Thank you for your interest in helping your community.`,
    },
    arabic: {
      lang: "ar",
      dir: "rtl",
      align: "right",
      label: "العربية",
      heading: "تحديث طلب التطوع",
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
          لم تتم الموافقة على طلب التطوع الخاص بك في HelpNearby. شكراً لاهتمامك بمساعدة مجتمعك.
        </p>
        <p dir="rtl" style="direction:rtl;unicode-bidi:isolate;margin:0;color:#4b5563;font-size:16px;line-height:1.6;text-align:right;">
          <strong>السبب:</strong> ${safeArabic}
        </p>
      `,
      text: `العربية
-------
لم تتم الموافقة على طلب التطوع الخاص بك في HelpNearby.

السبب: ${arabicReason || "لم يُسجل سبب للرفض."}

شكراً لاهتمامك بمساعدة مجتمعك.`,
    },
  });
};

export default volunteerRejectionEmail;
