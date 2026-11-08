import { escapeEmailText, renderBilingualEmail } from "./bilingualEmail.js";

const passwordResetEmail = (resetLink, language) => {
  const safeLink = escapeEmailText(resetLink);
  const linkBlock = (label) => `
    <p style="margin:20px 0;text-align:center;">
      <a href="${safeLink}" dir="ltr" style="direction:ltr;display:inline-block;padding:14px 28px;background-color:#2563eb;border-radius:8px;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;">
        ${label}
      </a>
    </p>
    <p dir="ltr" style="direction:ltr;unicode-bidi:isolate;text-align:center;word-break:break-all;color:#6b7280;font-size:13px;margin:0 0 16px;">
      ${safeLink}
    </p>
  `;

  return renderBilingualEmail({
    language,
    subject: "HelpNearby - Reset Password | إعادة تعيين كلمة المرور",
    title: "HelpNearby - Reset Password",
    english: {
      lang: "en",
      dir: "ltr",
      align: "center",
      label: "ENGLISH",
      heading: "Reset Password",
      body: `
        <p style="margin:0 0 8px;color:#4b5563;font-size:16px;line-height:1.6;">
          We received a request to reset your HelpNearby password. Use the button below to choose a new password.
        </p>
        ${linkBlock("Reset Password")}
        <p style="margin:0 0 12px;color:#6b7280;font-size:14px;">This link will expire in 15 minutes.</p>
        <p style="margin:0;color:#6b7280;font-size:14px;">If you did not request a password reset, you can safely ignore this email.</p>
      `,
      text: `English
-------
We received a request to reset your HelpNearby password.

Reset your password using this link:
${resetLink}

This link will expire in 15 minutes.

If you did not request a password reset, you can ignore this email.`,
    },
    arabic: {
      lang: "ar",
      dir: "rtl",
      align: "right",
      label: "العربية",
      heading: "إعادة تعيين كلمة المرور",
      body: `
        <p style="margin:0 0 8px;color:#4b5563;font-size:16px;line-height:1.6;">
          تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك في HelpNearby. استخدم الزر التالي لاختيار كلمة مرور جديدة.
        </p>
        ${linkBlock("إعادة تعيين كلمة المرور")}
        <p style="margin:0 0 12px;color:#6b7280;font-size:14px;">تنتهي صلاحية هذا الرابط خلال 15 دقيقة.</p>
        <p style="margin:0;color:#6b7280;font-size:14px;">إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة.</p>
      `,
      text: `العربية
-------
تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك في HelpNearby.

استخدم هذا الرابط لاختيار كلمة مرور جديدة:
${resetLink}

تنتهي صلاحية هذا الرابط خلال 15 دقيقة.

إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة.`,
    },
  });
};

export default passwordResetEmail;
