import { renderBilingualEmail } from "./bilingualEmail.js";

const volunteerApplicationReceivedEmail = (language) => renderBilingualEmail({
  language,
  subject: "HelpNearby - Volunteer Application Received | تم استلام طلب التطوع",
  title: "HelpNearby - Volunteer Application Received",
  english: {
    lang: "en",
    dir: "ltr",
    align: "center",
    label: "ENGLISH",
    heading: "Volunteer Application Received",
    body: `
      <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
        Your email address has been verified successfully, and HelpNearby has received your volunteer application.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
        Your application is currently pending administrator review. You will receive another email when it is approved or not approved.
      </p>
      <p style="margin:0;color:#6b7280;font-size:14px;">You do not need to submit your application again.</p>
    `,
    text: `English
-------
Your HelpNearby email address has been verified successfully.

We have received your volunteer application. It is currently pending administrator review.

You will receive another email when an administrator approves or does not approve your application. You do not need to submit your application again.`,
  },
  arabic: {
    lang: "ar",
    dir: "rtl",
    align: "right",
    label: "العربية",
    heading: "تم استلام طلب التطوع",
    body: `
      <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
        تم التحقق من بريدك الإلكتروني بنجاح، واستلمنا طلب التطوع الخاص بك في HelpNearby.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
        طلبك الآن بانتظار مراجعة المسؤول. ستصلك رسالة أخرى عند الموافقة على الطلب أو عدم الموافقة عليه.
      </p>
      <p style="margin:0;color:#6b7280;font-size:14px;">لا حاجة لإرسال الطلب مرة أخرى.</p>
    `,
    text: `العربية
-------
تم التحقق من بريدك الإلكتروني بنجاح، واستلمنا طلب التطوع الخاص بك في HelpNearby.

طلبك الآن بانتظار مراجعة المسؤول. ستصلك رسالة أخرى عند الموافقة على الطلب أو عدم الموافقة عليه.

لا حاجة لإرسال الطلب مرة أخرى.`,
  },
});

export default volunteerApplicationReceivedEmail;
