import { renderBilingualEmail } from "./bilingualEmail.js";

const volunteerApprovalEmail = (language) => renderBilingualEmail({
  language,
  subject: "HelpNearby - Volunteer Application Approved | تمت الموافقة على طلب التطوع",
  title: "HelpNearby - Volunteer Application Approved",
  english: {
    lang: "en",
    dir: "ltr",
    align: "center",
    label: "ENGLISH",
    heading: "Volunteer Application Approved",
    body: `
      <p style="margin:0;color:#4b5563;font-size:16px;line-height:1.6;">
        Your HelpNearby volunteer application has been approved. You can now log in to your account.
      </p>
    `,
    text: `English
-------
Your HelpNearby volunteer application has been approved.

You can now log in to your HelpNearby account.`,
  },
  arabic: {
    lang: "ar",
    dir: "rtl",
    align: "right",
    label: "العربية",
    heading: "تمت الموافقة على طلب التطوع",
    body: `
      <p style="margin:0;color:#4b5563;font-size:16px;line-height:1.6;">
        تمت الموافقة على طلب التطوع الخاص بك في HelpNearby. يمكنك الآن تسجيل الدخول إلى حسابك.
      </p>
    `,
    text: `العربية
-------
تمت الموافقة على طلب التطوع الخاص بك في HelpNearby.

يمكنك الآن تسجيل الدخول إلى حسابك.`,
  },
});

export default volunteerApprovalEmail;
