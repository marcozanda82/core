/** Età in anni interi dalla data di nascita (formato YYYY-MM-DD). */
export function calculateAge(dobString) {
  if (!dobString) return null;
  const today = new Date();
  const birthDate = new Date(dobString);
  if (Number.isNaN(birthDate.getTime())) return null;
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}
