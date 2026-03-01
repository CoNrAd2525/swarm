export function tplPayerFollowUp(name, amount, currency, link) {
  const s = "Action Required: Complete Settlement";
  const t =
    "Hello " +
    name +
    ",\n\nPlease complete the settlement of " +
    amount +
    " " +
    currency +
    ". Use the link: " +
    link +
    "\n\nThank you.";
  return { subject: s, text: t };
}
export function tplCoursePurchase(name, course, link) {
  const s = "Your Course Access";
  const t =
    "Hello " +
    name +
    ",\n\nYou now have access to " +
    course +
    ". Visit: " +
    link +
    "\n\nEnjoy.";
  return { subject: s, text: t };
}
