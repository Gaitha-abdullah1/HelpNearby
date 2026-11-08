const digitsOnly = (value, maxLength) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return maxLength > 0 ? digits.slice(0, maxLength) : digits;
};

export { digitsOnly };
