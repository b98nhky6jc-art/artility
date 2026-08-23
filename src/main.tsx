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
import ArtistDetail from "./ArtistDetail.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<App />} />
        <Route path="/artwork/:id" element={<ArtworkDetail />} />
        <Route path="/my-finds" element={<MyFinds />} />
        <Route path="/add-artwork" element={<AddArtwork />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/artists" element={<Artists />} />
<Route path="/artist/:id" element={<ArtistDetail />} />
      </Routes>

      <MobileNav />
    </BrowserRouter>
  </StrictMode>,
);