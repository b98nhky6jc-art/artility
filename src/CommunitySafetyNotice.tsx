type Props = { context: "profile" | "upload" };
export default function CommunitySafetyNotice({ context }: Props) {
  const text = context === "upload"
    ? "Only share photos you took or may use. They may be public—avoid faces, home addresses and number plates."
    : "Keep your public profile comfortable: don’t add an address, phone number or other sensitive details.";
  return <aside className={`community-safety-notice community-safety-notice-${context}`}><span aria-hidden="true">●</span><div><strong>{context === "upload" ? "Before you upload" : "Profile privacy"}</strong><p>{text}</p></div></aside>;
}
