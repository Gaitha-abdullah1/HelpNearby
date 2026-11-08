export const escapeEmailText = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const normalizeEmailLanguage = (value) => {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (text === "ar" || text.startsWith("ar-")) return "ar";
  return "en";
};

const divider = `<hr style="margin:30px 0;border:none;border-top:1px solid #e5e7eb;" />`;

export const renderBilingualEmail = ({ language, subject, title, english, arabic }) => {
  const selected = normalizeEmailLanguage(language);
  const sections = selected === "ar" ? [arabic, english] : [english, arabic];
  const text = [
    selected === "ar" ? arabic.text : english.text,
    selected === "ar" ? english.text : arabic.text,
    "HelpNearby Team",
  ].join("\n\n");

  const htmlSections = sections.map((section) => `
    <div lang="${section.lang}" dir="${section.dir}" style="direction:${section.dir};text-align:${section.align};">
      <p style="margin:0 0 8px;color:#2563eb;font-size:13px;font-weight:bold;">${section.label}</p>
      <h2 style="color:#1f2937;margin:0 0 20px;">${section.heading}</h2>
      ${section.body}
    </div>
  `).join(divider);

  return {
    subject,
    text: text.trim(),
    html: `
      <!DOCTYPE html>
      <html lang="${selected}" dir="${selected === "ar" ? "rtl" : "ltr"}">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${escapeEmailText(title || subject)}</title>
        </head>
        <body style="margin:0;padding:0;background-color:#eaf4ff;font-family:Arial,sans-serif;">
          <div style="max-width:600px;margin:40px auto;padding:30px;background-color:#ffffff;border-radius:12px;">
            <h1 style="margin:0 0 24px;color:#2563eb;text-align:center;" dir="ltr">HelpNearby</h1>
            ${htmlSections}
            ${divider}
            <p style="margin:0;color:#9ca3af;font-size:13px;text-align:center;" dir="ltr">HelpNearby Team</p>
          </div>
        </body>
      </html>
    `,
  };
};
