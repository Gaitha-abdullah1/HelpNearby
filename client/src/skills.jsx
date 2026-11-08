const storedSkillList = (value) => {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string" && value
      ? [value]
      : [];
  const skills = [];

  for (const item of source) {
    if (typeof item !== "string") continue;
    const skill = item.trim();
    if (!skill || skills.includes(skill)) continue;
    skills.push(skill);
  }

  return skills;
};

export { storedSkillList };
