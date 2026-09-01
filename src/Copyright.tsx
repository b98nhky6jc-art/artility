import { Link } from "react-router";
import "./App.css";

export default function Copyright() {
  return (
    <main className="detail-main page-main">
      <section className="page-panel information-panel">
        <Link to="/" className="back-link">← Back to map</Link>
        <h1>Copyright</h1>

        <div className="information-list">
          <section>
            <h2>Artwork</h2>
            <p>Copyright and other rights in the artworks shown on Artility remain with their artists or other rights holders. A listing on Artility does not place an artwork in the public domain or give permission to reproduce it.</p>
          </section>
          <section>
            <h2>Contributor photographs</h2>
            <p>Photographers retain any copyright they hold in photos they upload. By uploading a photo, the contributor confirms that they took it or have permission to share it and permits Artility to store, process, resize and display it as part of the service.</p>
          </section>
          <section>
            <h2>Artility</h2>
            <p>Artility’s name, branding, original written content, design and software are protected by applicable intellectual-property rights. Content may not be copied or reused unless the relevant rights holder permits it or the law otherwise allows.</p>
          </section>
          <section>
            <h2>Copyright concerns</h2>
            <p>If you own rights in an artwork or photograph and believe material on Artility should be corrected or removed, email <a href="mailto:hello@artility.co.uk">hello@artility.co.uk</a>. Include the page address, identify the material and explain your connection to it so we can investigate promptly.</p>
          </section>
        </div>
      </section>
    </main>
  );
}
