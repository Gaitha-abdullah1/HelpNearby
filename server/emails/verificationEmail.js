import { escapeEmailText, renderBilingualEmail } from "./bilingualEmail.js";

const verificationEmail = (code, language) => {
  const safeCode = escapeEmailText(code);
  const codeBox = `
    <div dir="ltr" style="direction:ltr;unicode-bidi:isolate;margin:24px auto;padding:20px;background-color:#eaf4ff;border-radius:10px;text-align:center;">
      <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#2563eb;">${safeCode}</div>
    </div>
  `;

  return renderBilingualEmail({
    language,
    subject: "HelpNearby - Email Verification | التحقق من البريد الإلكتروني",
    title: "HelpNearby - Email Verification",
    english: {
      lang: "en",
      dir: "ltr",
      align: "center",
      label: "ENGLISH",
      heading: "Verify Your Email",
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
          Thank you for creating your HelpNearby account. Use the verification code below to verify your email address.
        </p>
        ${codeBox}
        <p style="margin:0 0 12px;color:#6b7280;font-size:14px;">This code will expire in 5 minutes.</p>
        <p style="margin:0;color:#6b7280;font-size:14px;">If you did not create this account, you can safely ignore this email.</p>
      `,
      text: `English
-------
Your HelpNearby verification code is: ${code}

This code will expire in 5 minutes.

If you did not create this account, you can ignore this email.`,
    },
    arabic: {
      lang: "ar",
      dir: "rtl",
      align: "right",
      label: "العربية",
      heading: "التحقق من بريدك الإلكتروني",
      body: `
        <p style="margin:0 0 16px;color:#4b5563;font-size:16px;line-height:1.6;">
          شكراً لإنشاء حسابك في HelpNearby. استخدم رمز التحقق التالي لتأكيد بريدك الإلكتروني.
        </p>
        ${codeBox}
        <p style="margin:0 0 12px;color:#6b7280;font-size:14px;">تنتهي صلاحية هذا الرمز خلال 5 دقائق.</p>
        <p style="margin:0;color:#6b7280;font-size:14px;">إذا لم تقم بإنشاء هذا الحساب، يمكنك تجاهل هذه الرسالة.</p>
      `,
      text: `العربية
-------
رمز التحقق لحسابك في HelpNearby هو: ${code}

تنتهي صلاحية هذا الرمز خلال 5 دقائق.

إذا لم تقم بإنشاء هذا الحساب، يمكنك تجاهل هذه الرسالة.`,
    },
  });
};

export default verificationEmail;
