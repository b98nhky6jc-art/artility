import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";

import App from "./App.tsx";
import ArtworkDetail from "./ArtworkDetail.tsx";
import MyFinds from "./MyFinds.tsx";
import AddArtwork from "./AddArtwork.tsx";
import Signup from "./Signup.tsx";
import Login from "./Login.tsx";
import MobileNav from "./MobileNav.tsx";
import Contact from "./Contact.tsx";
import Artists from "./Artists.tsx";
import Categories from "./Categories.tsx";
import ArtistDetail from "./ArtistDetail.tsx";
import VerifyEmail from "./VerifyEmail.tsx";
import SiteHeader from "./SiteHeader.tsx";
import Moderation from "./Moderation.tsx";
import ArtWalk from "./ArtWalk.tsx";
import ArtWalkTray from "./ArtWalkTray.tsx";
import { ArtWalkProvider } from "./ArtWalkContext.tsx";
import SiteFooter from "./SiteFooter.tsx";
import Faq from "./Faq.tsx";
import Privacy from "./Privacy.tsx";
import Copyright from "./Copyright.tsx";
import ScrollToTop from "./ScrollToTop.tsx";
import { LocationProvider } from "./LocationContext.tsx";
import DiscoveryDirectory from "./DiscoveryDirectory.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <LocationProvider>
        <ArtWalkProvider>
          <ScrollToTop />
          <SiteHeader />

          <Routes>
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<App />} />
            <Route path="/artwork/:id" element={<ArtworkDetail />} />
            <Route path="/art-walk" element={<ArtWalk />} />
            <Route path="/my-finds" element={<MyFinds />} />
            <Route path="/add-artwork" element={<AddArtwork />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/copyright" element={<Copyright />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/artists" element={<Artists />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/places" element={<DiscoveryDirectory type="places" />} />
            <Route path="/places/:placeSlug" element={<App />} />
            <Route path="/tags" element={<DiscoveryDirectory type="tags" />} />
            <Route path="/tags/:tagSlug" element={<App />} />
            <Route path="/artist/:id" element={<ArtistDetail />} />
            <Route path="/admin/moderation" element={<Moderation />} />
          </Routes>

          <ArtWalkTray />
          <SiteFooter />
          <MobileNav />
        </ArtWalkProvider>
      </LocationProvider>
    </BrowserRouter>
  </StrictMode>,
);
