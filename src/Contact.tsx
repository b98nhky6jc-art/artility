import { Link } from "react-router";
import "./App.css";

export default function Contact() {
  return (
    <div className="detail-shell">
      <header className="detail-header">
        <Link to="/" className="back-link">
          ← Back to map
        </Link>

        <span className="detail-number">Contact</span>
      </header>

      <main className="detail-main">
        <section className="contact-panel">
          <span className="eyebrow">GET IN TOUCH</span>

          <h1>Contact</h1>

          <p className="contact-intro">
            Found something wrong, know who painted an artwork, or just want
            to say hello? Get in touch.
          </p>

          <div className="contact-options">
            <div className="contact-option">
              <h2>Artwork corrections</h2>

              <p>
                Let us know if an artwork has the wrong artist, location,
                title or other details.
              </p>
            </div>

            <div className="contact-option">
              <h2>Report a problem</h2>

              <p>
                Tell us about duplicate listings, inappropriate content,
                missing artwork or anything that is not working properly.
              </p>
            </div>

            <div className="contact-option">
              <h2>General feedback</h2>

              <p>
                Ideas for the project are welcome too. This map is being
                shaped by the people using it.
              </p>
            </div>
          </div>

          <div className="contact-email">
            <span className="eyebrow">EMAIL</span>

            <p>
              <a href="mailto:YOUR_EMAIL_ADDRESS">
                YOUR_EMAIL_ADDRESS
              </a>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
