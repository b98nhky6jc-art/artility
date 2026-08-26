type Props = { context: "profile" | "upload" };

export default function CommunitySafetyNotice({ context }: Props) {
  return context === "profile" ? (
    <aside className="community-safety-notice">
      <strong>Keep your profile comfortable to share</strong>
      <p>Choose a display name you are happy to use in a community art project. Please do not use an address, phone number, or other sensitive personal information.</p>
    </aside>
  ) : (
    <aside className="community-safety-notice">
      <strong>Before you add artwork</strong>
      <ul>
        <li>Only upload photos you took yourself or have permission to share.</li>
        <li>Submitted photos and their map location may be visible publicly.</li>
        <li>Avoid identifiable people, private homes, vehicle plates, and personal information. Do not post artwork on private property without permission.</li>
      </ul>
    </aside>
  );
}
