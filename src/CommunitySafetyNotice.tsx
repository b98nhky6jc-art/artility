type Props = { context: "profile" | "upload" };
export default function CommunitySafetyNotice({ context }: Props) {
  return <aside className="community-safety-notice"><strong>Community reminder</strong><p>{context === "upload" ? "Only add photos you took or have permission to share. Images may become public: avoid faces, home addresses, vehicle plates and other private details." : "Use a display name you are comfortable sharing publicly. Do not include an address, phone number or other sensitive personal information."}</p></aside>;
}
