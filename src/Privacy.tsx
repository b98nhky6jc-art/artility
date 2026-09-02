import { Link } from "react-router";
import "./App.css";

export default function Privacy() {
  return (
    <main className="detail-main page-main">
      <section className="page-panel information-panel">
        <Link to="/" className="back-link">← Back to map</Link>
        <h1>Privacy policy</h1>

        <p className="information-updated">Last updated 2 September 2026</p>

        <div className="information-list">
          <section>
            <h2>Who we are</h2>
            <p>Artility is a community public-art map. For privacy questions or requests, email <a href="mailto:hello@artility.co.uk">hello@artility.co.uk</a>.</p>
          </section>
          <section>
            <h2>Information we collect</h2>
            <p>When you create an account, we receive your display name, email address, verification status and the information needed to keep you signed in. If you use Google sign-in, Google supplies the account information you approve.</p>
            <p>When you contribute, we store your artwork details, photos, artwork coordinates, edits, check-ins and status reports. We also keep limited technical and security records needed to operate the service and prevent abuse.</p>
          </section>
          <section>
            <h2>How we use it</h2>
            <p>We use this information to provide accounts and collections, publish and maintain the map, verify contributions, moderate images, investigate reports, secure the service and send essential account emails.</p>
          </section>
          <section>
            <h2>What becomes public</h2>
            <p>Approved artwork photos, descriptions, artist attributions and precise artwork locations are public. Your email address, sign-in information, moderation records and individual collection are not published. Please do not upload personal information about yourself or other people.</p>
          </section>
          <section>
            <h2>Your device location</h2>
            <p>If you allow location access, Artility uses it to sort nearby artwork, centre the map, plan a walk and confirm that you are close enough to check in. Browser permission controls whether location is available. Artwork coordinates submitted to the map are public.</p>
            <p>If a device location fails while you are exploring, our hosting provider may supply a city-level location inferred from your network connection. Artility labels this as approximate and does not use it for check-ins or placing artwork.</p>
          </section>
          <section>
            <h2>Service providers</h2>
            <p>We use service providers to host Artility, store data and images, deliver email, provide maps and walking routes, reverse-geocode artwork locations, support Google sign-in and screen uploaded images for safety. They receive only the information needed to provide those services.</p>
          </section>
          <section>
            <h2>How long we keep information</h2>
            <p>Account and contribution records are kept while they are needed to run Artility, resolve reports and meet legal or security obligations. Artwork submissions containing only rejected photos are deleted after the short review period, normally 24 hours after rejection.</p>
          </section>
          <section>
            <h2>Your choices and rights</h2>
            <p>You can refuse browser location access and still browse the map. You may ask for access to, correction of or deletion of your personal information, or object to how it is used, by emailing us. We may need to verify your identity before acting on a request.</p>
          </section>
          <section>
            <h2>Changes to this policy</h2>
            <p>We may update this page as Artility changes. The date above shows the latest revision.</p>
          </section>
        </div>
      </section>
    </main>
  );
}
