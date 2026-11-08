import { renderBilingualEmail } from "./bilingualEmail.js";

const accountBlockedEmail = (language) => renderBilingualEmail({
  language,
  subject: "HelpNearby - Account blocked | تم حظر الحساب",
  title: "HelpNearby - Account blocked",
  english: {
    lang: "en",
    dir: "ltr",
    align: "center",
    label: "ENGLISH",
    heading: "Account blocked",
    body: `
      <p style="margin:0;color:#4b5563;font-size:16px;line-height:1.6;">
        Your HelpNearby account has been blocked by an administrator.
        You cannot sign in while the account is blocked. An administrator can unblock it later.
      </p>
    `,
    text: `English
-------
Your HelpNearby account has been blocked by an administrator.

You cannot sign in while the account is blocked. An administrator can unblock it later.`,
  },
  arabic: {
    lang: "ar",
    dir: "rtl",
    align: "right",
    label: "العربية",
    heading: "تم حظر الحساب",
    body: `
      <p style="margin:0;color:#4b5563;font-size:16px;line-height:1.6;">
        تم حظر حسابك في HelpNearby من قبل المسؤول. لا يمكنك تسجيل الدخول أثناء الحظر. يمكن للمسؤول إلغاء الحظر لاحقاً.
      </p>
    `,
    text: `العربية
-------
تم حظر حسابك في HelpNearby من قبل المسؤول.

لا يمكنك تسجيل الدخول أثناء الحظر. يمكن للمسؤول إلغاء الحظر لاحقاً.`,
  },
});

export default accountBlockedEmail;
