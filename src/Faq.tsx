import { Link } from "react-router";
import "./App.css";

export default function Faq() {
  return (
    <main className="detail-main page-main">
      <section className="page-panel information-panel">
        <Link to="/" className="back-link">← Back to map</Link>
        <h1>Frequently asked questions</h1>

        <div className="information-list">
          <section>
            <h2>What is Artility?</h2>
            <p>Artility is a community map for discovering public art, learning about artists, planning an art walk and keeping a collection of the work you find.</p>
          </section>
          <section>
            <h2>Do I need an account?</h2>
            <p>You can browse without one. A verified account is needed to add artwork, edit details, report a change or check in.</p>
          </section>
          <section>
            <h2>What counts as a check-in?</h2>
            <p>You can check in when you are close to an artwork. A valid new artwork upload also adds that artwork to the uploader’s collection automatically.</p>
          </section>
          <section>
            <h2>Can I add an artwork?</h2>
            <p>Yes. Add its real location and photos you took yourself or have permission to share. Avoid faces, private addresses, number plates and other personal information.</p>
          </section>
          <section>
            <h2>Why can’t I see my upload?</h2>
            <p>Every uploaded photo is checked before publication. Safe images may appear immediately; uncertain images wait for an administrator, and rejected images remain private.</p>
          </section>
          <section>
            <h2>What if an artwork has changed or disappeared?</h2>
            <p>Use the status report on its artwork page. Reports are reviewed before they change the public listing.</p>
          </section>
          <section>
            <h2>How are artists credited?</h2>
            <p>Add the artist’s name or Instagram handle when known. If an attribution or another detail is wrong, signed-in users can suggest an edit or <Link to="/contact">contact us</Link>.</p>
          </section>
          <section>
            <h2>How do I report a privacy or copyright concern?</h2>
            <p>Email <a href="mailto:hello@artility.co.uk">hello@artility.co.uk</a> with the artwork link and enough detail for us to investigate.</p>
          </section>
        </div>
      </section>
    </main>
  );
}
