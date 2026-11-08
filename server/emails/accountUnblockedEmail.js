import { renderBilingualEmail } from "./bilingualEmail.js";

const accountUnblockedEmail = (language) => renderBilingualEmail({
  language,
  subject: "HelpNearby - Account unblocked | تم إلغاء حظر الحساب",
  title: "HelpNearby - Account unblocked",
  english: {
    lang: "en",
    dir: "ltr",
    align: "center",
    label: "ENGLISH",
    heading: "Account unblocked",
    body: `
      <p style="margin:0;color:#4b5563;font-size:16px;line-height:1.6;">
        Your HelpNearby account has been unblocked. You can sign in again.
      </p>
    `,
    text: `English
-------
Your HelpNearby account has been unblocked.

You can sign in again.`,
  },
  arabic: {
    lang: "ar",
    dir: "rtl",
    align: "right",
    label: "العربية",
    heading: "تم إلغاء حظر الحساب",
    body: `
      <p style="margin:0;color:#4b5563;font-size:16px;line-height:1.6;">
        تم إلغاء حظر حسابك في HelpNearby. يمكنك تسجيل الدخول مرة أخرى.
      </p>
    `,
    text: `العربية
-------
تم إلغاء حظر حسابك في HelpNearby.

يمكنك تسجيل الدخول مرة أخرى.`,
  },
});

export default accountUnblockedEmail;
